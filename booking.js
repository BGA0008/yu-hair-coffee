// 預約單產生器＋價格估算器：全部在瀏覽器內計算，不會傳送任何資料。
// 客人按「用 LINE 傳送」之後，才會由客人自己在 LINE 裡按送出。
const LINE_ID = '@070fythv';
const SHOP = 'Yu Hair & Coffee';

// 價目表。fixed＝固定價；byLen＝依髮長；up＝這些髮長的價格是「起」；range＝價格區間
const SERVICES = [
  { cat: '洗', en: 'SHAMPOO', items: [
    { id: 'wash', name: '一般洗髮', fixed: 300 },
    { id: 'wash-student', name: '學生洗髮', fixed: 200 },
    { id: 'wash-oil', name: '芳香精油洗髮', fixed: 400 },
    { id: 'blow', name: '造型吹整（不含洗）', fixed: 200 },
  ] },
  { cat: '剪', en: 'CUT（不含洗）', items: [
    { id: 'cut', name: '剪髮（含大學生）', fixed: 600, upAll: true },
    { id: 'cut-hs', name: '學生剪髮（國、高中生）', fixed: 450 },
    { id: 'cut-es', name: '學生剪髮（國小生）', fixed: 350 },
    { id: 'cut-kg', name: '學生剪髮（幼稚園以下）', fixed: 300 },
    { id: 'bangs', name: '單修劉海', fixed: 100 },
  ] },
  { cat: '護', en: 'TREATMENT', items: [
    { id: 'scalp-oil', name: '角質精油頭皮護理', fixed: 1500 },
    { id: 'scalp-gel', name: '凝膠頭皮護理', fixed: 1800 },
    { id: 'tr2', name: '2 段精油護髮', byLen: { 短: 1500, 中: 1800, 長: 2200 } },
    { id: 'tr5', name: '結構式 5 段護髮', byLen: { 短: 1800, 中: 2200, 長: 2500 } },
  ] },
  { cat: '燙', en: 'PERMANENT', items: [
    { id: 'perm-cold', name: '冷燙、溫朔燙', byLen: { 短: 2500, 中: 3500, 長: 4200 }, up: ['長', '超長'] },
    { id: 'perm-straight', name: '縮毛矯正', byLen: { 短: 2800, 中: 3500, 長: 4200 }, up: ['長', '超長'] },
    { id: 'perm-root', name: '髮根增高燙（另加）', fixed: 1000 },
  ] },
  { cat: '染', en: 'COLOR', items: [
    { id: 'color', name: '單色染髮', byLen: { 短: 2200, 中: 2500, 長: 3500 }, up: ['長', '超長'] },
    { id: 'color-male', name: '單色染髮（男）', fixed: 2000 },
    { id: 'bleach', name: '挑染、去色（另加）', fixed: 1000, upAll: true },
  ] },
  { cat: '套餐', en: 'SET', items: [
    { id: 'set-color', name: '洗＋頭皮隔離油＋染＋基礎保養', byLen: { 短: 2200, 中: 2500, 中長: 3000, 長: 3500, 超長: 4000 } },
    { id: 'set-perm-cold', name: '洗＋剪＋燙＋基礎保養（冷燙）', byLen: { 短: 2200, 中: 2800, 長: 3200 } },
    { id: 'set-perm-hot', name: '洗＋剪＋燙＋基礎保養（熱燙、縮毛矯正）', byLen: { 短: 2500, 中: 3500, 長: 4000, 超長: 4500 } },
    { id: 'set-upgrade', name: '套餐升等結構式 5 段護（加購）', range: [1000, 1500] },
  ] },
];

const ITEMS = Object.fromEntries(SERVICES.flatMap((g) => g.items.map((i) => [i.id, { ...i, cat: g.cat }])));
const $ = (id) => document.getElementById(id);
const fmt = (n) => `NT$ ${n.toLocaleString('en-US')}`;
const state = { ids: new Set(), len: '中' };

// 依髮長取得單項價格；價目表沒有的髮長，用最接近的價格估算，並標示「起」
function priceFor(item, len) {
  if (item.range) return { min: item.range[0], max: item.range[1], from: true };
  if (item.fixed != null) return { min: item.fixed, max: item.fixed, from: !!item.upAll };
  const t = item.byLen;
  let key = len;
  let approx = false;
  if (t[len] == null) { key = len === '超長' ? '長' : len === '中長' ? '中' : len; approx = true; }
  const v = t[key];
  const from = approx || (item.up || []).includes(len);
  return { min: v, max: v, from };
}

