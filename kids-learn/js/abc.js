/* ABC 字母: 圖片 + 聲音 + 小遊戲 + YouTube */
(function () {
  'use strict';
  const { $, esc, Speech, createQuiz, mountVideos } = Kids;

  // [大寫, 字母名稱的唸法(給語音用, 單獨唸 "A" 有些語音會唸成「呃」), 單字, 中文, 圖片]
  const LETTERS = [
    ['A', 'ay', 'apple', '蘋果', '🍎'],
    ['B', 'bee', 'ball', '球', '⚽'],
    ['C', 'see', 'cat', '貓咪', '🐱'],
    ['D', 'dee', 'dog', '小狗', '🐶'],
    ['E', 'ee', 'elephant', '大象', '🐘'],
    ['F', 'eff', 'fish', '魚', '🐟'],
    ['G', 'gee', 'grapes', '葡萄', '🍇'],
    ['H', 'aitch', 'house', '房子', '🏠'],
    ['I', 'eye', 'ice cream', '冰淇淋', '🍦'],
    ['J', 'jay', 'jacket', '外套', '🧥'],
    ['K', 'kay', 'key', '鑰匙', '🔑'],
    ['L', 'ell', 'lion', '獅子', '🦁'],
    ['M', 'em', 'monkey', '猴子', '🐵'],
    ['N', 'en', 'nose', '鼻子', '👃'],
    ['O', 'oh', 'octopus', '章魚', '🐙'],
    ['P', 'pee', 'pig', '小豬', '🐷'],
    ['Q', 'cue', 'queen', '女王', '👑'],
    ['R', 'are', 'rainbow', '彩虹', '🌈'],
    ['S', 'ess', 'sun', '太陽', '☀️'],
    ['T', 'tee', 'tiger', '老虎', '🐯'],
    ['U', 'you', 'umbrella', '雨傘', '☂️'],
    ['V', 'vee', 'violin', '小提琴', '🎻'],
    ['W', 'double you', 'whale', '鯨魚', '🐋'],
    ['X', 'ex', 'box', '盒子 (x 在最後)', '📦'],
    ['Y', 'why', 'yellow', '黃色', '💛'],
    ['Z', 'zee', 'zebra', '斑馬', '🦓'],
  ].map(([L, say, word, zh, pic], i) => ({ L, l: L.toLowerCase(), say, word, zh, pic, i, tail: L === 'X' }));

  // 單字裡和字母對應的那一個字母用顏色標出來 (X 是特例, 標在字尾)
  function wordHtml(it) {
    const k = it.tail ? it.word.length - 1 : 0;
    return `${esc(it.word.slice(0, k))}<mark>${esc(it.word[k])}</mark>${esc(it.word.slice(k + 1))}`;
  }

  const grid = $('#letters');
  grid.innerHTML = LETTERS.map((it) =>
    `<li><button class="letter-card" type="button" data-i="${it.i}" style="--h:${Math.round((it.i * 360) / 26)}" aria-label="字母 ${it.L}, ${esc(it.word)}, ${esc(it.zh)}">` +
    `<span class="lc-letters" aria-hidden="true">${it.L}<i>${it.l}</i></span>` +
    `<span class="lc-pic" aria-hidden="true">${it.pic}</span>` +
    `<span class="lc-word" aria-hidden="true">${wordHtml(it)}</span>` +
    `<span class="lc-zh" aria-hidden="true">${esc(it.zh)}</span></button></li>`).join('');
  const cards = [...grid.querySelectorAll('.letter-card')];

  let token = 0;
  let singing = false;
  const singBtn = $('#sing');

  function activate(i) { cards.forEach((c, k) => c.classList.toggle('is-active', k === i)); }
  function setSinging(v) {
    singing = v;
    singBtn.textContent = v ? '⏹ 停止' : '▶ 從 A 唸到 Z';
  }

  async function sayLetter(i) {
    const it = LETTERS[i];
    const my = ++token;
    setSinging(false);
    activate(i);
    await Speech.run([{ text: `${it.say}, ${it.word}`, lang: 'en-US' }], { rate: 0.8 });
    if (my === token) activate(-1);
  }

  async function sing() {
    if (singing) {
      token++;
      Speech.stop();
      setSinging(false);
      activate(-1);
      return;
    }
    const my = ++token;
    setSinging(true);
    // 每個字母唸成一句 "ay, apple", 這樣比分成兩句唸快很多 (每次重新啟動語音都會停頓)
    const items = LETTERS.map((it) => ({ text: `${it.say}, ${it.word}`, lang: 'en-US', pause: 500 }));
    await Speech.run(items, {
      rate: 0.8,
      onItem: (i) => {
        activate(i);
        cards[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
    });
    if (my === token) { setSinging(false); activate(-1); }
  }

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.letter-card');
    if (card) sayLetter(Number(card.dataset.i));
  });
  singBtn.addEventListener('click', sing);

  const face = (it) => `${it.L}<i>${it.l}</i>`;
  createQuiz($('#quiz'), {
    items: LETTERS,
    modes: [
      {
        id: 'ear',
        label: '🎧 聽聲音選字母',
        face,
        prompt: (it) => ({
          caption: '聽聽看, 這是哪一個字母?',
          html: '<div class="q-big" aria-hidden="true">🔊</div>',
          say: [{ text: it.say, lang: 'en-US' }],
        }),
      },
      {
        id: 'pic',
        label: '🖼️ 看圖片選字母',
        face,
        filter: (it) => !it.tail, // 盒子 box 是 b 開頭, 不能拿來考 X
        prompt: (it) => ({
          caption: '這個東西是哪個字母開頭的?',
          html: `<div class="q-big" aria-hidden="true">${it.pic}</div>`,
          say: [{ text: it.word, lang: 'en-US' }],
        }),
      },
    ],
  });

  Speech.voiceNote($('.hero'), ['en'],
    '⚠️ 這台裝置找不到<b>英文語音</b>, 英文會唸得不標準。建議改用 Chrome 或 Edge 瀏覽器 (需要連上網路); ' +
    'Windows 也可以到「設定 → 時間與語言 → 語音」新增「English (United States)」。手機和平板通常不用設定。')();

  mountVideos($('#video-shelf'), 'abc');
})();
