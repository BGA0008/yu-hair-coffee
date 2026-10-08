// 髮色試色：照片只在使用者的瀏覽器內處理，不會上傳或儲存。
// 頭髮辨識使用 Google MediaPipe 的 hair_segmenter 模型（第一次使用時才從網路載入）。
const VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/latest/hair_segmenter.tflite';
const MAX_SIDE = 1024;

const $ = (id) => document.getElementById(id);
const canvas = $('tryon-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const emptyBox = $('tryon-empty');
const statusEl = $('tryon-status');
const controls = $('tryon-controls');
const strengthInput = $('tryon-strength');
const customInput = $('tryon-custom');

let segmenterPromise = null;
let base = null;       // 原始像素
let out = null;        // 上色後的像素
let mask = null;       // 每個像素屬於頭髮的程度，0～1
let meanLum = 0.3;     // 頭髮平均亮度，用來保留原本的明暗與光澤
let color = [59, 36, 24];
let strength = 0.8;
let showOriginal = false;
let busy = false;

function setStatus(text, loading = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('loading', loading);
}

function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await import(`${VISION_URL}/vision_bundle.mjs`);
      const fileset = await FilesetResolver.forVisionTasks(`${VISION_URL}/wasm`);
      const create = (delegate) => ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
      try { return await create('GPU'); } catch (e) { return await create('CPU'); }
    })().catch((e) => { segmenterPromise = null; throw e; });
  }
  return segmenterPromise;
}

// 把辨識結果的邊緣變柔和，避免上色後出現鋸齒
function refineMask(raw, w, h) {
  const a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) {
    let v = (raw[i] - 0.3) / 0.45;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    a[i] = v * v * (3 - 2 * v);
  }
  return boxBlur(boxBlur(a, w, h, 2), w, h, 1);
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const dst = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / n;
      sum += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = sum / n;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return dst;
}

function render() {
  if (!base) return;
  if (showOriginal) { ctx.putImageData(base, 0, 0); return; }
  const src = base.data;
  const dst = out.data;
  dst.set(src);
  const [tr, tg, tb] = color;
  const inv = 1 / (meanLum * 255);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const m = mask[i];
    if (m < 0.01) continue;
    const r = src[p], g = src[p + 1], b = src[p + 2];
    let f = (0.299 * r + 0.587 * g + 0.114 * b) * inv;   // 這一點比頭髮平均亮或暗多少
    f = f < 0.35 ? 0.35 : f > 1.9 ? 1.9 : f;
    const a = m * strength;
    dst[p] = r + (tr * f - r) * a;
    dst[p + 1] = g + (tg * f - g) * a;
    dst[p + 2] = b + (tb * f - b) * a;
  }
  ctx.putImageData(out, 0, 0);
}

async function handleFile(file) {
  if (!file || busy) return;
  busy = true;
  controls.hidden = true;
  try {
    setStatus('正在處理照片…', true);
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * s);
    const h = Math.round(bmp.height * s);
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    base = ctx.getImageData(0, 0, w, h);
    out = new ImageData(new Uint8ClampedArray(base.data), w, h);
    // 保留一份原始照片給「臉型與膚色分析」使用
    const orig = document.createElement('canvas');
    orig.width = w;
    orig.height = h;
    orig.getContext('2d').putImageData(base, 0, 0);
    window.tryonPhoto = orig;
    document.dispatchEvent(new CustomEvent('tryon:photo'));
    canvas.hidden = false;
    emptyBox.hidden = true;

    setStatus('正在載入 AI 模型（第一次約需數秒）…', true);
    const segmenter = await getSegmenter();
    setStatus('正在辨識頭髮…', true);
    const result = segmenter.segment(canvas);
    const masks = result.confidenceMasks;
    const hair = masks.length > 1 ? masks[1] : masks[0];
    const raw = hair.getAsFloat32Array().slice();
    result.close();

    mask = refineMask(raw, w, h);
    let count = 0, lumSum = 0;
    for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
      if (mask[i] > 0.6) {
        count++;
        lumSum += 0.299 * base.data[p] + 0.587 * base.data[p + 1] + 0.114 * base.data[p + 2];
      }
    }
    if (count < mask.length * 0.005) {
      mask = null;
      setStatus('找不到頭髮，請換一張正面、光線充足、頭髮沒被遮住的照片。');
      return;
    }
    meanLum = Math.max(0.05, lumSum / count / 255);
    controls.hidden = false;
    setStatus('點選下方顏色試試看。按住照片可以看原圖。');
    render();
  } catch (err) {
    console.error(err);
    setStatus('無法載入頭髮辨識功能，請檢查網路後再試一次。');
  } finally {
    busy = false;
  }
}

function setColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  color = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  render();
}

// 事件
const selfieInput = $('tryon-selfie');
const pickInput = $('tryon-pick');
$('tryon-selfie-btn').addEventListener('click', () => selfieInput.click());
$('tryon-pick-btn').addEventListener('click', () => pickInput.click());
[selfieInput, pickInput].forEach((input) => {
  input.addEventListener('change', () => {
    handleFile(input.files[0]);
    input.value = '';
  });
});

document.querySelectorAll('.swatch-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.swatch-btn').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    btn.setAttribute('aria-pressed', 'true');
    customInput.value = btn.dataset.color;
    setColor(btn.dataset.color);
  });
});
customInput.addEventListener('input', () => {
  document.querySelectorAll('.swatch-btn').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  setColor(customInput.value);
});
strengthInput.addEventListener('input', () => {
  strength = strengthInput.value / 100;
  $('tryon-strength-val').textContent = `${strengthInput.value}%`;
  render();
});

const peek = (on) => { if (base && !!mask) { showOriginal = on; render(); } };
canvas.addEventListener('pointerdown', () => peek(true));
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => canvas.addEventListener(ev, () => peek(false)));

$('tryon-save').addEventListener('click', () => {
  canvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hair-color-preview.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
});

// 預設顏色
document.querySelector('.swatch-btn')?.click();
