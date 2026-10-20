/* UI for the Kleinunternehmer-Check. Logic lives in logic.js, texts in i18n.js.
   Everything the user types is kept in localStorage under STORE_KEY and never leaves the browser. */
(function () {
  'use strict';
  var L = window.KUCheck;
  var I = window.KUC_I18N;
  var CFG = window.KUC_CONFIG || {};
  var SITE = CFG.siteBase || '';
  var STORE_KEY = 'hmsk.kleinunternehmer-check.v1';
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  var thisYear = new Date().getFullYear();
  var lang = pickLang();
  var state = load();
  if (!state.year || [thisYear, thisYear - 1].indexOf(+state.year) === -1) state.year = String(thisYear);

  function pickLang() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'de' || q === 'en') return q;
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'de';
    return /^en\b/i.test(nav) ? 'en' : 'de';
  }

  // ---------- storage ----------
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { s = null; }
    if (!s || s.v !== 1 || typeof s.years !== 'object' || !s.years) s = { v: 1, years: {}, visits: 0 };
    try {
      if (!sessionStorage.getItem(STORE_KEY + '.seen')) {
        sessionStorage.setItem(STORE_KEY + '.seen', '1');
        if (Object.keys(s.years).length) s.visits = (s.visits || 0) + 1;
      }
    } catch (e) { /* storage blocked: the tool still works, it just forgets */ }
    return s;
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function yearData(y) {
    y = String(y || state.year);
    if (!state.years[y]) state.years[y] = { started: null, prev: '', months: ['', '', '', '', '', '', '', '', '', '', '', ''], plan: '' };
    return state.years[y];
  }
  function peekYear(y) { return state.years[String(y)] || null; }

  // ---------- helpers ----------
  function t(key, vars) {
    var s = I[lang][key];
    if (s === undefined) s = I.de[key];
    if (vars && typeof s === 'string') Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function yv() { var y = +state.year; return { y: y, py: y - 1, ny: y + 1 }; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function eur(cents, noDecimals) {
    var whole = noDecimals || cents % 100 === 0;
    return new Intl.NumberFormat(t('locale'), { style: 'currency', currency: 'EUR',
      minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(cents / 100);
  }
  function monthName(i, short) {
    return new Intl.DateTimeFormat(t('locale'), { month: short ? 'short' : 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, i, 1)));
  }
  function link(href) { return SITE + href; }
  function amount(str) { var v = L.parseAmount(str); return typeof v === 'number' && !isNaN(v) && v >= 0 ? v : (v === null ? null : NaN); }
  function sumMonths(d) { return d.months.reduce(function (a, s) { var v = amount(s); return a + (v > 0 ? v : 0); }, 0); }

  // ---------- static texts ----------
  function applyLang() {
    var v = yv();
    document.documentElement.lang = lang;
    document.title = t('title');
    $$('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('[data-i18n-y]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n-y'), v); });
    $$('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)); });
    $('#lnkHome').href = link(t('home_href'));
    $('#lnkImprint').href = link(t('imprint_href'));
    $('#lnkImprint').textContent = t('imprint');
    $('#lnkPrivacy').href = link(t('privacy_href'));
    $('#lnkPrivacy').textContent = t('privacy');
    $('#prevFlag').textContent = '--turnover-' + v.py;
    $('#loseList').innerHTML = t('lose').map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    $('#sourcesList').innerHTML = t('src').map(function (s) {
      return '<li><a href="' + esc(s[1]) + '" rel="noopener" target="_blank">' + esc(s[0]) + '</a><span class="src-url">' + esc(s[1]) + '</span></li>';
    }).join('');
    buildYears();
    buildMonths();
  }

  function buildYears() {
    $('#yearOpts').innerHTML = [thisYear - 1, thisYear].map(function (y) {
      return '<label><input type="radio" name="year" value="' + y + '"' + (String(y) === state.year ? ' checked' : '') + '><span>' + y + '</span></label>';
    }).join('');
  }

  function buildMonths() {
    var d = yearData();
    var rows = [];
    for (var i = 0; i < 12; i++) {
      rows.push('<tr><th scope="row"><label for="m' + i + '">' + esc(monthName(i)) + '</label></th>' +
        '<td><div class="money money--sm"><input class="amt" type="text" id="m' + i + '" data-month="' + i + '" inputmode="decimal" placeholder="0" value="' + esc(d.months[i] || '') + '"></div></td>' +
        '<td class="num" id="c' + i + '"></td></tr>');
    }
    $('#monthRows').innerHTML = rows.join('');
  }

  // ---------- form <-> state ----------
  function syncForm() {
    var d = yearData();
    $$('input[name="started"]').forEach(function (inp) { inp.checked = d.started === inp.value; });
    $('#prevQ').hidden = d.started !== 'n';
    $('#prev').value = d.prev || '';
    $('#plan').value = d.plan || '';
    var prevYear = peekYear(+state.year - 1);
    var prevTotal = prevYear ? sumMonths(prevYear) : 0;
    var btn = $('#usePrev');
    btn.hidden = !(d.started === 'n' && prevTotal > 0 && amount(d.prev) !== prevTotal);
    btn.textContent = t('use_prev', { py: +state.year - 1, a: eur(prevTotal) });
    btn.setAttribute('data-total', String(prevTotal));
  }

  function onInput(e) {
    var el = e.target;
    var d = yearData();
    if (el.name === 'year') {
      state.year = el.value;
      save(); applyLang(); syncForm(); render(); return;
    }
    if (el.name === 'started') d.started = el.value;
    else if (el.id === 'prev') d.prev = el.value;
    else if (el.id === 'plan') d.plan = el.value;
    else if (el.hasAttribute('data-month')) d.months[+el.getAttribute('data-month')] = el.value;
    else return;
    save();
    if (el.name === 'started') syncForm();
    render();
  }

  function markInvalid(el, errEl) {
    var v = amount(el.value);
    var bad = typeof v === 'number' && isNaN(v);
    el.setAttribute('aria-invalid', String(bad));
    if (errEl) { errEl.hidden = !bad; errEl.textContent = bad ? t('bad_amount') : ''; }
    return bad ? null : v;
  }

  // ---------- result ----------
  function render() {
    var d = yearData();
    var v = yv();
    var months = [];
    for (var i = 0; i < 12; i++) {
      var val = markInvalid($('#m' + i));
      months.push(val || 0);
    }
    var cum = L.cumulative(months);
    var prev = markInvalid($('#prev'), $('#prevErr'));
    var plan = markInvalid($('#plan'), $('#planErr'));
    var r = L.evaluate({ started: d.started, prev: d.started === 'n' ? prev : null, months: months, plan: plan });

    cum.forEach(function (c, i) {
      var cell = $('#c' + i);
      cell.textContent = months[i] || (i > 0 && cum[i - 1]) ? eur(c) : '';
      cell.className = 'num' + (r.complete && r.crossMonth !== -1 && i >= r.crossMonth ? ' num--over' : '');
    });
    $('#monthTotal').textContent = eur(r.total);

    var body = $('#resultBody');
    var narrow = window.matchMedia('(max-width: 879px)').matches;
    if (!r.complete) {
      body.innerHTML = '<p class="dim">' + esc(t(narrow ? 'pending_m' : 'pending')) + '</p>';
      return;
    }
    var html = [];
    var vars = { y: v.y, py: v.py, ny: v.ny, m: r.crossMonth >= 0 ? monthName(r.crossMonth) : '' };

    // verdict
    var key = { ok: 'v_ok', near: 'v_near', close: 'v_close', lost: 'v_lost', 'not-eligible': 'v_not' }[r.status];
    html.push('<p class="verdict verdict--' + r.status + '">' + esc(t(key, vars)) + '</p>');

    // meter
    if (r.status !== 'not-eligible') {
      var pctW = Math.min(100, r.pct);
      var marker = r.mode === 'regular' ? '<span class="meter__mark" style="left:25%" title="' + esc(t('mark_next')) + '"></span>' : '';
      html.push('<div class="meter' + (r.status === 'lost' ? ' meter--over' : '') + '" role="img" aria-label="' + esc(t('bar_label', vars) + ': ' + r.pct + ' %') + '">' +
        '<span class="meter__fill" style="width:' + pctW + '%"></span>' + marker + '</div>' +
        '<div class="meter__scale"><span>' + esc(eur(0)) + '</span>' + (marker ? '<span class="meter__mid">' + esc(t('mark_next')) + '</span>' : '') + '<span>' + esc(eur(r.limit)) + '</span></div>');
      html.push('<p class="figures"><b>' + esc(r.remaining >= 0 ? t('left', { a: eur(r.remaining), b: eur(r.limit) }) : t('over', { a: eur(-r.remaining), b: eur(r.limit) })) + '</b> ' +
        '<span class="dim">' + esc(t('used', { p: fmtPct(r.pct) })) + '</span></p>');
    }

    // warnings
    var warn = [];
    if (r.mode === 'founding' && r.status !== 'lost') warn.push(t('w_founding'));
    if (r.status === 'lost') { warn.push(t('w_lost')); if (r.nextYear === 'out') warn.push(t('w_lost_next', vars)); }
    if (r.status === 'near' || r.status === 'close') warn.push(t('w_near'));
    if ((r.status === 'ok' || r.status === 'near' || r.status === 'close') && r.mode === 'regular' && r.nextYear === 'out')
      warn.push(t('w_next_out', { y: v.y, ny: v.ny, m: monthName(r.nextLineMonth) }));
    if (r.status === 'not-eligible') warn.push(t(r.nextYear === 'out' ? 'w_not_next_out' : 'w_not_next_ok', vars));
    if (warn.length) html.push('<ul class="warn">' + warn.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>');

    // planned order
    if (r.plan) {
      var p = r.plan, msg;
      if (p.crosses) msg = t('plan_cross', { a: eur(p.after), b: eur(p.vatOnTop), c: eur(p.vatInside) }) + ' ' + t('plan_cross_7');
      else if (p.crossesNext) msg = t('plan_next', vars);
      else msg = t('plan_fits', { a: eur(p.after), b: eur(r.limit - p.after) });
      html.push('<p class="plan' + (p.crosses ? ' plan--cross' : '') + '"><span class="plan__amt">' + esc(eur(p.amount)) + '</span>' + esc(msg) + '</p>');
    }

    // invoice text
    var eligible = r.status === 'ok' || r.status === 'near' || r.status === 'close';
    html.push('<h2 class="h2">' + esc(t('inv_title')) + '</h2>');
    if (eligible) {
      html.push('<p class="small">' + esc(t('inv_desc')) + '</p>' +
        copyBox('inv_de', t('inv_de')) + copyBox('inv_en', t('inv_en')) +
        '<p class="small">' + esc(t('inv_need')) + '</p>');
    } else {
      html.push('<p class="small">' + esc(t('inv_lost')) + '</p>');
    }

    // next steps
    html.push('<div class="next">' +
      '<a class="btn btn--main" href="' + esc(link(t('invoice_href'))) + '">' + esc(t('next_invoice')) + ' &rarr;</a>' +
      '<p class="small">' + esc(t('next_invoice_d')) + '</p>' +
      (eligible && r.nextYear !== 'out' ? '' :
        '<a class="btn btn--line" href="' + esc(link(t('einv_href'))) + '">' + esc(t('next_einv')) + ' &rarr;</a>' +
        '<p class="small">' + esc(t('next_einv_d')) + '</p>') +
      '</div>');

    // email moment: second visit with data, or when the limit is in sight
    if ((state.visits || 0) >= 2 || r.status === 'near' || r.status === 'close' || r.status === 'lost') {
      html.push('<p class="small mail"><a href="' + esc(link(t('contact_href'))) + '">' + esc(t('mail')) + ' &rarr;</a> ' + esc(t('mail_d')) + '</p>');
    }

    html.push('<div class="tools"><button type="button" class="linkish" id="printBtn">' + esc(t('print')) + '</button></div>');
    body.innerHTML = html.join('');
    $$('[data-copy]', body).forEach(function (b) { b.addEventListener('click', copy); });
    $('#printBtn').addEventListener('click', function () { window.print(); });
  }

  function fmtPct(p) { return new Intl.NumberFormat(t('locale'), { maximumFractionDigits: 1 }).format(p); }
  function copyBox(id, text) {
    return '<div class="copy"><code id="' + id + '">' + esc(text) + '</code><button type="button" class="linkish" data-copy="' + id + '">' + esc(t('inv_copy')) + '</button></div>';
  }
  function copy(e) {
    var b = e.currentTarget;
    var text = $('#' + b.getAttribute('data-copy')).textContent;
    var done = function () { b.textContent = t('inv_copied'); setTimeout(function () { b.textContent = t('inv_copy'); }, 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { window.prompt(t('inv_copy'), text); });
    else window.prompt(t('inv_copy'), text);
  }

  // ---------- wiring ----------
  $('#questions').addEventListener('input', onInput);
  $('#questions').addEventListener('change', function (e) { if (e.target.type === 'radio') onInput(e); });
  $('#usePrev').addEventListener('click', function () {
    var c = +this.getAttribute('data-total');
    yearData().prev = String((c / 100).toFixed(2)).replace('.', lang === 'de' ? ',' : '.');
    save(); syncForm(); render();
  });
  $('#clearBtn').addEventListener('click', function () {
    if (!window.confirm(t('clear_confirm'))) return;
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    state = { v: 1, years: {}, visits: 0, year: String(thisYear) };
    applyLang(); syncForm(); render();
  });
  $$('.lang button').forEach(function (b) {
    b.addEventListener('click', function () {
      lang = b.getAttribute('data-lang');
      var u = new URL(location.href);
      u.searchParams.set('lang', lang);
      history.replaceState(null, '', u.pathname + u.search + u.hash);
      applyLang(); syncForm(); render();
    });
  });
  window.matchMedia('(max-width: 879px)').addEventListener('change', render);

  applyLang();
  syncForm();
  render();
})();
