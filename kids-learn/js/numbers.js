/* 123 數字: 數數看 + 中文/英文/注音 + 小遊戲 + YouTube */
(function () {
  'use strict';
  const { $, esc, store, Speech, createQuiz, mountVideos } = Kids;

  /* ---------- 數字的各種寫法 ---------- */
  const ZH = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const ZY = ['ㄌㄧㄥˊ', 'ㄧ', 'ㄦˋ', 'ㄙㄢ', 'ㄙˋ', 'ㄨˇ', 'ㄌㄧㄡˋ', 'ㄑㄧ', 'ㄅㄚ', 'ㄐㄧㄡˇ', 'ㄕˊ'];
  const EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const EN_TENS = { 20: 'twenty', 30: 'thirty', 40: 'forty', 50: 'fifty', 60: 'sixty', 70: 'seventy', 80: 'eighty', 90: 'ninety', 100: 'one hundred' };

  // 只處理 1~100 的整數: 十一、二十、三十 ... 一百
  function parts(n, table) {
    if (n === 100) return null;
    if (n <= 10) return [table[n]];
    if (n < 20) return [table[10], table[n - 10]];
    return n % 10 ? [table[Math.floor(n / 10)], table[10], table[n % 10]] : [table[Math.floor(n / 10)], table[10]];
  }
  const zh = (n) => (n === 100 ? '一百' : parts(n, ZH).join(''));
  const zy = (n) => (n === 100 ? 'ㄧˋ ㄅㄞˇ' : parts(n, ZY).join(' ')); // 一百的「一」要變調唸ㄧˋ
  // 21~99 要接上個位數: twenty-one, thirty-five ...
  const en = (n) => (n <= 20 || n % 10 === 0 ? EN[n] || EN_TENS[n] : `${EN_TENS[n - (n % 10)]}-${EN[n % 10]}`);

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
    endSequence(true);
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

  /* ---------- 連續唸 ----------
   * 頁面上方: 從 1 一路唸到 10 / 20 / 100, 用大字舞台顯示目前的數字
   * 每個區塊 (1~10、11~20、30~100) 自己的按鈕: 只唸這一段, 唸到哪個數字, 哪張卡片就亮起來
   */
  const PLAYS = {
    'top-10': { nums: range(1, 10), stage: true },
    'top-20': { nums: range(1, 20), stage: true },
    'top-100': { nums: range(1, 100), stage: true },
    ones: { nums: range(1, 10) },
    teens: { nums: range(11, 20) },
    tens: { nums: range(30, 100, 10) },
  };
  const playBtns = [...document.querySelectorAll('[data-play]')];
  const stage = $('#stage');
  let playingId = ''; // 目前正在連續唸的是哪一個按鈕 ('' = 沒有在唸)

  function renderPlayButtons() {
    playBtns.forEach((b) => {
      const on = b.dataset.play === playingId;
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? '⏹ 停止' : `▶ ${b.dataset.label}`;
    });
  }

  function showStage(n, end) {
    stage.hidden = false;
    stage.innerHTML =
      `<div class="stage-num">${n}</div><div class="stage-zh">${zh(n)}</div>` +
      `<div class="stage-zy">${zy(n)}</div><div class="stage-en">${en(n)}</div>` +
      `<div class="stage-bar" aria-hidden="true"><span style="width:${(n / end) * 100}%"></span></div>`;
  }

  // 唸到 n 了: 大字舞台顯示它, 或讓 n 的那張卡片亮起來 (只有有卡片的數字才會亮, 21~99 沒有卡片所以用舞台)
  function highlightNumber(n, play) {
    if (play.stage) return showStage(n, play.nums[play.nums.length - 1]);
    clearActive();
    const c = document.querySelector(`.num-card[data-n="${n}"]`);
    if (!c) return;
    c.classList.add('is-active');
    c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // 結束 (唸完、被停止或被打斷): 按鈕復原; 卡片的亮起一律清掉, 舞台只有在被中斷時才收起來 (唸完就停在最後一個數字)
  function endSequence(hideStage) {
    playingId = '';
    renderPlayButtons();
    clearActive();
    if (hideStage) stage.hidden = true;
  }

  async function playNumbers(id) {
    const play = PLAYS[id];
    const my = ++token;
    clearActive();
    stage.hidden = true;
    playingId = id;
    renderPlayButtons();
    // 每 10 個數字唸一段: 一次唸太長的話, 有些語音 (例如 Chrome 的線上語音) 會在 15 秒左右被截斷
    for (let s = 0; s < play.nums.length; s += 10) {
      const chunk = play.nums.slice(s, s + 10);
      const finished = await Speech.runList(chunk.map((k) => say(k).text), say(1).lang, {
        rate: 0.8,
        onItem: (i) => { if (my === token) highlightNumber(chunk[i], play); },
      });
      if (my !== token) return; // 被按鈕、卡片或切換語言打斷, 畫面由打斷的那一方收尾
      if (!finished) { endSequence(true); return; } // 被小遊戲或影片之類的聲音打斷
    }
    endSequence(false);
  }

  playBtns.forEach((b) => b.addEventListener('click', () => {
    if (playingId === b.dataset.play) { // 再按一次 = 停止
      token++;
      Speech.stop();
      endSequence(true);
      return;
    }
    playNumbers(b.dataset.play);
  }));

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
      endSequence(true);
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
