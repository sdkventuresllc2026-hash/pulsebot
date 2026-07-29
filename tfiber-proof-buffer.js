const DEFAULT_WINDOW_MS = 2 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 100;

function normalizeTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Date.now();
}

function normalizeAttachments(attachments) {
  return (attachments || []).filter((att) => att && att.isScreenshot);
}

function createTfiberProofBuffer({ windowMs = DEFAULT_WINDOW_MS, maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
  const entries = [];

  function prune(nowMs = Date.now()) {
    const cutoff = nowMs - windowMs;
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      if (entries[i].createdTimestamp < cutoff) entries.splice(i, 1);
    }
    while (entries.length > maxEntries) entries.shift();
  }

  function remember(entry) {
    const attachments = normalizeAttachments(entry?.attachments);
    if (!entry?.messageId || !entry?.userId || !entry?.channelId || !attachments.length) return null;
    const createdTimestamp = normalizeTimestamp(entry.createdTimestamp);
    prune(createdTimestamp);
    const existingIndex = entries.findIndex((item) => item.messageId === entry.messageId);
    if (existingIndex !== -1) entries.splice(existingIndex, 1);
    const stored = {
      messageId: String(entry.messageId),
      userId: String(entry.userId),
      channelId: String(entry.channelId),
      createdTimestamp,
      content: String(entry.content || ''),
      attachments,
    };
    entries.push(stored);
    return stored;
  }

  function consume({ userId, channelId, nowMs = Date.now(), excludeMessageId = null } = {}) {
    prune(nowMs);
    const candidates = entries
      .filter((entry) => entry.userId === String(userId || ''))
      .filter((entry) => entry.channelId === String(channelId || ''))
      .filter((entry) => !excludeMessageId || entry.messageId !== String(excludeMessageId))
      .filter((entry) => entry.createdTimestamp <= nowMs && nowMs - entry.createdTimestamp <= windowMs)
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    if (candidates.length !== 1) {
      return { entry: null, reason: candidates.length ? 'ambiguous' : 'none', candidateCount: candidates.length };
    }
    const [entry] = candidates;
    const index = entries.findIndex((item) => item.messageId === entry.messageId);
    if (index !== -1) entries.splice(index, 1);
    return { entry, reason: 'matched_recent_screenshot', candidateCount: 1 };
  }

  return {
    remember,
    consume,
    prune,
    size: () => entries.length,
    entriesForTest: () => entries.slice(),
  };
}

function messageWithBufferedProof(message, entry) {
  if (!entry) return message;
  const attachments = new Map();
  for (const [index, att] of entry.attachments.entries()) {
    attachments.set(att.id || `${entry.messageId}:${index}`, att);
  }
  const content = [entry.content, message.content].filter((part) => String(part || '').trim()).join('\n');
  return {
    ...message,
    id: message.id,
    content,
    attachments,
    pulseBufferedProofMessageId: entry.messageId,
  };
}

module.exports = {
  DEFAULT_WINDOW_MS,
  createTfiberProofBuffer,
  messageWithBufferedProof,
};
