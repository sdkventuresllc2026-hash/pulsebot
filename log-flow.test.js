const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hypeTextsSimilar,
  buildPremiumDealConfirmation,
  buildDealHypeLine,
} = require('./premium-confirmation');
const { resolveDealChannel, isApprovedDealChannel } = require('./deal-channels');

test('hypeTextsSimilar catches duplicate lines', () => {
  assert.equal(
    hypeTextsSimilar('**First of the day** for Rep.', 'First of the day for Rep.'),
    true,
  );
  assert.equal(hypeTextsSimilar('Board changed.', '**Logged.** Keep stacking.'), false);
});

test('buildPremiumDealConfirmation is a plain header plus the hype line', () => {
  const out = buildPremiumDealConfirmation({
    displayName: 'Jacob Arnold',
    speeds: ['1gig'],
    dealsTodayAfter: 6,
    hypeLine: '**Five-deep.**',
  });
  assert.equal(out, 'Logged: Jacob Arnold · 1 Gig · 6 today\n**Five-deep.**');
});

test('buildDealHypeLine first ever does not repeat rep or speed', () => {
  const line = buildDealHypeLine({
    picked: { event: 'first_ever', text: '**Debut log.**' },
    displayName: 'Ishawn graves',
    movement: {},
  });
  assert.equal(line, '**Debut log.**');
  assert.ok(!line.includes('Ishawn'));
});

test('buildDealHypeLine does not repeat rep and speed on routine counts', () => {
  const line = buildDealHypeLine({
    picked: { event: 'second_today', text: '**Two today.**' },
    displayName: 'iQRexy',
    movement: {},
  });
  assert.equal(line, '**Two today.**');
  assert.ok(!line.includes('iQRexy'));
  assert.ok(!line.includes('2 Gig'));
});

test('resolveDealChannel uses parent for threads', () => {
  const parent = { id: 'p1', name: 'virginia-deals', isThread: () => false };
  const thread = {
    id: 't1',
    name: 'deal-thread',
    isThread: () => true,
    parent,
  };
  assert.equal(resolveDealChannel(thread), parent);
  assert.equal(isApprovedDealChannel(thread), true);
  assert.equal(isApprovedDealChannel({ id: 'x', name: 'random-chat' }), false);
});
