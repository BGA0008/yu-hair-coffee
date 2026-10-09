/* 唐詩三百首: 點選播放、播放排行 Top 10 */
(function () {
  'use strict';
  const { $, esc, store, Speech } = Kids;
  const POEMS = window.POEMS || [];
  const byId = new Map(POEMS.map((p) => [p.id, p]));

  const TYPES = ['全部'].concat([...new Set(POEMS.map((p) => p.k))]);
  const HINTS = {
    '五言絕句': '每首只有 20 個字, 最短最好背, 很適合從這裡開始!',
    '七言絕句': '每首 28 個字, 唸起來很有節奏。',
    '五言律詩': '每首 40 個字。',
    '七言律詩': '每首 56 個字, 比較長一點。',
    '五言古詩': '長度不一, 有些比較長, 等大一點再挑戰。',
    '七言古詩': '長度不一, 有些很長, 等大一點再挑戰。',
    '樂府': '長度不一, 有些很長, 等大一點再挑戰。',
  };

  let plays = store.get('poemPlays', {}); // { 詩的id: { n: 播放次數, t: 最近播放時間 } }
  let rate = Number(store.get('poemRate', 0.8)) || 0.8;
  let type = '全部';
  let query = '';
  let nowId = null;
  let playing = false;
  let runToken = 0;

  const els = {
    top10: $('#top10'), topEmpty: $('#top10-empty'), reset: $('#reset-plays'),
    q: $('#q'), chips: $('#type-chips'), hint: $('#type-hint'),
    count: $('#result-count'), list: $('#poem-list'), noResult: $('#no-result'),
    player: $('#player'), plTitle: $('#pl-title'), plLines: $('#pl-lines'), plToggle: $('#pl-toggle'),
  };

  /* ---------- 畫面 ---------- */
  function renderTop10() {
    const ranked = Object.entries(plays)
      .map(([id, v]) => ({ p: byId.get(Number(id)), n: v.n, t: v.t }))
      .filter((x) => x.p && x.n > 0)
      .sort((a, b) => b.n - a.n || b.t - a.t)
      .slice(0, 10);
    els.top10.innerHTML = ranked.map((x, i) =>
      `<li><button class="top-item" type="button" data-id="${x.p.id}" aria-label="播放 ${esc(x.p.t)}, 第 ${i + 1} 名, 已播放 ${x.n} 次">` +
      `<span class="rank${i < 3 ? ' medal' : ''}" aria-hidden="true">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>` +
      `<span><span class="t">${esc(x.p.t)}</span><span class="a">${esc(x.p.a)}</span></span>` +
      `<span class="n" aria-hidden="true">▶ ${x.n} 次</span></button></li>`).join('');
    els.topEmpty.hidden = ranked.length > 0;
    els.reset.hidden = ranked.length === 0;
    markPlaying();
  }

  function matches(p) {
    if (type !== '全部' && p.k !== type) return false;
    if (!query) return true;
    return p.t.includes(query) || p.a.includes(query) || p.l.join('').includes(query);
  }

  function renderList() {
    const shown = POEMS.filter(matches);
    els.list.innerHTML = shown.map((p) =>
      `<li><button class="poem-card" type="button" data-id="${p.id}" aria-pressed="false">` +
      '<span class="go" aria-hidden="true">▶</span>' +
      `<span><span class="t">${esc(p.t)}</span><span class="a">${esc(p.a)}</span><span class="first">${esc(p.l[0])}</span></span>` +
      '</button></li>').join('');
    els.count.textContent = `共 ${shown.length} 首`;
    els.noResult.hidden = shown.length > 0;
    markPlaying();
  }

  function renderChips() {
    els.chips.innerHTML = TYPES.map((t) => {
      const n = t === '全部' ? POEMS.length : POEMS.filter((p) => p.k === t).length;
      return `<button class="chip" type="button" data-type="${esc(t)}" aria-pressed="${t === type}">${esc(t)} (${n})</button>`;
    }).join('');
    els.hint.textContent = HINTS[type] || '';
  }

  // 只切換樣式, 不重畫清單, 這樣鍵盤焦點不會跑掉
  function markPlaying() {
    document.querySelectorAll('[data-id]').forEach((el) => {
      const on = playing && Number(el.dataset.id) === nowId;
      el.classList.toggle('is-playing', on);
      const go = el.querySelector('.go');
      if (go) { go.textContent = on ? '🔊' : '▶'; el.setAttribute('aria-pressed', String(on)); }
    });
  }

  /* ---------- 播放區 ---------- */
  function fitPadding() {
    document.body.style.paddingBottom = els.player.hidden ? '' : els.player.offsetHeight + 'px';
  }

  function openPlayer(p) {
    els.plTitle.innerHTML = `${esc(p.t)}<small>${esc(p.a)}</small>`;
    els.plLines.innerHTML = p.l.map((l) => `<p>${esc(l)}</p>`).join('');
    els.plLines.scrollTop = 0;
    els.player.hidden = false;
    updateToggle();
    fitPadding();
  }

  function updateToggle() {
    els.plToggle.textContent = playing ? '⏹ 停止' : '🔁 再聽一次';
  }

  function highlight(i) {
    const rows = els.plLines.children;
    for (let k = 0; k < rows.length; k++) rows[k].classList.toggle('is-reading', k === i);
    const row = rows[i];
    if (row) els.plLines.scrollTo({ top: row.offsetTop - (els.plLines.clientHeight - row.clientHeight) / 2, behavior: 'smooth' });
  }

  /* ---------- 播放 ---------- */
  function recordPlay(id) {
    const cur = plays[id] || { n: 0, t: 0 };
    plays[id] = { n: cur.n + 1, t: Date.now() };
    store.set('poemPlays', plays);
    renderTop10();
  }

  function stopPlaying() {
    runToken++;
    Speech.stop();
    playing = false;
    highlight(-1);
    markPlaying();
    updateToggle();
  }

  async function play(id) {
    const p = byId.get(id);
    if (!p) return;
    if (playing && nowId === id) return stopPlaying(); // 再點一次正在播的詩 = 停止
    recordPlay(id);
    nowId = id;
    playing = true;
    const token = ++runToken;
    openPlayer(p);
    markPlaying();

    // 先報詩名和詩人 (太長的詩名略過), 再一句一句唸
    const head = p.t.length <= 14 ? `${p.t.replace(/·/g, '，')}，${p.a}` : null;
    const items = head ? [{ text: head, lang: 'zh-TW', pause: 700 }] : [];
    p.l.forEach((line) => items.push({ text: line, lang: 'zh-TW', pause: 500 }));
    const offset = head ? 1 : 0;

    await Speech.run(items, { rate: () => rate, onItem: (i) => highlight(i - offset) });
    if (token === runToken) { // 沒有被別首詩打斷才收尾
      playing = false;
      highlight(-1);
      markPlaying();
      updateToggle();
    }
  }

  function closePlayer() {
    stopPlaying();
    nowId = null;
    els.player.hidden = true;
    fitPadding();
  }

  /* ---------- 事件 ---------- */
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.poem-card, .top-item');
    if (card) play(Number(card.dataset.id));
  });
  els.plToggle.addEventListener('click', () => (playing ? stopPlaying() : play(nowId)));
  $('#pl-close').addEventListener('click', closePlayer);

  els.reset.addEventListener('click', () => {
    if (!confirm('要清除「最常播放」的紀錄嗎?')) return;
    plays = {};
    store.set('poemPlays', plays);
    renderTop10();
  });

  els.chips.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-type]');
    if (!chip) return;
    type = chip.dataset.type;
    renderChips();
    renderList();
  });

  // 注音輸入法組字中不要搜尋, 等選完字再搜
  const applyQuery = () => { query = els.q.value.trim(); renderList(); };
  els.q.addEventListener('input', (e) => { if (!e.isComposing) applyQuery(); });
  els.q.addEventListener('compositionend', applyQuery);

  document.querySelectorAll('[data-rate]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.rate) === rate));
    btn.addEventListener('click', () => {
      rate = Number(btn.dataset.rate);
      store.set('poemRate', rate);
      document.querySelectorAll('[data-rate]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });

  window.addEventListener('resize', fitPadding);

  /* ---------- 換聲音 ---------- */
  const voiceSelect = $('#voice-select');
  const voiceLabel = (v) => `${v.name} (${v.lang.replace('_', '-')})${/^(zh[-_]HK|yue)/i.test(v.lang) ? ' 粵語' : ''}`;
  Speech.whenReady(() => {
    voiceSelect.innerHTML = '<option value="">自動選擇 (推薦)</option>' +
      Speech.voicesFor('zh').map((v) => `<option value="${esc(v.voiceURI)}">${esc(voiceLabel(v))}</option>`).join('');
    voiceSelect.value = Speech.getVoiceUri('zh-TW');
  });
  voiceSelect.addEventListener('change', () => Speech.setVoice('zh-TW', voiceSelect.value));
  $('#voice-test').addEventListener('click', () => {
    stopPlaying();
    Speech.run([{ text: '床前明月光，疑是地上霜。', lang: 'zh-TW' }], { rate: () => rate });
  });
  const voiceTip = $('#voice-tip');
  if (Kids.platform.ios) {
    voiceTip.hidden = false;
    voiceTip.textContent = 'iPhone / iPad 預設的語音比較機械。可以到「設定 → 輔助使用 → 朗讀內容 → 聲音 → 中文 → 台灣」(Settings → Accessibility → Spoken Content → Voices),' +
      '下載品質比較好的版本 (名稱有「進階」「優質」或 Enhanced、Premium), 回到這個頁面重新整理後, 再從上面的選單選它。實際選單名稱可能因 iOS 版本略有不同。';
  } else if (Kids.platform.android) {
    voiceTip.hidden = false;
    voiceTip.textContent = 'Android 可以到「設定 → 一般管理 → 語言 → 文字轉語音輸出」(各品牌選單名稱略有不同), 確認使用「Google 文字轉語音」並已下載「國語 (台灣)」的語音資料。';
  }

  Speech.voiceNote($('.hero'), ['zh-tw', 'zh-cn'], '⚠️ 這台裝置找不到<b>中文語音</b>, 沒辦法唸出來。建議改用 Chrome、Edge 或 Safari 瀏覽器。')();

  /* ---------- 開始 ---------- */
  if (!POEMS.length) {
    els.count.textContent = '詩的資料載入失敗, 請重新整理頁面。';
  } else {
    renderChips();
    renderList();
    renderTop10();
  }
})();
