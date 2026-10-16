const test = require('node:test');
const assert = require('node:assert/strict');
const { planMember, indexRoster } = require('./access-sync');

const roster = {
  active: [
    { name: 'Jadin Kent', kind: 'rep', discordUserId: '100' },
    { name: 'Don Salcedo', kind: 'rep', discordUserId: null },
    { name: 'Don Salcedo', kind: 'manager', discordUserId: null }, // same human, two records
    { name: 'Isaiah Bradley', kind: 'rep', discordUserId: null },
    { name: 'Isaiah Bradley', kind: 'rep', discordUserId: null }, // two different humans
  ],
  inactive: [{ name: 'Haden Massey', kind: 'manager', discordUserId: '200' }],
};
const idx = indexRoster(roster);
const member = (over) => ({ id: '0', username: 'x', displayName: 'x', isBot: false, roleNames: [], outranksBot: false, hasMember: false, ...over });

test('active by Discord id gets Member; already has it = nothing', () => {
  assert.equal(planMember(member({ id: '100' }), idx).action, 'grant');
  assert.equal(planMember(member({ id: '100', hasMember: true }), idx).action, 'none');
});

test('inactive by Discord id is stripped of Member and market roles', () => {
  assert.equal(planMember(member({ id: '200', hasMember: true, roleNames: ['Member', 'Pulse · Ashtabula'] }), idx).action, 'strip');
  assert.equal(planMember(member({ id: '200', roleNames: [] }), idx).action, 'none');
});

test('exact real name links + grants, nickname in parentheses ignored, duplicates refused', () => {
  const don = planMember(member({ id: '300', displayName: 'Don Salcedo (Don)' }), idx);
  assert.equal(don.action, 'link_and_grant');
  assert.equal(don.person.name, 'Don Salcedo');
  assert.equal(planMember(member({ id: '301', displayName: 'Isaiah Bradley' }), idx).action, 'none');
  assert.equal(planMember(member({ id: '302', displayName: 'Don' }), idx).action, 'none');
});

test('never touches bots, Owner/Manager holders, or anyone above the bot; unknowns are left alone', () => {
  assert.equal(planMember(member({ id: '200', isBot: true }), idx).reason, 'bot');
  assert.equal(planMember(member({ id: '200', roleNames: ['Manager', 'Member'] }), idx).reason, 'protected');
  assert.equal(planMember(member({ id: '200', outranksBot: true }), idx).reason, 'protected');
  assert.equal(planMember(member({ id: '999', displayName: 'dboy1011' }), idx).reason, 'unknown to the OS');
});
