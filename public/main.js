import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache = false;

// ========== 1. НАСТРОЙКА СЦЕНЫ ==========
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111122);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(3, 2, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);
controls.update();

// Освещение
const ambientLight = new THREE.AmbientLight(0x404060);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(2, 5, 3);
dirLight.castShadow = true;
scene.add(dirLight);
const fillLight = new THREE.PointLight(0x88aaff, 0.4);
fillLight.position.set(1, 2, 2);
scene.add(fillLight);

const gridHelper = new THREE.GridHelper(5, 20, 0x88aaff, 0x335588);
gridHelper.position.y = -0.8;
scene.add(gridHelper);

// ========== 2. ПЕРЕМЕННЫЕ ==========
let mixer = null;
let animationsMap = new Map();
let activeActions = [];
let similarityModel = null;
let animationEmbeddingsCache = new Map();
let currentModel = null;
let currentMode = 'combined';

// ========== 3. ЗАГРУЗКА AI ==========
async function loadAIModel() {
    const statusDiv = document.getElementById('status');
    statusDiv.innerHTML = '🧠 Загрузка AI модели (25MB)...';
    similarityModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('✅ AI модель загружена');
    statusDiv.innerHTML = '✅ AI модель готова';
    return true;
}

function cosineSimilarity(vecA, vecB) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        magA += vecA[i] * vecA[i];
        magB += vecB[i] * vecB[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function getEmbedding(text) {
    const result = await similarityModel(text, { pooling: 'mean', normalize: true });
    return result.data;
}

async function getAnimationEmbedding(animName) {
    if (animationEmbeddingsCache.has(animName)) {
        return animationEmbeddingsCache.get(animName);
    }
    const embedding = await getEmbedding(animName);
    animationEmbeddingsCache.set(animName, embedding);
    return embedding;
}

async function findBestAnimations(query, animNames, topK = 2) {
    if (!animNames.length) return [];
    const queryEmbedding = await getEmbedding(query.toLowerCase());
    const scores = [];
    for (const name of animNames) {
        const animEmbedding = await getAnimationEmbedding(name);
        const similarity = cosineSimilarity(queryEmbedding, animEmbedding);
        scores.push({ name, similarity });
    }
    scores.sort((a, b) => b.similarity - a.similarity);
    return scores.filter(s => s.similarity > 0.05).slice(0, topK);
}

// ========== 4. ПРИМЕНЕНИЕ АНИМАЦИЙ ==========
function stopAllAnimations() {
    if (!mixer) return;
    activeActions.forEach(act => { if (act && act.stop) act.stop(); });
    activeActions = [];
}

function applySingleAnimation(anim) {
    if (!mixer || !animationsMap.has(anim.name)) return;
    stopAllAnimations();
    const action = animationsMap.get(anim.name);
    action.reset().fadeIn(0.3).play();
    activeActions.push(action);
    console.log(`▶️ Одиночная: ${anim.name}`);
}

function applyCombinedAnimations(animations) {
    if (!mixer || animations.length === 0) return;
    stopAllAnimations();
    
    const mainAction = animationsMap.get(animations[0].name);
    if (mainAction) {
        mainAction.reset().fadeIn(0.5).play();
        activeActions.push(mainAction);
        console.log(`▶️ Основная: ${animations[0].name}`);
    }
    
    if (animations.length > 1 && animations[1].name !== animations[0].name) {
        const overlayAction = animationsMap.get(animations[1].name);
        if (overlayAction) {
            overlayAction.enabled = true;
            overlayAction.setEffectiveWeight(0.5);
            overlayAction.fadeIn(0.5).play();
            activeActions.push(overlayAction);
            console.log(`🔁 Наложение: ${animations[1].name}`);
        }
    }
}

// ========== 5. ЭКСПОРТ МОДЕЛИ (СТАТИЧЕСКАЯ ПОЗА) ==========
async function exportModelGLB() {
    if (!currentModel) {
        alert('Нет модели для экспорта');
        return;
    }
    
    const statusDiv = document.getElementById('status');
    statusDiv.innerHTML = '📦 Экспорт модели...';
    
    // Фиксируем текущую позу
    if (mixer) mixer.update(0);
    
    const exporter = new GLTFExporter();
    
    exporter.parse(
        currentModel,
        (result) => {
            const blob = result instanceof ArrayBuffer 
                ? new Blob([result], { type: 'model/gltf-binary' })
                : new Blob([JSON.stringify(result)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `neuromator_model_${Date.now()}.glb`;
            a.click();
            URL.revokeObjectURL(url);
            statusDiv.innerHTML = '✅ Модель экспортирована!';
        },
        (error) => {
            console.error(error);
            statusDiv.innerHTML = '❌ Ошибка экспорта';
        },
        { binary: true, trs: false, animations: [] }
    );
}

// ========== 6. ЭКСПОРТ АНИМАЦИИ В JSON ==========
async function exportAnimationJSON() {
    if (activeActions.length === 0) {
        alert('Нет активной анимации');
        return;
    }
    
    const statusDiv = document.getElementById('status');
    statusDiv.innerHTML = '📋 Экспорт анимации...';
    
    const animationsToExport = [];
    for (const action of activeActions) {
        const clip = action.getClip();
        if (clip) {
            animationsToExport.push({
                name: clip.name,
                duration: clip.duration,
                tracks: clip.tracks.map(track => ({
                    path: track.name,
                    times: Array.from(track.times),
                    values: Array.from(track.values)
                }))
            });
        }
    }
    
    const exportData = {
        format: "neuromator_animation_v1",
        version: "1.0",
        created: new Date().toISOString(),
        animations: animationsToExport
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neuromator_animation_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    statusDiv.innerHTML = '✅ JSON анимации сохранён!';
}

// ========== 7. ЗАГРУЗКА МОДЕЛИ ==========
function loadCharacter() {
    const loader = new GLTFLoader();
    const statusDiv = document.getElementById('status');
    statusDiv.innerHTML = '🔄 Загрузка 3D модели...';
    
    loader.load('./human-base-animations.glb', (gltf) => {
        if (currentModel) scene.remove(currentModel);
        currentModel = gltf.scene;
        scene.add(currentModel);
        
        mixer = new THREE.AnimationMixer(currentModel);
        animationsMap.clear();
        animationEmbeddingsCache.clear();
        
        gltf.animations.forEach(clip => {
            const action = mixer.clipAction(clip);
            animationsMap.set(clip.name, action);
        });
        
        statusDiv.innerHTML = `✅ Загружено ${animationsMap.size} анимаций`;
        console.log('📋 Анимации:', [...animationsMap.keys()]);
        
        currentModel.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        if (animationsMap.size) {
            const firstAction = [...animationsMap.values()][0];
            firstAction.play();
            activeActions = [firstAction];
        }
    }, undefined, (error) => {
        console.error(error);
        statusDiv.innerHTML = '❌ Ошибка загрузки модели';
    });
}

// ========== 8. ПОИСК ==========
async function handleSearch() {
    const query = document.getElementById('queryInput').value.trim();
    if (!query) return;
    if (animationsMap.size === 0) {
        document.getElementById('status').innerHTML = '⏳ Загрузите модель';
        return;
    }
    
    const statusDiv = document.getElementById('status');
    statusDiv.innerHTML = '🧠 Поиск...';
    const searchBtn = document.getElementById('searchBtn');
    searchBtn.disabled = true;
    
    try {
        if (!similarityModel) await loadAIModel();
        const animNames = [...animationsMap.keys()];
        
        if (currentMode === 'single') {
            const top = await findBestAnimations(query, animNames, 1);
            if (top.length === 0) throw new Error('Не найдено');
            applySingleAnimation(top[0]);
            statusDiv.innerHTML = `✅ ${top[0].name}`;
        } else {
            const topTwo = await findBestAnimations(query, animNames, 2);
            if (topTwo.length === 0) throw new Error('Не найдено');
            applyCombinedAnimations(topTwo);
            if (topTwo.length === 1) statusDiv.innerHTML = `✅ ${topTwo[0].name}`;
            else statusDiv.innerHTML = `✅ ${topTwo[0].name} + ${topTwo[1].name}`;
        }
    } catch (err) {
        console.error(err);
        statusDiv.innerHTML = `❌ ${err.message}`;
    } finally {
        searchBtn.disabled = false;
    }
}

// ========== 9. UI ==========
function initUI() {
    const queryInput = document.getElementById('queryInput');
    const searchBtn = document.getElementById('searchBtn');
    const modeToggle = document.getElementById('modeToggle');
    const exportModelBtn = document.getElementById('exportModelBtn');
    const exportAnimBtn = document.getElementById('exportAnimBtn');
    
    searchBtn.onclick = handleSearch;
    queryInput.onkeypress = (e) => { if (e.key === 'Enter') handleSearch(); };
    
    modeToggle.onclick = () => {
        currentMode = currentMode === 'single' ? 'combined' : 'single';
        modeToggle.textContent = currentMode === 'single' ? '🎭 Режим: одиночный' : '🎭 Режим: комбинированный';
        document.getElementById('status').innerHTML = `Режим: ${currentMode === 'single' ? 'одиночный' : 'комбинированный'}`;
    };
    
    exportModelBtn.onclick = exportModelGLB;
    exportAnimBtn.onclick = exportAnimationJSON;
}

// ========== 10. ЗАПУСК ==========
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    if (mixer) mixer.update(clock.getDelta());
    renderer.render(scene, camera);
}
animate();

initUI();
loadCharacter();

console.log('🚀 Нейроматор готов');