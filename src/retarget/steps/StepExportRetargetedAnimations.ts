import { type Scene, type AnimationClip } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter'
import { AnimationRetargetService } from '../AnimationRetargetService'

// ================= КОНФИГУРАЦИЯ =================
const CONFIG = {
    yoMoneyWallet: "4100118499721636",
    priceAmount: 1 * 75.40,
    apiUrl: '/api/generate',
    defaultSystemPrompt: `Формат ответа (ТОЛЬКО JSON):
{
  "format_version": "1.8.0",
  "animations": {
    "neuromator": {
      "loop": true,
      "nodes": {
        "Cube": { 
            "rotation": { "0": [0,0,0], "1.0": [0,0,45], ... }, 
            "scale": { "0": [1,1,1], "2.0": [2,2,2], ... }
        }
      }
    }
  }
}
Верни ТОЛЬКО JSON, без пояснений.`
};

function generatePaymentLabel() {
    return `neuro_anim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}
function showPaymentModal(onSuccess, type = 'glb', cost) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    const label = generatePaymentLabel();
    const title = type === 'glb' ? '💎 Скачать GLB файл' : '📋 Скачать JSON анимацию';
    const color = type === 'glb' ? '#4CAF50' : '#FF9800';
    
    modal.innerHTML = `<center>
        <div class="modal-content" style="border-color: ${color}">
            <h2>${title}</h2>
            <div class="price">${CONFIG.priceAmount*cost} ₽ (${CONFIG.priceAmount/75.40 * cost} $)</div>
            <p>Вы получите ${type === 'glb' ? 'GLB файл с анимацией' : 'JSON файл с анимацией'}</p>
            <hr>
            <div id="payFormContainer"></div>
            <div id="paymentStatus" style="margin-top: 15px; font-size: 12px; color: #aaa;"></div>
            <button class="close-btn">✖ Закрыть</button>
        </div></center>
    `;
    
    document.body.appendChild(modal);
    
    const formContainer = document.getElementById('payFormContainer');
    const paymentStatus = document.getElementById('paymentStatus');
    const closeBtn = modal.querySelector('.close-btn');
    
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://yoomoney.ru/quickpay/confirm.xml';
    form.target = '_blank';
    form.innerHTML = `
        <input type="hidden" name="receiver" value="${CONFIG.yoMoneyWallet}">
        <input type="hidden" name="quickpay-form" value="shop">
        <input type="hidden" name="paymentType" value="AC">
        <input type="hidden" name="sum" value="${CONFIG.priceAmount * cost}" data-type="number">
        <input type="hidden" name="label" value="${label}">
        <input type="hidden" name="successURL" value="${window.location.href}?${type}_success=${label}">
        <button type="submit" class="pay-button" style="background: ${color}">
            💸 Оплатить ${CONFIG.priceAmount*cost} ₽
        </button>
    `;
    
    formContainer.appendChild(form);
    
    const urlParams = new URLSearchParams(window.location.search);
    const paramName = `${type}_success`;
    if (urlParams.get(paramName) === label) {
        setTimeout(() => {
            paymentStatus.innerHTML = '✅ Оплата подтверждена!';
            setTimeout(() => {
                modal.remove();
                onSuccess();
            }, 1000);
        }, 500);
    }
    
    closeBtn.onclick = () => { modal.remove();  location.reload() };
    paymentStatus.innerHTML = '1️⃣ Нажмите "Оплатить"<br>2️⃣ Оплатите на сайте ЮMoney<br>3️⃣ Вернитесь на эту страницу';

}

export class StepExportRetargetedAnimations extends EventTarget {
  public animation_clips_to_export: AnimationClip[] = []

  public set_animation_clips_to_export (all_animations_clips: AnimationClip[], animation_checkboxes: number[]): void {
    this.animation_clips_to_export = []
    animation_checkboxes.forEach((indx) => {
      const original_clip: AnimationClip = all_animations_clips[indx]
      const cloned_clip: AnimationClip = original_clip.clone()
      this.animation_clips_to_export.push(cloned_clip)
    })
  }

  public export (filename = 'exported_model'): void {
    if (this.animation_clips_to_export.length === 0) {
      console.log('ERROR: No animation clips added to export')
      return
    }

    // Retarget all animation clips before export
    let retargeted_clips: AnimationClip[] = []
    retargeted_clips = this.animation_clips_to_export.map((clip) =>
      AnimationRetargetService.getInstance().retarget_animation_clip(clip)
    )
    console.log('Retargeted animation clips:', retargeted_clips)

    const target_rig_scene: Scene = AnimationRetargetService.getInstance().get_target_armature()

    showPaymentModal(async () => {
    this.export_glb(target_rig_scene, retargeted_clips, filename)
      .then(() => {
        console.log('Exported GLB successfully')
      })
      .catch((error) => { console.log('Error exporting GLB:', error) })
    }, 'glb', retargeted_clips);
  }

  public async export_glb (exported_scene: Scene, animations_to_export: AnimationClip[], file_name: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const gltf_exporter = new GLTFExporter()

      const export_options = {
        binary: true,
        onlyVisible: false,
        embedImages: true,
        animations: animations_to_export
      }

      gltf_exporter.parse(
        exported_scene,
        (result: ArrayBuffer) => {
          // Handle the result of the export
          if (result !== null) {
            this.save_array_buffer(result, `${file_name}.glb`)
            resolve() // Resolve the promise when the export is complete
          } else {
            console.log('ERROR: result is not an instance of ArrayBuffer')
            reject(new Error('Export result is not an ArrayBuffer'))
          }
        },
        (error: any) => {
          console.log('An error happened during parsing', error)
          reject(error) // Reject the promise if an error occurs
        },
        export_options
      )
    })
  }

  private save_file (blob: Blob, filename: string): void {
    const export_button_hidden_link: HTMLAnchorElement | null = document.querySelector('#download-hidden-link')
    if (export_button_hidden_link != null) {
      export_button_hidden_link.href = URL.createObjectURL(blob)
      export_button_hidden_link.download = filename
      export_button_hidden_link.click()
    } else {
      console.log('ERROR: dom_export_button_hidden_link is null')
    }
  }

  // used for GLB to turn content into a byte array for saving
  private save_array_buffer (buffer: ArrayBuffer, filename: string): void {
    this.save_file(new Blob([buffer], { type: 'application/octet-stream' }), filename)
  }
}
