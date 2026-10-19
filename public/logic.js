/* Kleinunternehmer-Check: limits, monthly tracker maths and amount parsing.
   No DOM access here, so the same file runs in the browser (window.KUCheck)
   and in Node for the tests (module.exports). All money is in euro cents (integers).

   Legal basis (as of October 2026):
   - § 19 Abs. 1 UStG (Jahressteuergesetz 2024, in force since 1 Jan 2025): turnover is VAT exempt if the
     Gesamtumsatz did not exceed EUR 25,000 in the previous calendar year AND does not exceed EUR 100,000
     in the current calendar year.
   - § 19 Abs. 2 UStG: Gesamtumsatz is counted by payments received (vereinnahmte Entgelte), without
     sales of fixed assets.
   - BMF-Schreiben of 18 Mar 2025 (III C 3 - S 7360/00027/044/105), Abschnitt 19.1 Abs. 2 and 3 UStAE:
     the very transaction that crosses EUR 100,000 is already taxed in full (no grace period, no forecast);
     in the year the business starts, the limit is EUR 25,000 (actual turnover, not annualised).
   - Abschnitt 19.7 Abs. 1 UStAE: after crossing, payments received later for earlier work are taxed too.
   - § 34a UStDV, Abschnitt 14.7a UStAE: invoice must say that the Kleinunternehmer exemption applies. */
