/* 123 數字: 數數看 + 中文/英文/注音 + 小遊戲 + YouTube */
(function () {
  'use strict';
  const { $, esc, store, Speech, createQuiz, mountVideos } = Kids;

  /* ---------- 數字的各種寫法 ---------- */
  const ZH = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const ZY = ['ㄌㄧㄥˊ', 'ㄧ', 'ㄦˋ', 'ㄙㄢ', 'ㄙˋ', 'ㄨˇ', 'ㄌㄧㄡˋ', 'ㄑㄧ', 'ㄅㄚ', 'ㄐㄧㄡˇ', 'ㄕˊ'];
  const EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const EN_TENS = { 30: 'thirty', 40: 'forty', 50: 'fifty', 60: 'sixty', 70: 'seventy', 80: 'eighty', 90: 'ninety', 100: 'one hundred' };

  // 只處理 1~100 的整數: 十一、二十、三十 ... 一百
  function parts(n, table) {
    if (n === 100) return null;
    if (n <= 10) return [table[n]];
    if (n < 20) return [table[10], table[n - 10]];
    return n % 10 ? [table[Math.floor(n / 10)], table[10], table[n % 10]] : [table[Math.floor(n / 10)], table[10]];
  }
  const zh = (n) => (n === 100 ? '一百' : parts(n, ZH).join(''));
  const zy = (n) => (n === 100 ? 'ㄧˋ ㄅㄞˇ' : parts(n, ZY).join(' ')); // 一百的「一」要變調唸ㄧˋ
  const en = (n) => (n <= 20 ? EN[n] : EN_TENS[n]);

  // 1~10 的數數圖案, 以及好記的小提示
  const OBJ = ['🐶', '🐱', '🐰', '🐸', '🐥', '🍓', '⭐', '🐟', '🍩', '🎈'];
  const TIP = ['像鉛筆', '像鴨子', '像耳朵', '像小旗子', '像掛鉤', '像哨子', '像拐杖', '像雪人', '像氣球', '一根棒子加一顆球'];

  let lang = store.get('numLang', 'zh') === 'en' ? 'en' : 'zh';
  const say = (n) => (lang === 'zh' ? { text: zh(n), lang: 'zh-TW' } : { text: en(n), lang: 'en-US' });

  /* ---------- 畫面 ---------- */
  function card(n, big) {
    const hue = big ? (n - 1) * 36 : (n * 7) % 360;
    const objs = big ? `<span class="objs" aria-hidden="true">${`<span class="obj">${OBJ[n - 1]}</span>`.repeat(n)}</span>` : '';
    const tip = big ? `<span class="tip">${n} ${TIP[n - 1]}</span>` : '';
    return `<li><button class="num-card" type="button" data-n="${n}" style="--h:${hue}" aria-label="數字 ${n}, ${zh(n)}, ${en(n)}">` +
      `<span class="digit" aria-hidden="true">${n}</span>${objs}` +
      `<span class="zh" aria-hidden="true">${zh(n)}</span><span class="zy" aria-hidden="true">${zy(n)}</span>` +
      `<span class="en" aria-hidden="true">${en(n)}</span>${tip}</button></li>`;
  }
  const range = (a, b, step = 1) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, k) => a + k * step);

  $('#ones-list').innerHTML = range(1, 10).map((n) => card(n, true)).join('');
  $('#teens-list').innerHTML = range(11, 20).map((n) => card(n, false)).join('');
  $('#tens-list').innerHTML = range(30, 100, 10).map((n) => card(n, false)).join('');

  /* ---------- 點卡片: 一邊數一邊唸 ---------- */
  let token = 0;
  function clearActive() {
    document.querySelectorAll('.num-card').forEach((c) => c.classList.remove('is-active', 'counting'));
    document.querySelectorAll('.obj.on').forEach((o) => o.classList.remove('on'));
  }

  async function speakNumber(n, cardEl) {
    const my = ++token;
    clearActive();
    cardEl.classList.add('is-active');
    const objs = [...cardEl.querySelectorAll('.obj')];
    if (objs.length) cardEl.classList.add('counting');
    // 1~10: 從 1 數到 n, 每唸一個, 一個圖案亮起來; 其他數字直接唸
    const seq = n <= 10 ? range(1, n) : [n];
    await Speech.runList(seq.map((k) => say(k).text), say(n).lang, {
      rate: 0.8,
      onItem: (i) => { if (objs[i]) objs[i].classList.add('on'); },
    });
    if (my === token) clearActive();
  }

  document.addEventListener('click', (e) => {
    const c = e.target.closest('.num-card');
    if (c) speakNumber(Number(c.dataset.n), c);
  });

  const checkZh = Speech.voiceNote($('.hero'), ['zh-tw', 'zh-cn'], '⚠️ 這台裝置找不到<b>中文語音</b>, 沒辦法唸出來。建議改用 Chrome、Edge 或 Safari 瀏覽器。');
  const checkEn = Speech.voiceNote($('.hero'), ['en'],
    '⚠️ 這台裝置找不到<b>英文語音</b>, 英文會唸得不標準。建議改用 Chrome 或 Edge 瀏覽器 (需要連上網路); ' +
    'Windows 也可以到「設定 → 時間與語言 → 語音」新增「English (United States)」。手機和平板通常不用設定。');
  const checkVoices = () => { checkZh(lang === 'zh'); checkEn(lang === 'en'); };
  checkVoices();

  document.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
    btn.addEventListener('click', () => {
      lang = btn.dataset.lang;
      store.set('numLang', lang);
      checkVoices();
      token++;
      Speech.stop();
      clearActive();
      document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });

  /* ---------- 小遊戲 (題目是 1~10) ---------- */
  const items = range(1, 10).map((n) => ({ n }));
  const face = (it) => `${it.n}`;
  createQuiz($('#quiz'), {
    items,
    modes: [
      {
        id: 'ear',
        label: '🎧 聽聲音選數字',
        face,
        prompt: (it) => ({
          caption: '聽聽看, 這是數字幾?',
          html: '<div class="q-big" aria-hidden="true">🔊</div>',
          say: [say(it.n)],
        }),
      },
      {
        id: 'count',
        label: '🔍 數一數有幾個',
        face,
        prompt: (it) => ({
          caption: '數一數, 有幾個?',
          html: `<div class="q-objs" aria-label="${it.n} 個">${`<span>${OBJ[it.n - 1]}</span>`.repeat(it.n)}</div>`,
        }),
      },
    ],
  });

  mountVideos($('#video-shelf'), 'numbers');
})();
