const test = require('node:test');
const assert = require('node:assert/strict');
const { speedFromPlan, speedInText, isUpgrade, parseInstallTime } = require('./deal-details');

const MON_OCT_19 = new Date('2026-10-19T18:00:00Z'); // Monday, 2 PM ET

test('plan text on the screenshot → speed key', () => {
  assert.equal(speedFromPlan('T-Mobile Fiber 1 Gig'), '1gig');
  assert.equal(speedFromPlan('Fiber 2 Gig'), '2gig');
  assert.equal(speedFromPlan('2 GIG'), '2gig');
  assert.equal(speedFromPlan('Fiber 300 Mbps'), '300mb');
  assert.equal(speedFromPlan('Fiber 500'), null);
  assert.equal(speedFromPlan(null), null);
});

test('upgrade sentences: the new speed wins', () => {
  const t = 'Existing client had 500mbps fiber. Upgraded him to 2gig fiber install date Wednesday';
  assert.ok(isUpgrade(t));
  assert.equal(speedInText(t), '2gig');
  assert.equal(isUpgrade('2g'), false);
});

test('typed install times from the field', () => {
  assert.deepEqual(parseInstallTime('8-10 am on the 21st', MON_OCT_19), { date: '2026-10-21', window: '8 - 10 a.m.' });
  assert.deepEqual(parseInstallTime('12-3 on the 21st', MON_OCT_19), { date: '2026-10-21', window: '12 - 3 p.m.' });
  assert.deepEqual(parseInstallTime('Wednesday October 21st 8:00am - 10:00am', MON_OCT_19), { date: '2026-10-21', window: '8 - 10 a.m.' });
  assert.deepEqual(parseInstallTime('10/23 10-12', MON_OCT_19), { date: '2026-10-23', window: '10 a.m. - 12 p.m.' });
  assert.deepEqual(parseInstallTime('5-7pm friday', MON_OCT_19), { date: '2026-10-23', window: '5 - 7 p.m.' });
  assert.deepEqual(parseInstallTime('3 to 5 tomorrow', MON_OCT_19), { date: '2026-10-20', window: '3 - 5 p.m.' });
  assert.deepEqual(parseInstallTime('the 2nd 8-10', MON_OCT_19), { date: '2026-11-02', window: '8 - 10 a.m.' });
  assert.equal(parseInstallTime('nice job bro', MON_OCT_19), null);
  assert.equal(parseInstallTime('2g', MON_OCT_19), null);
});