(function (root) {
  'use strict';

  var LIMIT_PREV = 2500000;      // previous year, EUR 25,000
  var LIMIT_CURR = 10000000;     // current year, EUR 100,000
  var LIMIT_FOUNDING = 2500000;  // year the business starts, EUR 25,000
  var WARN_AT = 80;              // percent of the limit: "getting close"
  var CLOSE_AT = 90;             // percent of the limit: "very close"
  var VAT_STANDARD = 19;
  var VAT_REDUCED = 7;

  /* parseAmount('12.345,67') -> 1234567 cents; '' -> null; garbage -> NaN.
     Accepts German (1.234,56) and English (1,234.56) notation, a euro sign and spaces.
     A lone separator followed by exactly three digits in groups (1.500, 12,000) is a thousands separator. */
  function parseAmount(input) {
    if (input === null || input === undefined) return null;
    if (typeof input === 'number') return isFinite(input) ? Math.round(input * 100) : NaN;
    var s = String(input).replace(/[\s  €]/g, '').replace(/eur$/i, '');
    if (s === '') return null;
    var neg = false;
    if (s[0] === '-') { neg = true; s = s.slice(1); }
    if (!/^[\d.,']+$/.test(s) || !/\d/.test(s)) return NaN;
    s = s.replace(/'/g, '');
    var lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    var intPart, frac = '';
    if (lastDot !== -1 && lastComma !== -1) {
      var dec = lastDot > lastComma ? '.' : ',';
      var thou = dec === '.' ? ',' : '.';
      var i = s.lastIndexOf(dec);
      intPart = s.slice(0, i); frac = s.slice(i + 1);
      if (intPart.indexOf(dec) !== -1) return NaN;
      if (!new RegExp('^\\d{1,3}(\\' + thou + '\\d{3})*$').test(intPart)) return NaN;
      intPart = intPart.split(thou).join('');
    } else if (lastDot !== -1 || lastComma !== -1) {
      var sep = lastDot !== -1 ? '.' : ',';
      if (new RegExp('^\\d{1,3}(\\' + sep + '\\d{3})+$').test(s)) {
        intPart = s.split(sep).join('');
      } else {
        var parts = s.split(sep);
        if (parts.length !== 2) return NaN;
        intPart = parts[0] || '0'; frac = parts[1];
      }
    } else {
      intPart = s;
    }
    if (!/^\d+$/.test(intPart) || !/^\d*$/.test(frac) || frac.length > 2) return NaN;
    var cents = parseInt(intPart, 10) * 100 + (frac ? parseInt((frac + '0').slice(0, 2), 10) : 0);
    return neg ? -cents : cents;
  }

  // Running totals: cumulative([a, b, c]) -> [a, a+b, a+b+c]. Empty months (null/NaN) count as 0.
  function cumulative(months) {
    var sum = 0;
    return (months || []).map(function (m) { sum += num(m); return sum; });
  }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

  // Index of the first month whose running total is above the limit, or -1.
  function crossingMonth(months, limit) {
    var c = cumulative(months);
    for (var i = 0; i < c.length; i++) if (c[i] > limit) return i;
    return -1;
  }

  function percent(total, limit) {
    return limit > 0 ? Math.round((total / limit) * 1000) / 10 : 0;
  }

  /* VAT contained in a gross amount: the price stays the same, the tax comes out of it.
     vatFromGross(11900, 19) -> 1900. */
  function vatFromGross(gross, rate) {
    rate = rate === undefined ? VAT_STANDARD : rate;
    return Math.round(gross * rate / (100 + rate));
  }
  // VAT added on top of a net amount: vatOnNet(10000, 19) -> 1900.
  function vatOnNet(net, rate) {
    rate = rate === undefined ? VAT_STANDARD : rate;
    return Math.round(net * rate / 100);
  }

  /* evaluate({ started: 'y'|'n', prev: cents|null, months: [12 x cents|null], plan: cents|null }) -> {
       complete: bool,                    enough answers to say something
       mode: 'founding' | 'regular',      founding = business started this calendar year
       limit: cents,                      the limit that applies this year (25k founding, else 100k)
       total: cents,                      sum of the months
       remaining: cents,                  limit - total (negative once crossed)
       pct: number,                       total as percent of limit, one decimal
       status: 'pending' | 'not-eligible' | 'ok' | 'near' | 'close' | 'lost',
       crossMonth: 0-11 | -1,             month in which the limit was crossed
       nextYear: 'ok' | 'out' | null,     can you be Kleinunternehmer next year? (this year <= 25k)
       nextLineMonth: 0-11 | -1,          month in which this year's total went above 25k (regular mode)
       plan: null | { amount, after, crosses, crossesNext, vatOnTop, vatInside }
     } */
  function evaluate(input) {
    input = input || {};
    var months = (input.months || []).slice(0, 12).map(function (m) { return typeof m === 'number' && isFinite(m) && m > 0 ? m : 0; });
    while (months.length < 12) months.push(0);
    var started = input.started === 'y' ? 'y' : input.started === 'n' ? 'n' : null;
    var prev = typeof input.prev === 'number' && isFinite(input.prev) && input.prev >= 0 ? input.prev : null;
    var total = months.reduce(function (a, b) { return a + b; }, 0);

    var r = { complete: false, mode: started === 'y' ? 'founding' : 'regular', limit: LIMIT_CURR, total: total,
      remaining: 0, pct: 0, status: 'pending', crossMonth: -1, nextYear: null, nextLineMonth: -1, plan: null };
    if (started === null || (started === 'n' && prev === null)) return r;
    r.complete = true;

    r.limit = started === 'y' ? LIMIT_FOUNDING : LIMIT_CURR;
    r.remaining = r.limit - total;
    r.pct = percent(total, r.limit);
    r.crossMonth = crossingMonth(months, r.limit);
    r.nextYear = total > LIMIT_PREV ? 'out' : 'ok';
    r.nextLineMonth = started === 'n' ? crossingMonth(months, LIMIT_PREV) : -1;

    if (started === 'n' && prev > LIMIT_PREV) r.status = 'not-eligible';
    else if (total > r.limit) r.status = 'lost';
    else if (total * 100 >= r.limit * CLOSE_AT) r.status = 'close';  // exact, not the rounded pct
    else if (total * 100 >= r.limit * WARN_AT) r.status = 'near';
    else r.status = 'ok';

    var plan = typeof input.plan === 'number' && isFinite(input.plan) && input.plan > 0 ? input.plan : null;
    if (plan !== null && r.status !== 'not-eligible' && r.status !== 'lost') {
      var after = total + plan;
      r.plan = { amount: plan, after: after, crosses: after > r.limit,
        crossesNext: started === 'n' && total <= LIMIT_PREV && after > LIMIT_PREV,
        vatOnTop: vatOnNet(plan), vatInside: vatFromGross(plan) };
    }
    return r;
  }

  var api = {
    LIMIT_PREV: LIMIT_PREV, LIMIT_CURR: LIMIT_CURR, LIMIT_FOUNDING: LIMIT_FOUNDING,
    WARN_AT: WARN_AT, CLOSE_AT: CLOSE_AT, VAT_STANDARD: VAT_STANDARD, VAT_REDUCED: VAT_REDUCED,
    parseAmount: parseAmount, cumulative: cumulative, crossingMonth: crossingMonth, percent: percent,
    vatFromGross: vatFromGross, vatOnNet: vatOnNet, evaluate: evaluate,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KUCheck = api;
})(typeof window !== 'undefined' ? window : globalThis);
