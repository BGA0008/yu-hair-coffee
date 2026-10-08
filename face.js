// 臉型與膚色分析：照片只在使用者的瀏覽器內處理，不會上傳或儲存。
// 使用 Google MediaPipe 的臉部關鍵點模型（按下按鈕才會從網路載入）。
// 結果是依比例做的粗略判斷，只能當參考。
const VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const $ = (id) => document.getElementById(id);
const btn = $('tryon-analyze');
const box = $('tryon-analysis');
const statusEl = $('tryon-status');
let landmarkerPromise = null;
let busy = false;

// 臉部比例 → 一般的髮型建議，對應網站「流行趨勢」的卡片
// （臉部關鍵點模型會讓各種臉的比例很接近，所以只分「臉長」和「下顎」兩個比較看得出差異的特徵）
const LENGTHS = {
  long: { name: '偏長', tip: '想增加橫向的份量，齊瀏海或蓬鬆的鮑伯比較平衡。', picks: ['日系齊短髮', '俐落短鮑伯'] },
  short: { name: '偏圓短', tip: '想拉長臉部線條，可以選有層次、有垂直感的長度。', picks: ['慵懶層次長髮', '俐落短鮑伯'] },
  mid: { name: '比例均衡', tip: '大部分髮型都適合，可以依喜好挑選。', picks: ['俐落短鮑伯', '日系齊短髮', '慵懶層次長髮'] },
};
const JAWS = {
  strong: { name: '較明顯', tip: '波浪和層次能柔化下顎線條。' },
  soft: { name: '柔和', tip: '' },
  pointed: { name: '下巴偏尖', tip: '髮尾有份量的鮑伯或波浪，能平衡下半部。' },
};
// 膚色傾向 → 推薦髮色（顏色代碼要和上方色塊一致）
const SWATCH_NAMES = {
  '#3b2418': '濃縮咖啡棕', '#5a2a3c': '酒紅／梅子', '#c9a06a': '奶油蜂蜜金', '#a8683a': '暖栗焦糖', '#e4dccb': '霜感冷金',
  '#b5532c': '金屬銅橘', '#6b5d52': '霧灰棕', '#a0615f': '玫瑰粉棕', '#6e6a45': '橄欖綠棕', '#5f6f80': '霧藍灰',
};
const TONES = {
  warm: { name: '偏暖（黃金調）', colors: ['#a8683a', '#c9a06a', '#b5532c', '#6e6a45'] },
  neutral: { name: '中性', colors: ['#3b2418', '#a8683a', '#a0615f', '#6b5d52'] },
  cool: { name: '偏冷（粉紅調）', colors: ['#6b5d52', '#5a2a3c', '#5f6f80', '#a0615f', '#e4dccb'] },
};

function getLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, FaceLandmarker } = await import(`${VISION_URL}/vision_bundle.mjs`);
      const fileset = await FilesetResolver.forVisionTasks(`${VISION_URL}/wasm`);
      const create = (delegate) => FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
        runningMode: 'IMAGE',
        numFaces: 1,
      });
      try { return await create('GPU'); } catch (e) { return await create('CPU'); }
    })().catch((e) => { landmarkerPromise = null; throw e; });
  }
  return landmarkerPromise;
}

function faceProfile(lm, w, h) {
  const d = (i, j) => Math.hypot((lm[i].x - lm[j].x) * w, (lm[i].y - lm[j].y) * h);
  const cheek = d(234, 454);        // 顴骨寬
  const jaw = d(172, 397);          // 下顎寬
  const length = d(10, 152);        // 臉長
  const yaw = d(1, 234) / d(1, 454); // 鼻尖到左右臉緣的比例，用來判斷有沒有轉頭
  const lr = length / cheek;
  const jr = jaw / cheek;
  return {
    len: lr >= 1.36 ? 'long' : lr <= 1.22 ? 'short' : 'mid',
    jaw: jr >= 0.82 ? 'strong' : jr <= 0.77 ? 'pointed' : 'soft',
    lr, jr,
    turned: yaw < 0.5 || yaw > 1.55,
  };
}
function rgbToLab(r, g, b) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return { L: 116 * f(Y) - 16, a: 500 * (f(X) - f(Y)), b: 200 * (f(Y) - f(Z)) };
}

