const TFIBER_PROOF_EXPIRATION_HOURS = 48;
const IMAGE_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

function normalizeTmoOrderId(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
  return /^TMO[A-Z0-9]{6,24}$/.test(normalized) ? normalized : null;
}

function extractTmoOrderId(value) {
  const match = String(value || '').match(/\bTMO(?:-?[A-Z0-9]){6,24}\b/i);
  return normalizeTmoOrderId(match && match[0]);
}

function looksLikeTfiberContext({ channelName, blitzName, marketName, marketId }) {
  const haystack = [channelName, blitzName, marketName, marketId].filter(Boolean).join(' ').toLowerCase();
  return /\bt[-\s]?fiber\b|\bt[-\s]?mobile\b|\btmo\b|\bwilmington(?:-nc)?\b|\bjacksonville\b/.test(haystack);
}

function requiresTfiberProof({ speeds, channelName, blitzName, marketName, marketId }) {
  return Array.isArray(speeds) && speeds.length > 0 && looksLikeTfiberContext({ channelName, blitzName, marketName, marketId });
}

function attachmentIsScreenshot(att) {
  const contentType = String(att?.contentType || '').toLowerCase();
  const name = String(att?.name || att?.filename || '').toLowerCase();
  if (IMAGE_CONTENT_TYPES.has(contentType)) return true;
  return /\.(png|jpe?g|webp)$/i.test(name);
}

function extractDiscordAttachments(message) {
  const values = Array.from(message?.attachments?.values?.() || []);
  return values.map((att) => ({
    id: att.id || null,
    name: att.name || null,
    contentType: att.contentType || null,
    url: att.url || null,
    proxyURL: att.proxyURL || null,
    size: att.size || null,
    isScreenshot: attachmentIsScreenshot(att),
  }));
}

function hasScreenshotAttachment(message) {
  return extractDiscordAttachments(message).some((att) => att.isScreenshot);
}

function proofExpiresAt(now = new Date()) {
  return new Date(now.getTime() + TFIBER_PROOF_EXPIRATION_HOURS * 60 * 60 * 1000);
}

function tfiberPlanForSpeed(speed) {
  if (speed === '2gig') return 'T-Fiber 2 Gig';
  if (speed === '1gig') return 'T-Fiber 1 Gig';
  if (speed === '500') return 'T-Fiber 500 Mbps';
  if (speed === '300') return 'T-Fiber 300 Mbps';
  if (speed === '200') return 'T-Fiber 200 Mbps';
  return 'T-Fiber';
}

function buildTfiberProofPayload({ message, logEntry, speed, blitzName, marketIdentity, hasScreenshot, now = new Date() }) {
  const attachments = extractDiscordAttachments(message);
  const tmoOrderId = extractTmoOrderId(message?.content);
  return {
    idempotencyKey: `pulse-log:${logEntry.id}:tfiber-proof`,
    discordGuildId: message.guild?.id || null,
    discordChannelId: message.channel?.id || logEntry.channelId || null,
    discordMessageId: message.id || logEntry.sourceMessageId || null,
    discordUserId: message.author.id,
    discordNickname: logEntry.displayName || message.member?.displayName || message.author.username,
    tmoOrderId,
    tmoOrderIdSource: tmoOrderId ? 'MESSAGE_TEXT' : null,
    confidence: tmoOrderId ? 1 : null,
    hasScreenshot,
    attachments,
    rawText: message.content || null,
    plan: tfiberPlanForSpeed(speed),
    saleDate: logEntry.timestamp || now.toISOString(),
    marketId: marketIdentity?.marketId || null,
    marketName: marketIdentity?.marketName || blitzName || null,
    missingFields: hasScreenshot ? ['serviceAddress', 'contactInfo', 'installationDetails'] : ['screenshot'],
  };
}

function buildTfiberDmPayload({ message, pending, hasScreenshot }) {
  const attachments = extractDiscordAttachments(message);
  const tmoOrderId = extractTmoOrderId(message?.content) || pending.tmoOrderId || null;
  return {
    idempotencyKey: `pulse-log:${pending.logId}:tfiber-proof:${message.id}`,
    discordGuildId: pending.guildId || null,
    discordChannelId: pending.channelId || null,
    discordMessageId: message.id || null,
    discordUserId: message.author.id,
    discordNickname: pending.displayName || message.author.username,
    tmoOrderId,
    tmoOrderIdSource: tmoOrderId ? 'DM_TEXT_OR_PENDING' : null,
    confidence: tmoOrderId ? 1 : null,
    hasScreenshot,
    attachments,
    rawText: message.content || null,
    plan: pending.plan || tfiberPlanForSpeed(pending.speed),
    saleDate: pending.timestamp || null,
    marketId: pending.marketId || null,
    marketName: pending.marketName || pending.blitzName || null,
    missingFields: hasScreenshot ? ['serviceAddress', 'contactInfo', 'installationDetails'] : ['screenshot'],
  };
}

function formatTfiberProofLine(result) {
  if (!result) return null;
  const missing = Array.isArray(result.missingFields) ? result.missingFields : [];
  const missingDetails = missing.some((field) => [
    'customerName',
    'customerPhone',
    'serviceAddress',
    'installationDate',
    'installationTimeWindow',
  ].includes(field));
  if (result.status === 'ORDER_CREATED') {
    return missingDetails
      ? 'T-Fiber proof received. Synced to FiberSales OS. Contact/install details still needed.'
      : 'T-Fiber proof received. Synced to FiberSales OS with contact/install details.';
  }
  if (result.status === 'PROOF_ATTACHED' || result.status === 'IDEMPOTENT_REPLAY') {
    return missingDetails
      ? 'T-Fiber proof received. Matched in FiberSales OS. Contact/install details still needed.'
      : 'T-Fiber proof received. Matched in FiberSales OS with contact/install details.';
  }
  if (result.status === 'NEEDS_SCREENSHOT') return 'T-Fiber proof needed: upload the order confirmation screenshot here or DM PulseBot within 48 hours.';
  if (result.status === 'UNLINKED_USER') return 'T-Fiber proof held: Discord user is not linked in FiberSales OS yet.';
  if (result.status === 'NEEDS_REVIEW') return 'T-Fiber proof needs review: reply with the TMO order ID or upload a clearer screenshot.';
  if (result.status === 'SYNC_DISABLED') return 'T-Fiber proof saved in Pulse. FiberSales OS sync is not configured yet.';
  return `T-Fiber proof status: ${result.message || result.status}.`;
}

module.exports = {
  TFIBER_PROOF_EXPIRATION_HOURS,
  normalizeTmoOrderId,
  extractTmoOrderId,
  looksLikeTfiberContext,
  requiresTfiberProof,
  extractDiscordAttachments,
  hasScreenshotAttachment,
  proofExpiresAt,
  buildTfiberProofPayload,
  buildTfiberDmPayload,
  formatTfiberProofLine,
  tfiberPlanForSpeed,
};
