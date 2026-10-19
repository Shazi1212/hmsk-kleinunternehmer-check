'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../public/logic.js');

const EUR = (n) => Math.round(n * 100);
const months = (...a) => { const m = a.map(EUR); while (m.length < 12) m.push(0); return m; };

test('limits match § 19 Abs. 1 UStG (since 2025)', () => {
  assert.equal(L.LIMIT_PREV, EUR(25000));
  assert.equal(L.LIMIT_CURR, EUR(100000));
  assert.equal(L.LIMIT_FOUNDING, EUR(25000));
});

test('parseAmount: German, English and plain notation', () => {
  const cases = [
    ['1.234,56', 123456], ['1,234.56', 123456], ['1234,56', 123456], ['1234.56', 123456],
    ['1.500', 150000], ['12,000', 1200000], ['1.234.567,89', 123456789], ['1,234,567.89', 123456789],
    ['1,5', 150], ['1.5', 150], ['0,99', 99], [',5', 50], ['25000', 2500000], ['25 000 €', 2500000],
    ['€ 4.200', 420000], ['100000 EUR', 10000000], ["1'000.50", 100050], [12.34, 1234], ['-50', -5000],
  ];
  for (const [s, want] of cases) assert.equal(L.parseAmount(s), want, String(s));
  assert.equal(L.parseAmount(''), null);
  assert.equal(L.parseAmount('   '), null);
  assert.equal(L.parseAmount(null), null);
  for (const bad of ['abc', '1,2,3', '12.5000', '1.23,4.5', '1.2345,00', '5e3', '1,234', '.', '1,234,5'])
    if (bad === '1,234') assert.equal(L.parseAmount(bad), 123400, bad); // thousands separator
    else assert.ok(Number.isNaN(L.parseAmount(bad)), bad);
});

test('cumulative and crossingMonth', () => {
  assert.deepEqual(L.cumulative([100, 200, null, 50]), [100, 300, 300, 350]);
  const m = months(30000, 30000, 30000, 10000, 1);
  assert.equal(L.crossingMonth(m, L.LIMIT_CURR), 4);  // exactly 100,000 after April is still fine
  assert.equal(L.crossingMonth(m, L.LIMIT_PREV), 0);
  assert.equal(L.crossingMonth(months(1000), L.LIMIT_CURR), -1);
});

test('VAT helpers', () => {
  assert.equal(L.vatOnNet(EUR(100)), EUR(19));
  assert.equal(L.vatOnNet(EUR(100), 7), EUR(7));
  assert.equal(L.vatFromGross(EUR(119)), EUR(19));
  assert.equal(L.vatFromGross(EUR(107), 7), EUR(7));
  assert.equal(L.vatFromGross(EUR(40000)), 638655); // 40,000 * 19 / 119 = 6,386.55
});

test('pending until the needed answers are there', () => {
  assert.equal(L.evaluate({}).status, 'pending');
  assert.equal(L.evaluate({ started: 'n' }).status, 'pending');
  assert.equal(L.evaluate({ started: 'n', prev: EUR(10000) }).complete, true);
  assert.equal(L.evaluate({ started: 'y' }).complete, true);
});

test('previous year above 25,000: not eligible all year (Abschnitt 19.1 Abs. 2 Satz 2 UStAE)', () => {
  const r = L.evaluate({ started: 'n', prev: EUR(25000.01), months: months(1000) });
  assert.equal(r.status, 'not-eligible');
  assert.equal(r.nextYear, 'ok');
  const r2 = L.evaluate({ started: 'n', prev: EUR(25000), months: months(1000) });
  assert.equal(r2.status, 'ok', 'exactly 25,000 has not been exceeded');
});

test('regular year: 100,000 is the line, the crossing payment is already taxed', () => {
  // BMF example, Abschnitt 19.1 Abs. 2 UStAE: prev 20,000, 80,000 so far, new order 40,000
  const before = L.evaluate({ started: 'n', prev: EUR(20000), months: months(80000), plan: EUR(40000) });
  assert.equal(before.status, 'near');
  assert.equal(before.remaining, EUR(20000));
  assert.equal(before.plan.crosses, true);
  assert.equal(before.plan.vatOnTop, EUR(7600));
  assert.equal(before.plan.vatInside, 638655);
  const after = L.evaluate({ started: 'n', prev: EUR(20000), months: months(80000, 40000) });
  assert.equal(after.status, 'lost');
  assert.equal(after.crossMonth, 1);
  assert.equal(after.remaining, EUR(-20000));
  assert.equal(after.plan, null);
  assert.equal(after.nextYear, 'out');
});

