const test = require('node:test');
const assert = require('node:assert/strict');
const { liveCardForChat } = require('./archive-guard');

const markets = [
  { marketId: 'jacksonville', marketName: 'Michigan', channelIds: ['MI', 'JX'] },
  { marketId: 'jacksonville-nc', marketName: 'Jacksonville NC', channelIds: ['JX'] },
];

test('keeps #jacksonville-nc when the Michigan card is archived but Jacksonville NC is live', () => {
  assert.equal(liveCardForChat({ channelName: 'jacksonville-nc', channelId: 'JX', archivingMarketId: 'jacksonville', markets, activeCards: ['Jacksonville NC', 'Asheboro'] }), 'Jacksonville NC');
});

test('archives #michigan when no live card uses it', () => {
  assert.equal(liveCardForChat({ channelName: 'michigan', channelId: 'MI', archivingMarketId: 'jacksonville', markets, activeCards: ['Jacksonville NC'] }), null);
});

test('a chat listed under another live market is kept even when its name differs', () => {
  assert.equal(liveCardForChat({ channelName: 'old-name', channelId: 'JX', archivingMarketId: 'jacksonville', markets, activeCards: ['Jacksonville NC'] }), 'Jacksonville NC');
});

test('older OS without activeCards keeps the old behaviour', () => {
  assert.equal(liveCardForChat({ channelName: 'jacksonville-nc', channelId: 'JX', archivingMarketId: 'jacksonville', markets, activeCards: undefined }), null);
});
