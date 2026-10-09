/* 共用工具: 儲存、語音朗讀、YouTube 影片區、小遊戲、頁首 */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------- 儲存 (localStorage, 讀寫失敗時退回記憶體) ---------- */
  const mem = {};
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('kids.' + key);
        if (v !== null) return JSON.parse(v);
      } catch (e) { /* 無痕模式或被封鎖 */ }
      return key in mem ? mem[key] : fallback;
    },
    set(key, value) {
      mem[key] = value;
      try { localStorage.setItem('kids.' + key, JSON.stringify(value)); } catch (e) { /* 忽略 */ }
    },
  };

  /* ---------- 提示訊息 ---------- */
  let toastTimer;
  function toast(msg) {
    let el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.setAttribute('role', 'status');
      document.body.append(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
  }

  /* ---------- 語音朗讀 (瀏覽器內建 Web Speech API) ---------- */
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  const VOICE_FALLBACK = { 'zh-TW': ['zh-tw', 'zh-cn'], 'en-US': ['en-us', 'en-gb', 'en'] };
  let voices = [];
  if (synth) {
    const refresh = () => { voices = synth.getVoices(); };
    refresh();
    synth.addEventListener('voiceschanged', refresh);
  }

  const normLang = (v) => v.lang.replace('_', '-').toLowerCase();
  // 語音名稱裡有這些字, 通常是品質比較好的版本 (Edge 的 Natural、iPhone 下載的進階/優質版、Chrome 的 Google 線上語音)
  const VOICE_QUALITY = [
    [/natural|neural|premium|優質|高品質/i, 3],
    [/enhanced|進階|增強|加強/i, 2],
    [/siri/i, 2],
    [/online|google/i, 1],
  ];
  const voiceScore = (v) => VOICE_QUALITY.reduce((s, [re, n]) => s + (re.test(v.name) ? n : 0), 0);

  // 家長在頁面上選的語音 (每種語言各記一個), 找不到了就當作沒選
  function chosenVoice(lang) {
    const uri = store.get('voice.' + lang, null);
    return (uri && voices.find((v) => v.voiceURI === uri)) || null;
  }

  function pickVoice(lang) {
    const chosen = chosenVoice(lang);
    if (chosen) return chosen;
    for (const want of VOICE_FALLBACK[lang] || [lang.toLowerCase()]) {
      const pool = voices.filter((v) => (want.length === 2 ? normLang(v).startsWith(want) : normLang(v) === want));
      if (pool.length) return pool.sort((a, b) => voiceScore(b) - voiceScore(a))[0];
    }
    return null; // 找不到就只設 lang, 讓瀏覽器自己挑
  }

  // 給「換聲音」選單用: 這台裝置上某個語言 (prefix 例如 'zh') 的所有語音, 台灣國語排最前面
  function voicesFor(prefix) {
    const rank = (v) => (normLang(v) === 'zh-tw' ? 0 : normLang(v) === 'zh-cn' ? 1 : 2);
    return voices.filter((v) => normLang(v).startsWith(prefix)).sort((a, b) => rank(a) - rank(b) || voiceScore(b) - voiceScore(a));
  }

  let gen = 0;          // 每次 stop()/run() 都 +1, 舊的朗讀序列看到不一樣就自行結束
  let release = null;   // 讓 stop() 能立刻放行正在等待的那一句
  let current = null;   // 保留 utterance 參照, 避免 Chrome 提早回收而收不到 onend
  let warned = false;

  function speakOne(item, opts) {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = item.lang || 'zh-TW';
      const rate = item.rate ?? (typeof opts.rate === 'function' ? opts.rate() : opts.rate) ?? 1;
      u.rate = rate;
      const v = pickVoice(u.lang);
      if (v) {
        u.voice = v;
        // 選了別種口音的語音 (例如大陸國語) 時, lang 也跟著改, 避免有的瀏覽器因為兩者不一致而換掉語音
        if (normLang(v) !== u.lang.toLowerCase()) u.lang = v.lang;
      }
      current = u;
      let done = false;
      const timer = setTimeout(() => finish(), Math.max(4000, (item.text.length * 700) / rate + 2000));
      function finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        release = null;
        resolve();
      }
      if (item.onStart) u.onstart = item.onStart;
      if (item.onBoundary) u.onboundary = item.onBoundary;
      u.onend = finish;
      u.onerror = (e) => {
        if (e.error !== 'canceled' && e.error !== 'interrupted' && !warned) {
          warned = true;
          toast('這個瀏覽器沒辦法發出聲音。請改用 Chrome、Edge 或 Safari 試試看。');
        }
        finish();
      };
      release = finish;
      synth.speak(u);
    });
  }

  function stop() {
    gen++;
    if (synth) synth.cancel();
    if (release) release();
  }

  /**
   * 依序朗讀 items: [{ text, lang, rate?, pause? }]
   * 回傳 true 表示整串唸完; false 表示中途被 stop() 或另一次 run() 打斷。
   * opts: { onItem(i, item), rate (數字或函式), pause (每句之間的毫秒) }
   */
  async function run(items, opts = {}) {
    if (!synth) {
      if (!warned) { warned = true; toast('這個瀏覽器不支援語音朗讀。請改用 Chrome、Edge 或 Safari。'); }
      return false;
    }
    const busy = synth.speaking || synth.pending;
    stop();
    const my = gen;
    if (busy) await sleep(80); // Chrome 剛 cancel 完馬上 speak, 偶爾會被吃掉
    for (let i = 0; i < items.length; i++) {
      if (my !== gen) return false;
      if (opts.onItem) opts.onItem(i, items[i]);
      await speakOne(items[i], opts);
      if (my !== gen) return false;
      const gap = items[i].pause ?? opts.pause;
      if (gap) await sleep(gap);
    }
    return my === gen;
  }

  /**
   * 把一串短詞 (例如 一、二、三) 合成一句唸, 靠語音的「字詞邊界」事件通知唸到第幾個 (opts.onItem(i))。
   * 比一個一個分開唸順暢很多, 因為每次重新啟動語音都會停頓半秒以上。
   * 如果這個語音不提供邊界事件 (有些手機瀏覽器就沒有), 改成用固定間隔推進。
   */
  function runList(words, lang, opts = {}) {
    const sep = lang.startsWith('zh') ? '，' : ', ';
    const starts = [];
    let pos = 0;
    words.forEach((w) => { starts.push(pos); pos += w.length + sep.length; });
    let shown = -1;
    let sawBoundary = false;
    let waitTimer = null;
    let tickTimer = null;
    const show = (i) => {
      if (i === shown || i >= words.length) return;
      shown = i;
      if (opts.onItem) opts.onItem(i);
    };
    const cleanup = () => { clearTimeout(waitTimer); clearInterval(tickTimer); };
    const item = {
      text: words.join(sep),
      lang,
      onStart() {
        waitTimer = setTimeout(() => {
          if (sawBoundary) return;
          show(0);
          tickTimer = setInterval(() => show(shown + 1), 750);
        }, 1500);
      },
      onBoundary(e) {
        if (e.name && e.name !== 'word') return;
        sawBoundary = true;
        clearInterval(tickTimer);
        let i = 0;
        while (i + 1 < starts.length && starts[i + 1] <= e.charIndex) i++;
        show(i);
      },
    };
    return run([item], { rate: opts.rate }).finally(cleanup);
  }

  // 語音清單在 Chrome 是非同步載入的, 要等載入完才能判斷「真的沒有」
  function whenVoicesReady(cb) {
    if (!synth) return;
    if (voices.length) return cb();
    let called = false;
    const go = () => { if (!called && voices.length) { called = true; cb(); } };
    synth.addEventListener('voiceschanged', go);
    setTimeout(go, 1500);
  }
  function hasVoice(prefixes) {
    return voices.some((v) => prefixes.some((p) => normLang(v).startsWith(p)));
  }
  /**
   * 在 host 裡放一則提醒: 這台裝置沒有 prefixes (例如 ['en']) 的語音時才顯示。
   * 回傳 check(needed): 之後可以再呼叫來重新判斷 (例如切換語言時)。
   */
  function voiceNote(host, prefixes, html) {
    const el = document.createElement('div');
    el.className = 'voice-warning';
    el.setAttribute('role', 'note');
    el.hidden = true;
    el.innerHTML = html;
    host.append(el);
    return (needed = true) => whenVoicesReady(() => { el.hidden = !needed || hasVoice(prefixes); });
  }

  // iPad 的 Safari 會假裝成 Mac, 所以還要看有沒有觸控
  function detectPlatform(ua, platform, touchPoints) {
    return {
      ios: /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1),
      android: /Android/i.test(ua),
    };
  }

  const Speech = {
    run, runList, stop, voiceNote, voicesFor, whenReady: whenVoicesReady,
    supported: !!synth,
    getVoiceUri: (lang) => (chosenVoice(lang) ? chosenVoice(lang).voiceURI : ''),
    setVoice: (lang, uri) => store.set('voice.' + lang, uri || null),
  };

  /* ---------- 答題音效 ---------- */
  let audioCtx;
  function chime(ok) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      (ok ? [660, 880, 1320] : [300, 220]).forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const t = t0 + i * 0.11;
        o.type = ok ? 'triangle' : 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g).connect(audioCtx.destination);
        o.start(t);
        o.stop(t + 0.2);
      });
    } catch (e) { /* 沒有音效也沒關係 */ }
  }

  /* ---------- 頁首 ---------- */
  const NAV = [
    { id: 'poems', href: 'poems.html', icon: '📜', label: '唐詩' },
    { id: 'abc', href: 'abc.html', icon: '🔤', label: 'ABC' },
    { id: 'numbers', href: 'numbers.html', icon: '🔢', label: '123' },
  ];
  const header = $('#site-header');
  if (header) {
    header.className = 'site-header';
    header.innerHTML =
      '<a class="brand" href="index.html"><span aria-hidden="true">🌈</span> 小小學習樂園</a>' +
      '<nav aria-label="主選單">' +
      NAV.map((n) => `<a href="${n.href}"${n.id === header.dataset.active ? ' aria-current="page"' : ''}><span aria-hidden="true">${n.icon}</span> ${n.label}</a>`).join('') +
      '</nav>';
  }

  /* ---------- YouTube 影片區 ---------- */
  const YT_ID = /^[\w-]{11}$/;
  // 直接用檔案方式(file://)開啟時, YouTube 會拒絕嵌入, 改成在新分頁開啟
  const canEmbed = /^https?:$/.test(location.protocol);

  function parseYouTubeId(input) {
    const s = String(input).trim();
    if (YT_ID.test(s)) return s;
    try {
      const u = new URL(s);
      const host = u.hostname.replace(/^(www|m)\./, '');
      let id = null;
      if (host === 'youtu.be') id = u.pathname.slice(1, 12);
      else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        id = u.searchParams.get('v');
        if (!id) {
          const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
          id = m && m[1];
        }
      }
      return id && YT_ID.test(id) ? id : null;
    } catch (e) {
      return null;
    }
  }

  function mountVideos(root, key) {
    const defaults = (window.VIDEOS && window.VIDEOS[key]) || [];
    const storeKey = 'videos.' + key;
    let custom = store.get(storeKey, []);

    root.innerHTML =
      '<div class="theater" hidden></div>' +
      '<ul class="video-grid"></ul>' +
      (canEmbed ? '' : '<p class="note">目前是直接開啟檔案, 影片會在新的分頁用 YouTube 開啟。</p>') +
      '<details class="parent-box"><summary>👨‍👩‍👧 家長區: 新增自己挑的影片</summary>' +
      '<form class="add-video">' +
      '<label>YouTube 網址<input name="url" type="url" required placeholder="https://www.youtube.com/watch?v=..." autocomplete="off"></label>' +
      '<label>名稱 (選填)<input name="title" maxlength="40" placeholder="例如: 阿姨教的 ABC 歌" autocomplete="off"></label>' +
      '<button class="btn" type="submit">＋ 新增影片</button>' +
      '<p class="form-msg" role="status"></p>' +
      '</form></details>';

    const theater = $('.theater', root);
    const grid = $('.video-grid', root);
    const msg = $('.form-msg', root);

    function render() {
      const all = defaults.map((v) => ({ ...v, custom: false })).concat(custom.map((v) => ({ ...v, custom: true })));
      grid.innerHTML = all.map((v) =>
        `<li class="video-item"><button class="video-card" type="button" data-id="${esc(v.id)}" data-title="${esc(v.title)}">` +
        `<span class="thumb"><img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy"><span class="play" aria-hidden="true">▶</span></span>` +
        `<span class="v-title">${esc(v.title)}</span><span class="v-by">${esc(v.by || '')}</span></button>` +
        (v.custom ? `<button class="video-remove" type="button" data-remove="${esc(v.id)}" aria-label="移除影片 ${esc(v.title)}">✕</button>` : '') +
        '</li>').join('');
    }

    function play(id, title) {
      Speech.stop();
      if (!canEmbed) {
        window.open('https://www.youtube.com/watch?v=' + id, '_blank', 'noopener');
        return;
      }
      theater.hidden = false;
      theater.innerHTML =
        '<div class="frame"><iframe src="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1&hl=zh-TW" ' +
        'title="' + esc(title) + '" allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" ' +
        'referrerpolicy="strict-origin-when-cross-origin"></iframe></div>' +
        '<button class="btn btn-ghost" type="button" data-close>✕ 關閉影片</button>';
      theater.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    root.addEventListener('click', (e) => {
      const card = e.target.closest('.video-card');
      if (card) return play(card.dataset.id, card.dataset.title);
      const rm = e.target.closest('[data-remove]');
      if (rm) {
        custom = custom.filter((v) => v.id !== rm.dataset.remove);
        store.set(storeKey, custom);
        return render();
      }
      if (e.target.closest('[data-close]')) {
        theater.hidden = true;
        theater.innerHTML = ''; // 移除 iframe 才會真的停止播放
      }
    });

    $('.add-video', root).addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const id = parseYouTubeId(form.url.value);
      if (!id) { msg.textContent = '看不懂這個網址, 請貼上 YouTube 影片的網址。'; return; }
      if (defaults.some((v) => v.id === id) || custom.some((v) => v.id === id)) {
        msg.textContent = '這支影片已經在清單裡了。';
        return;
      }
      custom.push({ id, title: form.title.value.trim() || '我的影片', by: '家長新增' });
      store.set(storeKey, custom);
      form.reset();
      msg.textContent = '已新增!';
      render();
    });

    render();
  }

  /* ---------- 小遊戲 (選擇題) ----------
   * cfg.items  題庫
   * cfg.modes  [{ id, label, prompt(item) -> { caption, html, say:[{text,lang}] }, face(item) -> 選項按鈕的 HTML, filter?(item) -> 這個題型可以用的題目 }]
   */
  function createQuiz(root, cfg) {
    let mode = cfg.modes[0];
    const pool = () => (mode.filter ? cfg.items.filter(mode.filter) : cfg.items); // 有些題型不能用全部題目
    const total = () => Math.min(cfg.rounds || 10, pool().length);
    let ROUNDS = total();
    let order = [];
    let round = 0;
    let score = 0;
    let missed = false;
    let target = null;

    root.innerHTML =
      '<div class="quiz-modes" role="group" aria-label="遊戲種類">' +
      cfg.modes.map((m, i) => `<button class="chip" type="button" data-mode="${m.id}" aria-pressed="${i === 0}">${m.label}</button>`).join('') +
      '</div><div class="quiz-board"></div>';
    const board = $('.quiz-board', root);

    function showStart() {
      Speech.stop();
      ROUNDS = total();
      board.innerHTML = '<div class="quiz-start"><p>準備好了嗎? 一共 ' + ROUNDS + ' 題, 答對會得到星星 ⭐</p><button class="btn btn-big" type="button" data-start>🎮 開始玩</button></div>';
    }

    function start() {
      order = shuffle(pool()).slice(0, ROUNDS);
      round = 0;
      score = 0;
      next();
    }

    function next() {
      if (round >= ROUNDS) return finish();
      target = order[round];
      missed = false;
      const q = mode.prompt(target);
      const others = shuffle(pool().filter((it) => it !== target)).slice(0, 3);
      const options = shuffle([target, ...others]);
      board.innerHTML =
        `<div class="quiz-status"><span>第 ${round + 1} / ${ROUNDS} 題</span><span>⭐ ${score}</span></div>` +
        `<p class="q-caption">${q.caption}</p>` +
        `<div class="q-stage">${q.html || ''}${q.say ? '<button class="btn btn-ghost" type="button" data-hear>🔊 再聽一次</button>' : ''}</div>` +
        '<div class="quiz-choices">' + options.map((o, i) => `<button class="choice" type="button" data-k="${i}">${mode.face(o)}</button>`).join('') + '</div>' +
        '<p class="quiz-msg" role="status"></p>';
      board._options = options;
      board._say = q.say;
      if (q.say) Speech.run(q.say, { rate: 0.85 });
    }

    function finish() {
      Speech.stop();
      const stars = '⭐'.repeat(score) || '🌱';
      const praise = score === ROUNDS ? '全部答對, 太厲害了!' : score >= ROUNDS * 0.7 ? '很棒喔!' : '多玩幾次就會更熟了!';
      board.innerHTML = `<div class="quiz-start"><p class="q-result">🎉 答對 ${score} / ${ROUNDS} 題</p><p class="q-stars" aria-hidden="true">${stars}</p><p>${praise}</p><button class="btn btn-big" type="button" data-start>🔁 再玩一次</button></div>`;
      chime(true);
    }

    root.addEventListener('click', (e) => {
      const modeBtn = e.target.closest('[data-mode]');
      if (modeBtn) {
        mode = cfg.modes.find((m) => m.id === modeBtn.dataset.mode);
        root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b === modeBtn)));
        return showStart();
      }
      if (e.target.closest('[data-start]')) return start();
      if (e.target.closest('[data-hear]')) return board._say && Speech.run(board._say, { rate: 0.85 });
      const choice = e.target.closest('.choice');
      if (!choice || choice.disabled) return;
      const picked = board._options[Number(choice.dataset.k)];
      const msg = $('.quiz-msg', board);
      if (picked === target) {
        chime(true);
        if (!missed) score++;
        choice.classList.add('correct');
        board.querySelectorAll('.choice').forEach((b) => { b.disabled = true; });
        msg.textContent = missed ? '答對了!' : '答對了! ⭐';
        round++;
        setTimeout(next, 1200);
      } else {
        chime(false);
        missed = true;
        choice.classList.add('wrong');
        choice.disabled = true;
        msg.textContent = '再試試看~';
      }
    });

    showStart();
  }

  const platform = detectPlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints || 0);
  window.Kids = { $, esc, sleep, shuffle, store, toast, Speech, chime, mountVideos, createQuiz, platform, detectPlatform };
})();
