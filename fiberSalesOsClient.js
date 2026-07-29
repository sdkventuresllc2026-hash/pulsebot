function osBaseUrl() {
  return String(process.env.FIBERSALES_OS_URL || process.env.PULSE_OS_BASE_URL || '').replace(/\/+$/, '');
}

function osSecret() {
  return process.env.PULSE_OS_SECRET || process.env.DISCORD_PROOF_SECRET || '';
}

function isFiberSalesOsConfigured() {
  return !!(osBaseUrl() && osSecret());
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

module.exports = {
  isFiberSalesOsConfigured,
  postTfiberDiscordProof,
};