function skinTone(photo, lm, w, h) {
  const c = photo.getContext('2d');
  let r = 0, g = 0, b = 0, n = 0;
  [50, 280, 205, 425].forEach((i) => {   // 兩邊臉頰
    const R = 4;
    const cx = Math.min(w - R - 1, Math.max(R, Math.round(lm[i].x * w)));
    const cy = Math.min(h - R - 1, Math.max(R, Math.round(lm[i].y * h)));
    const px = c.getImageData(cx - R, cy - R, 2 * R + 1, 2 * R + 1).data;
    for (let k = 0; k < px.length; k += 4) { r += px[k]; g += px[k + 1]; b += px[k + 2]; n++; }
  });
  const lab = rgbToLab(r / n, g / n, b / n);
  const hue = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  const key = hue >= 63 ? 'warm' : hue < 52 ? 'cool' : 'neutral';
  return { key, hue, L: lab.L };
}

function show(profile, tone) {
  const t = TONES[tone.key];
  box.innerHTML = '';
  const h3 = document.createElement('h3');
  h3.textContent = '分析結果（僅供參考）';
  box.append(h3);

  if (profile.turned) {
    const warn = document.createElement('p');
    warn.className = 'an-tip';
    warn.textContent = '照片裡的臉有轉向，臉型比例會不準，所以這張不判斷臉型。請用正面、直視鏡頭的照片再試一次。';
    box.append(warn);
  } else {
    const L = LENGTHS[profile.len];
    const J = JAWS[profile.jaw];
    const p1 = document.createElement('p');
    p1.className = 'an-line';
    p1.innerHTML = `<b>臉部比例：</b>${L.name}・下顎線條${J.name} <small>臉長/顴骨寬 ${profile.lr.toFixed(2)}・下顎/顴骨 ${profile.jr.toFixed(2)}</small>`;
    const p2 = document.createElement('p');
    p2.className = 'an-tip';
    p2.innerHTML = `${L.tip}${J.tip}可參考：${L.picks.map((n) => `<a href="#trends">${n}</a>`).join('、')}。`;
    box.append(p1, p2);
  }

  const p3 = document.createElement('p');
  p3.className = 'an-line';
  p3.innerHTML = `<b>膚色傾向：</b>${t.name}`;
  const row = document.createElement('div');
  row.className = 'swatch-row';
  t.colors.forEach((hex) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch-btn';
    b.style.setProperty('--c', hex);
    b.setAttribute('aria-pressed', 'false');
    b.title = SWATCH_NAMES[hex];
    b.innerHTML = `<span>${SWATCH_NAMES[hex]}</span>`;
    b.addEventListener('click', () => {
      document.querySelector(`#tryon-controls .swatch-row .swatch-btn[data-color="${hex}"]`)?.click();
      row.querySelectorAll('.swatch-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    row.append(b);
  });
  const note = document.createElement('p');
  note.className = 'bk-small';
  note.textContent = '這是依照片比例和顏色做的粗略判斷，會受角度、光線（尤其是黃光）和化妝影響，不是專業診斷。點選推薦的顏色，可以直接套用在上面的照片。';
  box.append(p3, row, note);
  box.hidden = false;
}
async function analyze() {
  const photo = window.tryonPhoto;
  if (!photo || busy) return;
  busy = true;
  btn.disabled = true;
  box.hidden = true;
  try {
    statusEl.textContent = '正在載入臉部辨識模型（約 3.7MB，第一次需要幾秒）…';
    statusEl.classList.add('loading');
    const landmarker = await getLandmarker();
    statusEl.textContent = '正在分析臉部比例與膚色…';
    const res = landmarker.detect(photo);
    if (!res.faceLandmarks || !res.faceLandmarks.length) {
      statusEl.textContent = '沒有偵測到臉，請用正面、臉沒被遮住的照片。';
      return;
    }
    const lm = res.faceLandmarks[0];
    const w = photo.width, h = photo.height;
    show(faceProfile(lm, w, h), skinTone(photo, lm, w, h));
    statusEl.textContent = '分析完成，結果在下方。';
  } catch (err) {
    console.error(err);
    statusEl.textContent = '無法載入臉部辨識功能，請檢查網路後再試一次。';
  } finally {
    statusEl.classList.remove('loading');
    btn.disabled = false;
    busy = false;
  }
}

btn.addEventListener('click', analyze);
// 換了新照片，就清掉舊的分析結果
document.addEventListener('tryon:photo', () => { box.hidden = true; box.innerHTML = ''; });
