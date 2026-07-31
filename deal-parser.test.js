const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDealMessage, detectTextLogIntent, isQuickNaturalLog } = require('./deal-parser');

test('2 Gig variants', () => {
  for (const s of ['2g', '2G', '2 gb', '2GB', '2gb', '2 gig', '2 gigs', '2gig', '2 gbps', '2gbps', '2000', '2000 mbps', '2000mbps']) {
    const r = parseDealMessage(s);
    assert.equal(r.ok, true, s);
    assert.deepEqual(r.speeds, ['2gig'], s);
  }
});

test('1 Gig variants', () => {
  for (const s of ['1g', '1G', '1 gb', '1GB', '1gb', '1 gig', '1 gigs', '1gig', '1 gbps', '1gbps', '1000', '1000 mbps', '1000mbps']) {
    const r = parseDealMessage(s);
    assert.equal(r.ok, true, s);
    assert.deepEqual(r.speeds, ['1gig'], s);
  }
});

test('500 / 300 / 200 Mbps variants', () => {
  const five = ['500', '500m', '500M', '500 mb', '500MB', '500mb', '500 mbs', '500mbs', '500 mbps', '500mbps', '500 meg', '500 megs'];
  for (const s of five) {
    const r = parseDealMessage(s);
    assert.equal(r.ok, true, s);
    assert.deepEqual(r.speeds, ['500mb'], s);
  }
  const three = ['300', '300m', '300M', '300 mb', '300mb', '300 mbs', '300mbs', '300 mbps', '300 meg'];
  for (const s of three) {
    const r = parseDealMessage(s);
    assert.equal(r.ok, true, s);
    assert.deepEqual(r.speeds, ['300mb'], s);
  }
  const two = ['200', '200m', '200M', '200 mb', '200mb', '200 mbs', '200mbs', '200 mbps', '200 meg'];
  for (const s of two) {
    const r = parseDealMessage(s);
    assert.equal(r.ok, true, s);
    assert.deepEqual(r.speeds, ['200mb'], s);
  }
});

test('multiple deals', () => {
  assert.deepEqual(parseDealMessage('2 1g').speeds, ['1gig', '1gig']);
  assert.deepEqual(parseDealMessage('2x 1g').speeds, ['1gig', '1gig']);
  assert.deepEqual(parseDealMessage('2x 500').speeds, ['500mb', '500mb']);
  assert.deepEqual(parseDealMessage('1g 2g 500').speeds, ['1gig', '2gig', '500mb']);
  assert.deepEqual(parseDealMessage('3 500').speeds, ['500mb', '500mb', '500mb']);
  assert.deepEqual(parseDealMessage('1g 1g 2g').speeds, ['1gig', '1gig', '2gig']);
  assert.deepEqual(parseDealMessage('2 1g and 1 500').speeds, ['1gig', '1gig', '500mb']);
  assert.deepEqual(parseDealMessage('3x 1g, 1x 2g').speeds, ['1gig', '1gig', '1gig', '2gig']);
});

test('false positives', () => {
  for (const s of [
    '500 flyers',
    '200 doors',
    '300 houses',
    '1000 dollars',
    '2 people',
    '1 manager',
    'training at 1',
    'I need 500',
    'Can someone knock 200',
    'Sold one',
    '1 deal but no speed',
    'hello world',
    '',
    '   ',
  ]) {
    const r = parseDealMessage(s);
    assert.equal(r.ok, false, `expected fail: ${JSON.stringify(s)}`);
  }
});

test('comma and and separators', () => {
  const r = parseDealMessage('1g, 2g');
  assert.equal(r.ok, true);
  assert.deepEqual(r.speeds, ['1gig', '2gig']);
});

test('detectTextLogIntent flags full log phrases only', () => {
  assert.equal(detectTextLogIntent('log 1gig'), 'log');
  assert.equal(detectTextLogIntent('leaderboard'), null);
  assert.equal(detectTextLogIntent('lb'), null);
  assert.equal(detectTextLogIntent('1gig'), null);
});

test('isQuickNaturalLog allows multi-deal shorthand lines', () => {
  assert.equal(isQuickNaturalLog(parseDealMessage('1g')), true);
  assert.equal(isQuickNaturalLog(parseDealMessage('2x 1g')), true);
  assert.equal(isQuickNaturalLog(parseDealMessage('1g, 2g')), true);
  assert.equal(isQuickNaturalLog(parseDealMessage('1g 2g 500')), true);
});

test('uncertain stays strict', () => {
  assert.equal(parseDealMessage('1 g').ok, false);
  assert.equal(parseDealMessage('gig').ok, false);
  assert.equal(parseDealMessage('2x500').ok, false);
});