function calc() {
  const lines = [];
  let min = 0, max = 0, from = false;
  const add = (name, p) => {
    lines.push({ name, ...p });
    min += p.min; max += p.max; from = from || p.from || p.max > p.min;
  };
  SERVICES.forEach((g) => g.items.forEach((item) => {
    if (state.ids.has(item.id)) add(item.name, priceFor(item, state.len));
  }));
  if (state.len === '超長') {
    if (state.ids.has('perm-cold') || state.ids.has('perm-straight')) add('超長髮加價（燙）', { min: 500, max: 1000, from: true });
    if (state.ids.has('color')) add('超長髮加價（染）', { min: 1000, max: 1000, from: true });
  }
  return { lines, min, max, from: from };
}

function lineText(l) {
  if (l.max > l.min) return `${fmt(l.min)}～${fmt(l.max)}`;
  return `${fmt(l.min)}${l.from ? ' 起' : ''}`;
}

function weekday(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '' : `週${'日一二三四五六'[d.getDay()]}`;
}

function buildMessage(c) {
  const date = $('bk-date').value;
  const time = $('bk-time').value;
  const name = $('bk-name').value.trim();
  const note = $('bk-note').value.trim();
  const rows = [`您好，我想預約 ${SHOP} 設計師 Avi。`, '', '【預約項目】'];
  c.lines.forEach((l) => rows.push(`・${l.name}（${lineText(l)}）`));
  rows.push(`【髮長】${state.len}`);
  rows.push(`【希望日期】${date ? `${date.replace(/-/g, '/')}（${weekday(date)}）` : '尚未決定，想請教可預約的時間'}`);
  rows.push(`【希望時段】${time}`);
  rows.push(`【預估金額】約 ${fmt(c.min)}${c.from ? ' 起' : ''}（依官網價目表估算，實際以現場為準）`);
  if (note) rows.push(`【備註】${note}`);
  if (name) rows.push(`【稱呼】${name}`);
  rows.push('', '麻煩協助確認時間，謝謝！');
  return rows.join('\n');
}

function update() {
  const c = calc();
  const ul = $('bk-lines');
  ul.innerHTML = '';
  c.lines.forEach((l) => {
    const li = document.createElement('li');
    const a = document.createElement('span');
    a.textContent = l.name;
    const b = document.createElement('span');
    b.textContent = lineText(l);
    li.append(a, b);
    ul.append(li);
  });
  const has = c.lines.length > 0;
  $('bk-empty').hidden = has;
  $('bk-total').textContent = has ? `${fmt(c.min)}${c.from ? ' 起' : ''}` : 'NT$ 0';
  const msg = has ? buildMessage(c) : '';
  $('bk-msg').value = msg;
  $('bk-copy').disabled = !has;
  const line = $('bk-line');
  line.setAttribute('aria-disabled', String(!has));
  line.href = has ? `https://line.me/R/oaMessage/${LINE_ID}/?${encodeURIComponent(msg)}` : '#booking';
  document.querySelectorAll('.bk-group').forEach((d) => {
    const n = [...d.querySelectorAll('input:checked')].length;
    d.querySelector('.bk-count').textContent = n ? `已選 ${n}` : '';
  });
}

// 畫出項目清單
const box = $('bk-services');
SERVICES.forEach((g) => {
  const d = document.createElement('details');
  d.className = 'bk-group';
  const s = document.createElement('summary');
  s.innerHTML = `<b>${g.cat}</b><small>${g.en}</small><em class="bk-count"></em>`;
  d.append(s);
  g.items.forEach((item) => {
    const label = document.createElement('label');
    label.className = 'bk-item';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = item.id;
    input.addEventListener('change', () => {
      input.checked ? state.ids.add(item.id) : state.ids.delete(item.id);
      update();
    });
    const span = document.createElement('span');
    span.textContent = item.name;
    label.append(input, span);
    d.append(label);
  });
  box.append(d);
});
box.querySelector('details').open = true;

document.querySelectorAll('input[name="bk-len"]').forEach((r) => r.addEventListener('change', () => {
  state.len = r.value;
  update();
}));
['bk-date', 'bk-time', 'bk-name', 'bk-note'].forEach((id) => $(id).addEventListener('input', update));

// 日期不能選過去
const today = new Date();
const pad = (n) => String(n).padStart(2, '0');
$('bk-date').min = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

$('bk-copy').addEventListener('click', async () => {
  const text = $('bk-msg').value;
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    $('bk-msg').select();
    document.execCommand('copy');
  }
  const hint = $('bk-hint');
  hint.textContent = '已複製，請貼到 LINE 傳給我們。';
  setTimeout(() => { hint.textContent = ''; }, 3000);
});
$('bk-line').addEventListener('click', (e) => {
  if ($('bk-line').getAttribute('aria-disabled') === 'true') e.preventDefault();
});

update();
