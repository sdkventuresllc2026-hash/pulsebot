const test = require('node:test');
const assert = require('node:assert/strict');
const { planSeat, blitzByDiscordId } = require('./blitz-seat');

const base = { isBot: false, isOwner: false, isManager: false, repMarkets: [], managerMarkets: [] };
const pampa = { marketId: 'pampa' };

test('a rep on a blitz lands in that chat; already there = no change', () => {
  assert.deepEqual(planSeat(base, 'Pampa', pampa), { action: 'rep', marketId: 'pampa' });
  assert.equal(planSeat({ ...base, repMarkets: ['pampa'] }, 'Pampa', pampa).action, 'none');
});

test('a rep moved to a new blitz moves chats', () => {
  assert.deepEqual(planSeat({ ...base, repMarkets: ['jacksonville'] }, 'Pampa', pampa), { action: 'rep', marketId: 'pampa' });
});

test('managers add the chat, keep the others', () => {
  assert.deepEqual(planSeat({ ...base, isManager: true, repMarkets: ['jacksonville'] }, 'Pampa', pampa), { action: 'manager', marketId: 'pampa' });
  assert.equal(planSeat({ ...base, isManager: true, managerMarkets: ['pampa'] }, 'Pampa', pampa).action, 'none');
});

test('no blitz, bots, owner: untouched; blitz with no matching chat is reported', () => {
  assert.equal(planSeat(base, null, pampa).action, 'none');
  assert.equal(planSeat({ ...base, isBot: true }, 'Pampa', pampa).action, 'none');
  assert.equal(planSeat({ ...base, isOwner: true }, 'Pampa', pampa).action, 'none');
  assert.deepEqual(planSeat(base, 'November Blitz', null), { action: 'no_chat', blitz: 'November Blitz' });
});

test('a selling manager (rep + manager record) keeps the blitz from whichever record has it', () => {
  const m = blitzByDiscordId({ active: [{ discordUserId: '1', blitz: 'Pampa' }, { discordUserId: '1', blitz: null }, { discordUserId: null, blitz: 'Hammond' }] });
  assert.equal(m.get('1'), 'Pampa');
  assert.equal(m.size, 1);
});
