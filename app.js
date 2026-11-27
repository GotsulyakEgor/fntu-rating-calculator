(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var list = $('#matches');
  var tpl = $('#matchTpl');
  var bar = $('#bar');
  var resultCard = $('#result');
  var STORAGE_KEY = 'fntu-rating-calc-v1';
  var seq = 0;
  var restoring = false;

  /* ---------- Мова інтерфейсу (за атрибутом lang у <html>) ---------- */
  var LANG = document.documentElement.lang === 'en' ? 'en' : 'uk';
  var LOCALE = LANG === 'en' ? 'en-US' : 'uk-UA';
  var I18N = {
    uk: {
      srcLoaded: function (n) { return 'База гравців: рейтинг ФНТУ, ' + n + ' гравців.'; },
      srcMissing: 'Базу гравців не завантажено: підстановка рейтингу за прізвищем недоступна, але все інше працює.',
      none: 'Нікого не знайдено. Можна ввести рейтинг вручну.',
      fntu: 'ФНТУ', weight: 'вага ', real: ' · реальний ',
      lSeedRating: 'рейтинг для посіву', lRating: 'рейтинг', lWeight: 'вага', lReal: 'реальний', lSeed: 'для посіву',
      errUnrec: 'не розпізнано', errExtra: 'зайвий знак', errSign: 'додайте + або −',
      errNotFound: function (b) { return 'гравця «' + b + '» не знайдено'; },
      warnSimilar: function (n, name) { return 'Є схожі (' + n + '+): взято «' + name + '». Для точного вибору додайте гравця в рядку нижче.'; },
      added: function (n) { return 'Додано матчів: ' + n; }
    },
    en: {
      srcLoaded: function (n) { return 'Player database: FNTU rating, ' + n + ' players.'; },
      srcMissing: 'The player database failed to load: looking up ratings by surname is unavailable, but everything else works.',
      none: 'No players found. You can enter the rating manually.',
      fntu: 'FNTU', weight: 'weight ', real: ' · actual ',
      lSeedRating: 'seeding rating', lRating: 'rating', lWeight: 'weight', lReal: 'actual', lSeed: 'seeding',
      errUnrec: 'not recognised', errExtra: 'extra sign', errSign: 'add + or −',
      errNotFound: function (b) { return 'player “' + b + '” not found'; },
      warnSimilar: function (n, name) { return 'Similar players (' + n + '+): using “' + name + '”. To pick exactly, add the player in a row below.'; },
      added: function (n) { return 'Matches added: ' + n; }
    }
  };
  var T = I18N[LANG];

  /* ---------- Числа ---------- */
  function num(v, fallback) {
    var s = String(v == null ? '' : v).replace(',', '.').replace(/\s/g, '');
    if (s === '') return fallback || 0;
    var n = parseFloat(s);
    return isFinite(n) ? n : (fallback || 0);
  }
  function fmt(x) {
    return RatingCalc.round1(x).toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  function signed(x) {
    var r = RatingCalc.round1(x);
    return (r > 0 ? '+' : r < 0 ? '−' : '') + fmt(Math.abs(r));
  }
  function chip(c) { return c > 0 ? '+' + c : c < 0 ? '−' + Math.abs(c) : '0'; }

  /* ---------- База гравців ФНТУ ---------- */
  var DATA = window.FNTU_PLAYERS || { updated: '', rows: [] };
  var PLAYERS = DATA.rows.map(function (r) {
    var p = { name: r[0], rating: r[1], seed: r[2], weight: r[3], city: r[4], birth: r[5] };
    p.key = norm(p.name);
    p.words = p.key.split(' ');
    return p;
  });

  /** Спрощує написання: регістр, і/и/ї/ы, є/е/ё/э, апострофи — щоб «Лімонов» знаходився і за «лимонов». */
  function norm(s) {
    return String(s).toLowerCase()
      .replace(/[’'ʼ`´]/g, '')
      .replace(/[іїыy]/g, 'и').replace(/[єёэ]/g, 'е').replace(/ґ/g, 'г')
      .replace(/\s+/g, ' ').trim();
  }
  /** Кирилиця -> латиниця (для пошуку гравців англійською: «Sirkevych» знаходить «Сіркевич»). */
  var TRANSLIT = { а:'a', б:'b', в:'v', г:'h', д:'d', е:'e', ж:'zh', з:'z', и:'y', й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'kh', ц:'ts', ч:'ch', ш:'sh', щ:'shch', ю:'yu', я:'ya', ь:'', ъ:'', ы:'y', э:'e', ё:'e' };
  function latinize(s) {
    return String(s).replace(/[а-яёыэъь]/g, function (c) { return TRANSLIT[c]; });
  }
  /** Спрощення латиниці, щоб різні написання збігалися: y/i, kh/h, g/h, w/v. */
  function latNorm(s) {
    return String(s).toLowerCase().replace(/[’'ʼ`´]/g, '')
      .replace(/kh/g, 'h').replace(/[yj]/g, 'i').replace(/g/g, 'h').replace(/w/g, 'v')
      .replace(/\s+/g, ' ').trim();
  }
  PLAYERS.forEach(function (p) { p.lat = latNorm(latinize(p.key)).split(' '); });
  function search(query, limit) {
    var isLatin = /[a-z]/i.test(query);
    var tokens = (isLatin ? latNorm(query) : norm(query)).split(' ').filter(Boolean);
    if (!tokens.length) return [];
    var first = [], other = [];
    PLAYERS.forEach(function (p) {
      var words = isLatin ? p.lat : p.words;
      var ok = tokens.every(function (t) { return words.some(function (w) { return w.indexOf(t) === 0; }); });
      if (!ok) return;
      (words[0].indexOf(tokens[0]) === 0 ? first : other).push(p);
    });
    var res = first.concat(other);
    if (!res.length && tokens.join('').length >= 3) {
      res = PLAYERS.filter(function (p) {
        var key = isLatin ? p.lat.join(' ') : p.key;
        return tokens.every(function (t) { return key.indexOf(t) !== -1; });
      });
    }
    return limit ? res.slice(0, limit) : res;
  }
  function findByName(name) {
    for (var i = 0; i < PLAYERS.length; i++) if (PLAYERS[i].name === name) return PLAYERS[i];
    return null;
  }
  /** Який рейтинг підставляти: 'seed' — рейтинг для посіву (як у таблиці ФНТУ), 'real' — реальний рейтинг. */
  var RATING_MODE = 'seed';
  function pr(p) { return RATING_MODE === 'seed' ? p.seed : p.rating; }
  function pr2(p) { return RATING_MODE === 'seed' ? p.rating : p.seed; }
  function plain(x) { return (Math.round(x * 10) / 10).toFixed(1); }

  var src = $('#dataSrc');
  var footerDate = $('#footerDate');
  if (PLAYERS.length) {
    var d = DATA.updated.split('-');
    var human = d.length === 3 ? d[2] + '.' + d[1] + '.' + d[0] : DATA.updated;
    src.textContent = T.srcLoaded(PLAYERS.length.toLocaleString(LOCALE));
    footerDate.textContent = human;
    footerDate.setAttribute('datetime', DATA.updated);
  } else {
    footerDate.parentNode.hidden = true;
    src.textContent = T.srcMissing;
  }

  /* ---------- Випадаючі підказки ---------- */
  var dd = { box: $('#dd'), list: $('#ddList'), input: null, kind: '', items: [], idx: -1, open: false };

  function ddOpen(input, kind) {
    var q = input.value.trim();
    if (q.length < 2 || !PLAYERS.length) { ddClose(); return; }
    dd.input = input; dd.kind = kind;
    dd.items = search(q, 7);
    dd.idx = dd.items.length ? 0 : -1;
    ddRender();
    dd.open = true;
    dd.box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    ddPlace();
  }
  function ddClose() {
    if (dd.input) { dd.input.setAttribute('aria-expanded', 'false'); dd.input.removeAttribute('aria-activedescendant'); }
    dd.open = false; dd.box.hidden = true; dd.items = []; dd.idx = -1;
  }
  function ddRender() {
    dd.list.innerHTML = '';
    if (!dd.items.length) {
      var e = document.createElement('div');
      e.className = 'dd-empty';
      e.textContent = T.none;
      dd.list.appendChild(e);
      return;
    }
    dd.items.forEach(function (p, i) {
      var it = document.createElement('div');
      it.className = 'dd-item'; it.id = 'dd-opt-' + i; it.dataset.i = i;
      it.setAttribute('role', 'option');
      it.setAttribute('aria-selected', i === dd.idx ? 'true' : 'false');
      var b = document.createElement('b'); b.textContent = p.name;
      var s = document.createElement('small');
      s.textContent = [p.city, p.birth || ''].filter(Boolean).join(' · ') || T.fntu;
      var r = document.createElement('span'); r.className = 'r'; r.textContent = fmt(pr(p));
      var w = document.createElement('i'); w.textContent = T.weight + p.weight + (RatingCalc.round1(p.seed) !== RatingCalc.round1(p.rating) ? T.real + fmt(pr2(p)) : ''); r.appendChild(w);
      it.appendChild(b); it.appendChild(s); it.appendChild(r);
      dd.list.appendChild(it);
    });
    if (dd.idx >= 0) dd.input.setAttribute('aria-activedescendant', 'dd-opt-' + dd.idx);
  }
  function ddSelect(i) {
    dd.idx = i;
    [].forEach.call(dd.list.children, function (el, k) { el.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    var el = dd.list.children[i];
    if (el) { el.scrollIntoView({ block: 'nearest' }); dd.input.setAttribute('aria-activedescendant', el.id); }
  }
  function ddPlace() {
    if (!dd.open || !dd.input || !dd.input.isConnected) { ddClose(); return; }
    var r = dd.input.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var width = Math.min(Math.max(r.width, 320), vw - 16);
    var left = Math.max(8, Math.min(r.left, vw - width - 8));
    dd.box.style.width = width + 'px';
    dd.box.style.left = left + 'px';
    var h = dd.box.offsetHeight;
    var below = window.innerHeight - r.bottom;
    var top = (below < h + 12 && r.top > h + 12) ? r.top - h - 6 : r.bottom + 6;
    dd.box.style.top = Math.max(8, top) + 'px';
  }
  function ddPick(i) {
    var p = dd.items[i];
    if (!p) return;
    var input = dd.input, kind = dd.kind;
    ddClose();
    if (kind === 'me') {
      input.value = p.name;
      $('#initialRating').value = plain(pr(p));
      $('#initialWeight').value = String(p.weight);
      showMeta(p);
      calculate();
      $('#contestFactor').focus();
    } else {
      var row = input.closest('.match');
      input.value = p.name;
      ratingInput(row).value = plain(pr(p));
      calculate();
      ratingInput(row).focus();
    }
  }
  function showMeta(p) {
    var m = $('#myMeta');
    m.textContent = '';
    if (!p) { m.hidden = true; return; }
    var parts = [[p.city, p.birth || ''].filter(Boolean).join(', ')];
    var add = function (t, strong) {
      if (!t) return;
      if (m.childNodes.length) m.appendChild(document.createTextNode(' · '));
      if (strong) { var b = document.createElement('b'); b.textContent = strong; m.appendChild(document.createTextNode(t + ' ')); m.appendChild(b); }
      else m.appendChild(document.createTextNode(t));
    };
    add(parts[0]);
    add(RATING_MODE === 'seed' ? T.lSeedRating : T.lRating, fmt(pr(p)));
    add(T.lWeight, String(p.weight));
    if (RatingCalc.round1(p.seed) !== RatingCalc.round1(p.rating)) add(RATING_MODE === 'seed' ? T.lReal : T.lSeed, fmt(pr2(p)));
    m.hidden = false;
  }

  dd.list.addEventListener('mousedown', function (e) { e.preventDefault(); });
  dd.list.addEventListener('click', function (e) {
    var it = e.target.closest('.dd-item');
    if (it) ddPick(+it.dataset.i);
  });
  window.addEventListener('resize', ddPlace);
  window.addEventListener('scroll', ddPlace, true);
  document.addEventListener('focusout', function (e) { if (e.target === dd.input) ddClose(); });

  /* ---------- Рядки суперників ---------- */
  function rows() { return [].slice.call(list.children); }
  function ratingInput(row) { return $('[name=opponentRating]', row); }
  function nameInput(row) { return $('[name=opponentName]', row); }
  function isWin(row) { return $('.seg input:checked', row).value === 'win'; }
  function setWin(row, win) { $('.seg input[value=' + (win ? 'win' : 'lose') + ']', row).checked = true; }
  function isEmptyRow(row) { return ratingInput(row).value.trim() === '' && nameInput(row).value.trim() === ''; }

  function addMatch(opts) {
    opts = opts || {};
    var node = tpl.content.firstElementChild.cloneNode(true);
    var uid = 'result-' + (++seq);
    [].forEach.call(node.querySelectorAll('.seg input'), function (r) { r.name = uid; });
    if (opts.name) nameInput(node).value = opts.name;
    if (opts.rating) ratingInput(node).value = opts.rating;
    if (opts.win === false) setWin(node, false);
    list.appendChild(node);
    renumber();
    if (opts.focus) ratingInput(node).focus();
    if (!restoring) calculate();
    return node;
  }
  function renumber() {
    rows().forEach(function (row, i) { $('.num', row).textContent = i + 1; });
  }
  function deleteRow(row) {
    ddClose();
    var all = rows();
    var i = all.indexOf(row);
    if (all.length > 1) {
      row.remove();
      renumber();
      ratingInput(rows()[Math.min(i, all.length - 2)]).focus();
    } else {
      nameInput(row).value = '';
      ratingInput(row).value = '';
      setWin(row, true);
      ratingInput(row).focus();
    }
    calculate();
  }
  function fillRows(n) { for (var i = 0; i < n; i++) addMatch(); }

  /* ---------- Швидкий ввід одним рядком ---------- */
  var bulk = $('#bulk');
  var bulkPreview = $('#bulkPreview');

  /** «52+ 47+ Сіркевич− 50,5-» -> список матчів із підказками помилок. */
  function parseBulk(text) {
    var toks = text.replace(/[−–—]/g, '-').replace(/;/g, ' ').replace(/,\s+/g, ' ').trim().split(/\s+/).filter(Boolean);
    return toks.map(function (t) {
      var m = /^([+-])?(.+?)([+-])?$/.exec(t);
      var item = { token: t, ok: false };
      if (!m) { item.err = T.errUnrec; return item; }
      if (m[1] && m[3]) { item.err = T.errExtra; return item; }
      var sign = m[1] || m[3];
      var body = m[2];
      if (!sign) { item.err = T.errSign; return item; }
      item.win = sign === '+';
      if (/^\d+(?:[.,]\d+)?$/.test(body)) {
        item.rating = num(body); item.ok = true; item.label = fmt(item.rating);
      } else if (/^[\p{L}'’ʼ.\-]{2,}$/u.test(body)) {
        var found = search(body, 6);
        if (!found.length) { item.err = T.errNotFound(body); return item; }
        item.player = found[0]; item.rating = pr(found[0]); item.ok = true;
        item.label = found[0].name.split(' ')[0] + ' ' + fmt(pr(found[0]));
        if (found.length > 1) item.warn = T.warnSimilar(found.length, found[0].name);
      } else {
        item.err = T.errUnrec;
      }
      return item;
    });
  }
  function renderBulk() {
    bulkPreview.textContent = '';
    var items = parseBulk(bulk.value);
    items.forEach(function (it) {
      var c = document.createElement('span');
      c.className = 'chip ' + (it.ok ? (it.win ? 'win' : 'lose') : 'err') + (it.warn ? ' warn' : '');
      c.textContent = it.ok ? (it.win ? '+ ' : '− ') + it.label + (it.warn ? ' ?' : '') : it.token + ' — ' + it.err;
      if (it.warn) c.title = it.warn;
      bulkPreview.appendChild(c);
    });
    return items;
  }
  function applyBulk() {
    var items = parseBulk(bulk.value);
    if (!items.length) return;
    if (items.some(function (it) { return !it.ok; })) { renderBulk(); return; }
    restoring = true;
    items.forEach(function (it) {
      var row = rows().filter(isEmptyRow)[0] || addMatch();
      ratingInput(row).value = plain(it.rating);
      if (it.player) nameInput(row).value = it.player.name;
      setWin(row, it.win);
    });
    restoring = false;
    bulk.value = '';
    calculate();
    bulkPreview.textContent = '';
    var done = document.createElement('span');
    done.className = 'chip win';
    done.textContent = T.added(items.length);
    bulkPreview.appendChild(done);
  }

  /* ---------- Розрахунок ---------- */
  function calculate() {
    var all = rows();
    var active = [];
    var matches = [];
    all.forEach(function (row) {
      var raw = ratingInput(row).value.trim();
      if (raw !== '') {
        active.push(row);
        matches.push({ opponentRating: num(raw), won: isWin(row) });
      }
    });

    var res = RatingCalc.calculate({
      rating: num($('#initialRating').value),
      weight: num($('#initialWeight').value),
      factor: num($('#contestFactor').value, 1),
      matches: matches,
      newPlayerCorrection: $('#correction').checked
    });
    var r1 = RatingCalc.round1;

    $('#weightField').classList.toggle('is-disabled', res.isNew);
    $('#initialWeight').disabled = res.isNew;
    $('#newPlayerNote').hidden = !res.isNew;
    $('#correctionRow').hidden = !res.isNew;
    $('#baseRating').textContent = fmt(res.startRating);

    all.forEach(function (row) {
      var el = $('.contrib', row);
      var idx = active.indexOf(row);
      if (idx === -1) { el.textContent = '—'; el.dataset.sign = 'zero'; return; }
      var c = res.contributions[idx];
      el.textContent = chip(c);
      el.dataset.sign = c > 0 ? 'pos' : c < 0 ? 'neg' : 'zero';
    });

    $('#closingRating').textContent = fmt(res.endRating);
    var dl = $('#closingDelta');
    dl.textContent = signed(res.delta);
    dl.dataset.sign = r1(res.delta) > 0 ? 'pos' : r1(res.delta) < 0 ? 'neg' : 'zero';
    $('#closingWeight').textContent = fmt(res.endWeight);
    $('#contribution').textContent = chip(res.balance);
    $('#noRating').hidden = !(res.isNew && res.endRating <= 0 && matches.length > 0);

    $('#barRating').textContent = fmt(res.endRating);
    var bd = $('#barDelta');
    bd.textContent = signed(res.delta);
    bd.dataset.sign = dl.dataset.sign;

    if (!restoring) save();
  }

  /* ---------- Збереження в браузері ---------- */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        mn: $('#myName').value,
        r: $('#initialRating').value, w: $('#initialWeight').value, k: $('#contestFactor').value,
        c: $('#correction').checked,
        m: rows().map(function (row) { return { n: nameInput(row).value, r: ratingInput(row).value, w: isWin(row) }; })
      }));
    } catch (e) { /* сховище недоступне — не страшно */ }
  }
  function restore() {
    try {
      var s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!s || !s.m || !s.m.length) return false;
      restoring = true;
      $('#myName').value = s.mn || '';
      showMeta(s.mn ? findByName(s.mn) : null);
      $('#initialRating').value = s.r || '';
      $('#initialWeight').value = s.w || '';
      $('#contestFactor').value = s.k || '';
      $('#correction').checked = s.c !== false;
      s.m.forEach(function (m) { addMatch({ name: m.n, rating: m.r, win: m.w }); });
      while (rows().length < 5) addMatch();
      restoring = false;
      return true;
    } catch (e) { restoring = false; return false; }
  }
  function resetAll() {
    ddClose();
    list.innerHTML = '';
    ['#myName', '#initialRating', '#initialWeight', '#contestFactor', '#bulk'].forEach(function (s) { $(s).value = ''; });
    showMeta(null);
    bulkPreview.textContent = '';
    $('#correction').checked = true;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    restoring = true; fillRows(5); restoring = false;
    calculate();
    $('#myName').focus();
  }

  /* ---------- Навігація клавішами ---------- */
  function topFields() {
    return ['#myName', '#initialRating', '#initialWeight', '#contestFactor']
      .map(function (s) { return $(s); })
      .filter(function (el) { return !el.disabled; });
  }
  /** Порядок обходу для Enter і стрілок: верхні поля, потім рейтинги суперників. */
  function order() { return topFields().concat(rows().map(ratingInput)); }
  function move(el, step) {
    var o = order();
    var i = o.indexOf(el);
    if (i === -1) return false;
    var t = o[i + step];
    if (t) { t.focus(); return true; }
    return false;
  }
  function advanceFromRow(row) {
    var all = rows();
    var i = all.indexOf(row);
    if (i < all.length - 1) { ratingInput(all[i + 1]).focus(); }
    else if (ratingInput(row).value.trim() !== '') { addMatch({ focus: true }); }
  }

  document.addEventListener('keydown', function (e) {
    var el = e.target;
    if (!(el instanceof HTMLInputElement)) {
      if (e.altKey && (e.key === 'n' || e.key === 'т')) { e.preventDefault(); addMatch({ focus: true }); }
      return;
    }
    if (e.isComposing || e.ctrlKey || e.metaKey) return;

    /* Відкриті підказки мають пріоритет. */
    if (dd.open && el === dd.input) {
      var n = dd.items.length;
      if (e.key === 'ArrowDown' && n) { e.preventDefault(); ddSelect((dd.idx + 1) % n); return; }
      if (e.key === 'ArrowUp' && n) { e.preventDefault(); ddSelect((dd.idx - 1 + n) % n); return; }
      if (e.key === 'Enter' && n && dd.idx >= 0) { e.preventDefault(); ddPick(dd.idx); return; }
      if (e.key === 'Escape') { e.preventDefault(); ddClose(); return; }
    }

    if (el === bulk) {
      if (e.key === 'Enter') { e.preventDefault(); applyBulk(); }
      return;
    }

    var row = el.closest('.match');
    var isRating = el.name === 'opponentRating';
    var isName = el.name === 'opponentName';

    if (e.altKey && (e.key === 'n' || e.key === 'т')) { e.preventDefault(); addMatch({ focus: true }); return; }
    if (row && e.altKey && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); deleteRow(row); return; }

    if (isRating) {
      if (e.key === '+' || e.key === '=') { e.preventDefault(); setWin(row, true); calculate(); advanceFromRow(row); return; }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); setWin(row, false); calculate(); advanceFromRow(row); return; }
      if (e.key === ' ') { e.preventDefault(); setWin(row, !isWin(row)); calculate(); return; }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (isName) { ratingInput(row).focus(); return; }
      if (isRating) {
        if (e.shiftKey) { if (!move(el, -1)) nameInput(row).focus(); }
        else advanceFromRow(row);
        return;
      }
      if (el.type === 'text') { if (!move(el, e.shiftKey ? -1 : 1)) bulk.focus(); }
      return;
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      var step = e.key === 'ArrowDown' ? 1 : -1;
      if (isName) {
        var all = rows(); var t = all[all.indexOf(row) + step];
        if (t) { e.preventDefault(); nameInput(t).focus(); }
      } else if (el.type === 'text') {
        if (move(el, step)) e.preventDefault();
      }
    }
  });

  /* Лише цифри, крапка й кома в числових полях; підказки гравців; розрахунок. */
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.matches && el.matches('[data-num], [name=opponentRating]')) {
      var clean = el.value.replace(/[^\d.,]/g, '');
      if (clean !== el.value) el.value = clean;
    }
    if (el === bulk) { renderBulk(); return; }
    if (el.dataset && el.dataset.player) {
      if (el.dataset.player === 'me' && !el.value.trim()) showMeta(null);
      ddOpen(el, el.dataset.player);
    }
    calculate();
  });
  document.addEventListener('change', calculate);

  /* Фокус виділяє вміст — нове значення просто набирається поверх. */
  var justFocused = null;
  document.addEventListener('focusin', function (e) {
    var el = e.target;
    if (el instanceof HTMLInputElement && el.type === 'text') { el.select(); justFocused = el; }
  });
  /* Щоб клік мишею не скасовував виділення, зроблене при фокусі. */
  document.addEventListener('mouseup', function (e) {
    if (justFocused && e.target === justFocused) e.preventDefault();
    justFocused = null;
  });

  document.addEventListener('click', function (e) {
    var del = e.target.closest('.delete');
    if (del) { deleteRow(del.closest('.match')); return; }
    if (e.target.closest('#addMatch')) { addMatch({ focus: true }); return; }
    if (e.target.closest('#bulkApply')) { applyBulk(); bulk.focus(); return; }
    if (e.target.closest('#reset')) resetAll();
  });

  /* ---------- Нижня панель на телефонах ---------- */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      bar.classList.toggle('is-hidden', entries[0].isIntersecting);
    }, { threshold: 0.35 }).observe(resultCard);
    bar.classList.remove('is-hidden');
  }
  $('#barMore').addEventListener('click', function () {
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* ---------- Старт ---------- */
  if (!restore()) { restoring = true; fillRows(5); restoring = false; }
  calculate();
  if (window.matchMedia && matchMedia('(hover: hover)').matches) $('#myName').focus();
})();
