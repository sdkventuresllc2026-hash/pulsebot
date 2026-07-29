const { mutate, readLeaderboard } = require('./storage');
const { normalizeTmoOrderId, proofExpiresAt } = require('./tfiber-proof');

function ensureTfiberProofState(data) {
  data.tfiberProofs = data.tfiberProofs && typeof data.tfiberProofs === 'object' ? data.tfiberProofs : {};
  data.tfiberProofs.pending =
    data.tfiberProofs.pending && typeof data.tfiberProofs.pending === 'object' ? data.tfiberProofs.pending : {};
  data.tfiberProofs.events = Array.isArray(data.tfiberProofs.events) ? data.tfiberProofs.events : [];
  return data.tfiberProofs;
}

function pendingFromLog({ logEntry, guildId, channelId, blitzName, marketIdentity, result, now = new Date() }) {
  return {
    logId: logEntry.id,
    userId: logEntry.userId,
    displayName: logEntry.displayName,
    username: logEntry.username,
    guildId: guildId || null,
    channelId: channelId || logEntry.channelId || null,
    messageId: logEntry.sourceMessageId || null,
    speed: logEntry.speed,
    plan: logEntry.speed === '1gig' ? 'T-Fiber 1 Gig' : 'T-Fiber',
    timestamp: logEntry.timestamp,
    blitzName: blitzName || logEntry.blitzName || null,
    marketId: marketIdentity?.marketId || logEntry.marketId || null,
    marketName: marketIdentity?.marketName || logEntry.marketName || null,
    tmoOrderId: result?.tmoOrderId || null,
    proofStatus: result?.status || 'NEEDS_SCREENSHOT',
    osOrderId: result?.orderId || null,
    osProofId: result?.proofId || null,
    createdAt: now.toISOString(),
    expiresAt: proofExpiresAt(now).toISOString(),
    reminders: {
      immediateAt: now.toISOString(),
      endOfDayAt: null,
      finalAt: null,
      expiredAt: null,
    },
  };
}

async function recordTfiberProofAttempt({ logEntry, guildId, channelId, blitzName, marketIdentity, result, now = new Date() }) {
  if (!logEntry?.id) return null;
  let pending = null;
  await mutate((data) => {
    const state = ensureTfiberProofState(data);
    const log = (data.logs || []).find((item) => item.id === logEntry.id);
    if (log) {
      log.tfiberProofStatus = result?.status || 'UNKNOWN';
      log.tfiberOsOrderId = result?.orderId || null;
      log.tfiberProofId = result?.proofId || null;
      log.tfiberProofExpiresAt = result?.status === 'NEEDS_SCREENSHOT' ? proofExpiresAt(now).toISOString() : null;
    }

    if (result?.status === 'NEEDS_SCREENSHOT' || result?.status === 'NEEDS_REVIEW' || result?.status === 'UNLINKED_USER') {
      pending = pendingFromLog({ logEntry, guildId, channelId, blitzName, marketIdentity, result, now });
      state.pending[logEntry.id] = pending;
    } else {
      delete state.pending[logEntry.id];
    }

    state.events.push({
      at: now.toISOString(),
      logId: logEntry.id,
      userId: logEntry.userId,
      status: result?.status || 'UNKNOWN',
      osOrderId: result?.orderId || null,
      osProofId: result?.proofId || null,
      message: result?.message || null,
    });
    if (state.events.length > 500) state.events = state.events.slice(-500);
    return data;
  });
  return pending;
}

async function markTfiberProofResolved({ logId, result, now = new Date() }) {
  await mutate((data) => {
    const state = ensureTfiberProofState(data);
    const pending = state.pending[logId];
    delete state.pending[logId];
    const log = (data.logs || []).find((item) => item.id === logId);
    if (log) {
      log.tfiberProofStatus = result?.status || 'PROOF_ATTACHED';
      log.tfiberOsOrderId = result?.orderId || null;
      log.tfiberProofId = result?.proofId || null;
      log.tfiberProofResolvedAt = now.toISOString();
      log.tfiberProofExpiresAt = null;
    }
    state.events.push({
      at: now.toISOString(),
      logId,
      userId: pending?.userId || log?.userId || null,
      status: result?.status || 'PROOF_ATTACHED',
      osOrderId: result?.orderId || null,
      osProofId: result?.proofId || null,
      message: result?.message || null,
    });
    return data;
  });
}