test('regular year: boundaries and warning levels', () => {
  const at = (total) => L.evaluate({ started: 'n', prev: 0, months: months(total) });
  assert.equal(at(100000).status, 'close');    // 100% but not exceeded
  assert.equal(at(100000.01).status, 'lost');
  assert.equal(at(90000).status, 'close');
  assert.equal(at(89999.99).status, 'near');
  assert.equal(at(80000).status, 'near');
  assert.equal(at(79999.99).status, 'ok');
  assert.equal(at(0).status, 'ok');
  assert.equal(at(80000).pct, 80);
  assert.equal(at(12345).pct, 12.3);
});

test('regular year: above 25,000 keeps the status now but ends it next year', () => {
  const r = L.evaluate({ started: 'n', prev: EUR(10000), months: months(10000, 10000, 10000) });
  assert.equal(r.status, 'ok');
  assert.equal(r.nextYear, 'out');
  assert.equal(r.nextLineMonth, 2);
  const r2 = L.evaluate({ started: 'n', prev: EUR(10000), months: months(25000) });
  assert.equal(r2.nextYear, 'ok');
  assert.equal(r2.nextLineMonth, -1);
  const plan = L.evaluate({ started: 'n', prev: 0, months: months(20000), plan: EUR(6000) });
  assert.equal(plan.plan.crosses, false);
  assert.equal(plan.plan.crossesNext, true);
});

test('founding year: 25,000 is the line, not annualised (Abschnitt 19.1 Abs. 3 UStAE)', () => {
  // IHK example: May to November 25,000, December 5,000 -> December is taxed
  const m = months(0, 0, 0, 0, 5000, 5000, 5000, 4000, 3000, 2000, 1000, 5000);
  const r = L.evaluate({ started: 'y', months: m });
  assert.equal(r.mode, 'founding');
  assert.equal(r.limit, EUR(25000));
  assert.equal(r.status, 'lost');
  assert.equal(r.crossMonth, 11);
  assert.equal(r.nextLineMonth, -1);
  const ok = L.evaluate({ started: 'y', months: months(25000) });
  assert.equal(ok.status, 'close');
  assert.equal(ok.nextYear, 'ok');
  const prevIgnored = L.evaluate({ started: 'y', prev: EUR(999999), months: months(100) });
  assert.equal(prevIgnored.status, 'ok', 'no previous year when the business started this year');
  const planF = L.evaluate({ started: 'y', months: months(20000), plan: EUR(5000.01) });
  assert.equal(planF.plan.crosses, true);
  assert.equal(planF.plan.crossesNext, false);
});

test('bad month values are ignored, extra months cut off', () => {
  const r = L.evaluate({ started: 'n', prev: 0, months: [NaN, -500, null, 1000, ...Array(12).fill(1)] });
  assert.equal(r.total, 1000 + 8);
});

test('texts: DE and EN have the same keys, no em or en dashes, figures match the logic', () => {
  global.window = {};
  require('../public/i18n.js');
  const I = global.window.KUC_I18N;
  assert.deepEqual(Object.keys(I.de).sort(), Object.keys(I.en).sort());
  assert.equal(I.de.lose.length, I.en.lose.length);
  const all = JSON.stringify(I);
  assert.ok(!/[–—]/.test(all), 'no em/en dashes in copy');
  assert.ok(/25\.000[ \u00a0]€/.test(I.de.lead) && /100\.000[ \u00a0]€/.test(I.de.lead));
  assert.ok(I.en.lead.includes('€25,000') && I.en.lead.includes('€100,000'));
  assert.ok(I.de.inv_de.includes('§ 19 UStG'));
  for (const l of ['de', 'en']) assert.ok(/2026/.test(I[l].asof), 'as-of date present');
});
