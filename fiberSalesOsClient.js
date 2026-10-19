function osBaseUrl() {
  return String(process.env.FIBERSALES_OS_URL || process.env.PULSE_OS_BASE_URL || '').replace(/\/+$/, '');
}

function osSecret() {
  return process.env.PULSE_OS_SECRET || process.env.DISCORD_PROOF_SECRET || '';
}

function isFiberSalesOsConfigured() {
  return !!(osBaseUrl() && osSecret());
}

/** Details added after the first proof: a follow-up screenshot, a typed install time, the tapped speed
 *  (owner 2026-10-19). Returns the OS answer ({ found, orderId, missingFields, sourceMessageId, … }) or null. Never throws. */
async function postOrderDetails(payload, fetchImpl = fetch) {
  if (!isFiberSalesOsConfigured()) return null;
  try {
    const response = await fetchImpl(`${osBaseUrl()}/api/internal/discord/order-details`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pulse-os-secret': osSecret() },
      body: JSON.stringify(payload),
    });
    const json = await response.json().catch(() => null);
    return response.ok && !json?.error ? (json?.data ?? json) : null;
  } catch (err) {
    console.error('[Pulse][T-Fiber] order details failed:', err?.message || err);
    return null;
  }
}

async function postTfiberDiscordProof(payload, fetchImpl = fetch) {
  if (!isFiberSalesOsConfigured()) {
    return {
      ok: false,
      disabled: true,
      status: 'SYNC_DISABLED',
      message: 'FiberSales OS sync is not configured on PulseBot.',
    };
  }

  const response = await fetchImpl(`${osBaseUrl()}/api/internal/discord/tfiber-proof`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-pulse-os-secret': osSecret(),
    },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.error) {
    return {
      ok: false,
      status: json?.data?.status || 'SYNC_FAILED',
      message: json?.error || `FiberSales OS returned HTTP ${response.status}.`,
      httpStatus: response.status,
    };
  }
  return {
    ok: true,
    ...(json?.data || {}),
  };
}

/** A crew renamed its market: keep the OS blitz in step (name + location). Never throws. */
async function postBlitzMove({ market, name, location }, fetchImpl = fetch) {
  if (!isFiberSalesOsConfigured()) return { ok: false, disabled: true };
  try {
    const response = await fetchImpl(`${osBaseUrl()}/api/internal/discord/blitz-move`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pulse-os-secret': osSecret() },
      body: JSON.stringify({ market, name, location }),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || json?.error) return { ok: false, message: json?.error || `HTTP ${response.status}` };
    return { ok: true, ...(json?.data || {}) };
  } catch (err) {
    return { ok: false, message: err?.message || String(err) };
  }
}

/** Who is active / inactive on the org chart, with Discord ids (access sync, 2026-10-15). Never throws. */
async function fetchAccessRoster(fetchImpl = fetch) {
  if (!isFiberSalesOsConfigured()) return { ok: false, disabled: true, status: 'SYNC_DISABLED' };
  try {
    const response = await fetchImpl(`${osBaseUrl()}/api/internal/discord/access`, { headers: { 'x-pulse-os-secret': osSecret() } });
    const json = await response.json().catch(() => null);
    if (!response.ok || json?.error) return { ok: false, message: json?.error || `HTTP ${response.status}` };
    const active = json?.data?.active || [];
    require('./real-names').setFromRoster(active);
    return { ok: true, active, inactive: json?.data?.inactive || [] };
  } catch (err) {
    return { ok: false, message: err?.message || String(err) };
  }
}

/** Link a Discord account: exact unique name, or an exact person ({ kind, id }) from a personal
 *  invite join (matchedBy 'INVITE') or a manager's one-tap pick. Never throws. */
async function postDiscordLink({ discordUserId, name, person, matchedBy }, fetchImpl = fetch) {
  if (!isFiberSalesOsConfigured()) return { ok: false, disabled: true };
  try {
    const response = await fetchImpl(`${osBaseUrl()}/api/internal/discord/access`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pulse-os-secret': osSecret() },
      body: JSON.stringify({ discordUserId, name, person, matchedBy }),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || json?.error) return { ok: false, message: json?.error || `HTTP ${response.status}` };
    return { ok: true, ...(json?.data || {}) };
  } catch (err) {
    return { ok: false, message: err?.message || String(err) };
  }
}

/** Store/remove personal invite codes in the OS (fibersales.co/discord reads them). Never throws. */
async function postInviteCodes({ set = [], remove = [] }, fetchImpl = fetch) {
  if (!isFiberSalesOsConfigured()) return { ok: false, disabled: true };
  try {
    const response = await fetchImpl(`${osBaseUrl()}/api/internal/discord/invites`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-pulse-os-secret': osSecret() }, body: JSON.stringify({ set, remove }),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || json?.error) return { ok: false, message: json?.error || `HTTP ${response.status}` };
    return { ok: true, ...(json?.data || {}) };
  } catch (err) {
    return { ok: false, message: err?.message || String(err) };
  }
}

/** Weekly roster check (2026-10-15): applies auto-adds in the OS and returns the #management text. Never throws. */
async function postRosterCheck(fetchImpl = fetch) {
  if (!isFiberSalesOsConfigured()) return { ok: false, disabled: true };
  try {
    const response = await fetchImpl(`${osBaseUrl()}/api/internal/discord/roster-check`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-pulse-os-secret': osSecret() }, body: '{}',
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || json?.error) return { ok: false, message: json?.error || `HTTP ${response.status}` };
    return { ok: true, text: json?.data?.text || '', added: json?.data?.added || 0 };
  } catch (err) {
    return { ok: false, message: err?.message || String(err) };
  }
}

module.exports = {
  isFiberSalesOsConfigured,
  postTfiberDiscordProof,
  postBlitzMove,
  fetchAccessRoster,
  postOrderDetails,
  postDiscordLink,
  postInviteCodes,
  postRosterCheck,
};
