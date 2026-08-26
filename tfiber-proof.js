const TFIBER_PROOF_EXPIRATION_HOURS = 48;
const IMAGE_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

function normalizeTmoOrderId(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
  const match = normalized.match(/^TMO(20\d{2})(\d{2})(\d{2})([A-Z0-9]{5})$/);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? normalized : null;
}

function extractTmoOrderId(value) {
  const match = String(value || '').match(/\bTMO(?:-?[A-Z0-9]){13}\b/i);
  return normalizeTmoOrderId(match && match[0]);
}

function looksLikeTfiberContext({ channelName, blitzName, marketName, marketId, marketIsp }) {
  // An explicit ISP on the market wins over name-sniffing, both ways: a market set to "Kinetic"
  // never needs a TMO screenshot even if its channel is called "dayton"; a market set to
  // "T-Fiber" always does. (Ohio crews moved from T-Fiber to Kinetic in the same channel, 2026-08.)
  const isp = String(marketIsp || '').trim().toLowerCase();
  if (isp) return /\bt[-\s]?fiber\b|\bt[-\s]?mobile\b|\btmo\b/.test(isp);
  const haystack = [channelName, blitzName, marketName, marketId].filter(Boolean).join(' ').toLowerCase();
  return /\bt[-\s]?fiber\b|\bt[-\s]?mobile\b|\btmo\b|\bwilmington(?:-nc)?\b|\bjacksonville\b|\bgoldsboro\b|\bdayton\b/.test(haystack); // ohio removed: that channel sells Kinetic, no TMO proof
}

function requiresTfiberProof({ speeds, channelName, blitzName, marketName, marketId, marketIsp }) {
  return Array.isArray(speeds) && speeds.length > 0 && looksLikeTfiberContext({ channelName, blitzName, marketName, marketId, marketIsp });
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
  const missingContact = missing.some((field) => ['customerName', 'customerPhone', 'customerEmail'].includes(field));
  const missingAddress = missing.includes('serviceAddress');
  const missingInstall = missing.some((field) => ['installationDate', 'installationTimeWindow'].includes(field));
  const missingDetails = missingContact || missingAddress || missingInstall;
  const detailText = () => {
    if (missingContact && missingInstall) return 'Customer contact and install details still needed.';
    if (missingContact) return 'Customer contact details still needed.';
    if (missingAddress && missingInstall) return 'Service address and install details still needed.';
    if (missingAddress) return 'Service address still needed.';
    if (missingInstall) return 'Install details still needed.';
    return 'Details still needed.';
  };
  if (result.status === 'ORDER_CREATED') {
    return missingDetails
      ? `T-Fiber proof received. Synced to FiberSales OS. ${detailText()}`
      : 'T-Fiber proof received. Synced to FiberSales OS with customer details.';
  }
  if (result.status === 'PROOF_ATTACHED' || result.status === 'IDEMPOTENT_REPLAY') {
    return missingDetails
      ? `T-Fiber proof received. Matched in FiberSales OS. ${detailText()}`
      : 'T-Fiber proof received. Matched in FiberSales OS with customer details.';
  }
  if (result.status === 'NEEDS_SCREENSHOT') return 'T-Fiber proof needed: upload the order confirmation screenshot here or DM PulseBot within 48 hours.';
  if (result.status === 'UNLINKED_USER') return 'T-Fiber proof held: Discord user is not linked in FiberSales OS yet.';
  if (result.status === 'NEEDS_REVIEW') return 'T-Fiber proof needs review: reply with the TMO order ID or upload a clearer screenshot.';
  if (result.status === 'SYNC_DISABLED') return 'T-Fiber proof saved in Pulse. FiberSales OS sync is not configured yet.';
  return `T-Fiber proof status: ${result.message || result.status}.`;
}

// ---- Reminder / admin text. Reps only ever post "1g", so the identifiers a reminder CAN name are
// the plan, the channel, the time posted, the TMO number if known, and a jump link to their post.
const DEFAULT_TZ = 'America/New_York';

function formatWhen(iso, tz = DEFAULT_TZ) {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return 'unknown time';
  return d.toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function pendingJumpLink(pending) {
  return pending?.guildId && pending?.channelId && pending?.messageId
    ? `https://discord.com/channels/${pending.guildId}/${pending.channelId}/${pending.messageId}`
    : null;
}

function pendingNeeds(pending) {
  return pending?.proofStatus === 'NEEDS_REVIEW'
    ? 'the T-Mobile order number (TMO…), plus a clearer screenshot if you have one'
    : 'the order confirmation screenshot';
}

function describePendingProof(pending, { tz } = {}) {
  const parts = [
    pending?.plan || tfiberPlanForSpeed(pending?.speed),
    pending?.channelId ? `<#${pending.channelId}>` : pending?.marketName || pending?.blitzName || null,
    `posted ${formatWhen(pending?.timestamp || pending?.createdAt, tz)}`,
    pending?.tmoOrderId ? `order ${pending.tmoOrderId}` : null,
  ].filter(Boolean);
  const link = pendingJumpLink(pending);
  return `${parts.join(' · ')}${link ? ` → ${link}` : ''}`;
}

/** One DM per rep listing EVERY open deal, so "which account?" is never a question. */
function formatTfiberReminderDm(type, pendings, { tz } = {}) {
  const list = (pendings || []).filter(Boolean);
  if (type === 'expired') {
    return `T-Fiber proof expired — ${describePendingProof(list[0], { tz })}. It was removed from official Pulse totals until the screenshot is received.`;
  }
  const many = list.length > 1;
  const header = type === 'final'
    ? `⏰ Final reminder — ${many ? `these ${list.length} T-Fiber deals expire` : 'this T-Fiber deal expires'} in about 4 hours:`
    : `T-Fiber proof needed for ${many ? `these ${list.length} deals` : 'this deal'}:`;
  const lines = list.map((p, i) => `${many ? `${i + 1}) ` : ''}${describePendingProof(p, { tz })} — needs ${pendingNeeds(p)} · expires ${formatWhen(p.expiresAt, tz)}`);
  return [header, ...lines, '', 'Reply here with the screenshot AND the T-Mobile order number (TMO…) in the same message so I attach it to the right deal.'].join('\n');
}

/** Admin view (`pulse proofs`): everything open, grouped by rep, oldest first. */
function formatOpenProofsForAdmin(pendings, { tz, now = new Date() } = {}) {
  const list = (pendings || []).filter((p) => p && !p.reminders?.expiredAt);
  if (!list.length) return 'No open T-Fiber proof requests.';
  const byRep = new Map();
  for (const p of list) {
    const key = p.displayName || p.username || p.userId;
    byRep.set(key, [...(byRep.get(key) || []), p]);
  }
  const out = [`Open T-Fiber proof requests: ${list.length} across ${byRep.size} rep${byRep.size === 1 ? '' : 's'}`];
  for (const [rep, items] of [...byRep].sort((a, b) => b[1].length - a[1].length)) {
    out.push(`\n**${rep}** — ${items.length}`);
    for (const p of [...items].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))) {
      const hoursLeft = Math.max(0, Math.round((Date.parse(p.expiresAt || '') - now.getTime()) / 36e5));
      out.push(`• ${describePendingProof(p, { tz })} — needs ${pendingNeeds(p)} · ${hoursLeft}h left`);
    }
  }
  return out.join('\n');
}

module.exports = {
  TFIBER_PROOF_EXPIRATION_HOURS,
  describePendingProof,
  formatTfiberReminderDm,
  formatOpenProofsForAdmin,
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