function activePendingForUser(state, userId) {
  return Object.values(state.pending || {})
    .filter((item) => item && item.userId === userId && !item.reminders?.expiredAt)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function selectPendingTfiberProof(pendingItems, { tmoOrderId } = {}) {
  const pending = (pendingItems || [])
    .filter((item) => item && !item.reminders?.expiredAt)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  if (!pending.length) return { pending: null, reason: 'none', pendingCount: 0 };

  const normalizedTmoOrderId = normalizeTmoOrderId(tmoOrderId);
  if (normalizedTmoOrderId) {
    const matches = pending.filter((item) => normalizeTmoOrderId(item.tmoOrderId) === normalizedTmoOrderId);
    if (matches.length === 1) return { pending: matches[0], reason: 'matched_tmo', pendingCount: pending.length };
    if (matches.length > 1) return { pending: null, reason: 'duplicate_tmo_pending', pendingCount: pending.length };
    if (pending.length === 1 && !normalizeTmoOrderId(pending[0].tmoOrderId)) {
      return { pending: pending[0], reason: 'single_pending_with_tmo', pendingCount: pending.length };
    }
    return { pending: null, reason: 'tmo_not_matched', pendingCount: pending.length };
  }

  if (pending.length === 1) return { pending: pending[0], reason: 'single_pending', pendingCount: 1 };
  return { pending: null, reason: 'ambiguous', pendingCount: pending.length };
}

async function selectPendingForUser(userId, { tmoOrderId } = {}) {
  const data = await readLeaderboard();
  const state = ensureTfiberProofState(data);
  return selectPendingTfiberProof(activePendingForUser(state, userId), { tmoOrderId });
}

async function latestPendingForUser(userId) {
  const { pending } = await selectPendingForUser(userId);
  return pending;
}

async function collectDueTfiberProofActions(now = new Date()) {
  const due = [];
  await mutate((data) => {
    const state = ensureTfiberProofState(data);
    const nowMs = now.getTime();
    for (const pending of Object.values(state.pending || {})) {
      if (!pending?.logId || pending.reminders?.expiredAt) continue;
      const createdMs = Date.parse(pending.createdAt || pending.timestamp || '');
      const expiresMs = Date.parse(pending.expiresAt || '');
      const reminders = pending.reminders || {};
      pending.reminders = reminders;

      if (Number.isFinite(expiresMs) && nowMs >= expiresMs) {
        reminders.expiredAt = now.toISOString();
        pending.proofStatus = 'EXPIRED';
        const log = (data.logs || []).find((item) => item.id === pending.logId);
        if (log) {
          log.removed = true;
          log.removedAt = now.toISOString();
          log.removedReason = 'T-Fiber screenshot proof not received within 48 hours.';
          log.tfiberProofStatus = 'EXPIRED';
        }
        due.push({ type: 'expired', pending });
        continue;
      }

      if (!reminders.endOfDayAt && Number.isFinite(createdMs) && nowMs - createdMs >= 8 * 60 * 60 * 1000) {
        reminders.endOfDayAt = now.toISOString();
        due.push({ type: 'end_of_day', pending });
      }

      if (!reminders.finalAt && Number.isFinite(expiresMs) && expiresMs - nowMs <= 4 * 60 * 60 * 1000) {
        reminders.finalAt = now.toISOString();
        due.push({ type: 'final', pending });
      }
    }
    return data;
  });
  return due;
}

module.exports = {
  ensureTfiberProofState,
  recordTfiberProofAttempt,
  markTfiberProofResolved,
  selectPendingTfiberProof,
  selectPendingForUser,
  latestPendingForUser,
  collectDueTfiberProofActions,
};
