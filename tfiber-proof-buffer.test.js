const assert = require('node:assert/strict');
const test = require('node:test');
const { createTfiberProofBuffer, messageWithBufferedProof } = require('./tfiber-proof-buffer');

const screenshot = (id = 'att-1') => ({ id, isScreenshot: true, url: `https://cdn.example/${id}.png` });

test('matches exactly one screenshot from the same rep and channel posted right before a deal', () => {
  const buffer = createTfiberProofBuffer({ windowMs: 120_000 });
  buffer.remember({
    messageId: 'proof-1',
    userId: 'u1',
    channelId: 'c1',
    createdTimestamp: 1_000,
    content: 'TMO20260729ABC123',
    attachments: [screenshot()],
  });

  const result = buffer.consume({ userId: 'u1', channelId: 'c1', nowMs: 1_500, excludeMessageId: 'deal-1' });
  assert.equal(result.reason, 'matched_recent_screenshot');
  assert.equal(result.entry.messageId, 'proof-1');
  assert.equal(buffer.size(), 0);
});

test('refuses to auto-match when multiple recent screenshots could belong to the deal', () => {
  const buffer = createTfiberProofBuffer({ windowMs: 120_000 });
  buffer.remember({ messageId: 'proof-1', userId: 'u1', channelId: 'c1', createdTimestamp: 1_000, attachments: [screenshot('a1')] });
  buffer.remember({ messageId: 'proof-2', userId: 'u1', channelId: 'c1', createdTimestamp: 1_100, attachments: [screenshot('a2')] });

  const result = buffer.consume({ userId: 'u1', channelId: 'c1', nowMs: 1_500 });
  assert.equal(result.reason, 'ambiguous');
  assert.equal(result.entry, null);
  assert.equal(buffer.size(), 2);
});

test('does not match old screenshots, other channels, or other reps', () => {
  const buffer = createTfiberProofBuffer({ windowMs: 120_000 });
  buffer.remember({ messageId: 'old', userId: 'u1', channelId: 'c1', createdTimestamp: 1_000, attachments: [screenshot('old')] });
  buffer.remember({ messageId: 'other-user', userId: 'u2', channelId: 'c1', createdTimestamp: 200_000, attachments: [screenshot('u2')] });
  buffer.remember({ messageId: 'other-channel', userId: 'u1', channelId: 'c2', createdTimestamp: 200_000, attachments: [screenshot('c2')] });

  assert.equal(buffer.consume({ userId: 'u1', channelId: 'c1', nowMs: 200_000 }).reason, 'none');
  assert.equal(buffer.consume({ userId: 'u2', channelId: 'c2', nowMs: 200_000 }).reason, 'none');
});

test('builds a synthetic proof message without changing the deal message id', () => {
  const deal = { id: 'deal-1', content: '1g', attachments: new Map(), author: { id: 'u1' } };
  const proof = { messageId: 'proof-1', content: 'TMO20260729ABC123', attachments: [screenshot('att-1')] };
  const merged = messageWithBufferedProof(deal, proof);

  assert.equal(merged.id, 'deal-1');
  assert.equal(merged.content, 'TMO20260729ABC123\n1g');
  assert.equal(merged.attachments.size, 1);
  assert.equal(merged.pulseBufferedProofMessageId, 'proof-1');
});
