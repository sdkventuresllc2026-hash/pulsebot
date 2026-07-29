const { extractTmoOrderId, normalizeTmoOrderId } = require('./tfiber-proof');

const DEFAULT_MODEL = process.env.TFIBER_PROOF_EXTRACTOR_MODEL || 'gpt-4.1-mini';
const MAX_SCREENSHOTS = 4;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function isTfiberProofExtractionConfigured() {
  return !!process.env.OPENAI_API_KEY && process.env.TFIBER_PROOF_EXTRACTION_DISABLED !== '1';
}

function textFromResponse(json) {
  if (typeof json?.output_text === 'string') return json.output_text;
  const pieces = [];
  for (const item of json?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') pieces.push(content.text);
    }
  }
  return pieces.join('\n').trim();
}

function parseJsonObject(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    const match = String(value).match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function imageToDataUrl(att, fetchImpl = fetch) {
  const url = att?.url || att?.proxyURL;
  if (!url) return null;
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`image download failed: HTTP ${response.status}`);
  const contentType = String(response.headers.get('content-type') || att.contentType || 'image/png').split(';')[0].trim();
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('image too large for proof extraction');
  return `data:${contentType};base64,${bytes.toString('base64')}`;
}

function extractionPrompt({ rawText, index, total }) {
  return [
    'Extract T-Mobile Fiber order details from this screenshot.',
    'Calibration: Jacksonville/T-Fiber screenshots usually show a mobile browser page from fiber.t-mobile.com with either "Order details" or "Thank you for your order!"',
    'Common visible sections are: "Order number:", "Plans and equipment", "Service address", "Contact info", "Installation details", "Order summary", and "Payment info".',
    'The order confirmation number is the value after "Order number:" and must start with TMO. Ignore Dealer Code, NTID, reference numbers, confirmation numbers from other providers, browser address bars, and timestamps.',
    'Service address is the text under "Service address". Contact info usually appears as customer name, email, then phone; capture the name and phone, ignore the email unless it helps identify the contact section.',
    'Installation date/time are only valid when the "Installation details" section is visible. If that section is below the fold or hidden by the browser bar, return null for install date/time.',
    'Promotions usually appear as bullets under "Discounts and promotions", such as AutoPay discount or one month free. Capture visible promo text exactly and do not invent dollar amounts.',
    'If the screenshot is a selfie/photo, generic text message, Kinetic review page, or anything that is not a T-Mobile Fiber order page, set extractionStatus to NOT_ORDER_SCREENSHOT and return null for all fields.',
    'Return only facts visibly present in the image or explicitly typed in the message context.',
    'Do not infer, guess, autocorrect names, invent promotions, or combine two customers.',
    'If a field is not visible, return null for that field.',
    'Useful fields: T-Mobile order confirmation number, customer name, customer phone, service address, unit, city, state, zip, installation date, installation time/window, promotion, monthly price.',
    `Screenshot ${index} of ${total}. Message text context: ${rawText || '(none)'}`,
  ].join('\n');
}

function extractionSchema() {
  return {
    type: 'json_schema',
    name: 'tfiber_order_screenshot',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        extractionStatus: {
          type: 'string',
          enum: ['ORDER_DETAILS', 'ORDER_SUMMARY', 'NOT_ORDER_SCREENSHOT', 'UNCLEAR'],
        },
        orderConfirmationNumber: { type: ['string', 'null'] },
        customerName: { type: ['string', 'null'] },
        customerPhone: { type: ['string', 'null'] },
        serviceAddress: { type: ['string', 'null'] },
        unit: { type: ['string', 'null'] },
        city: { type: ['string', 'null'] },
        state: { type: ['string', 'null'] },
        zip: { type: ['string', 'null'] },
        installationDate: { type: ['string', 'null'] },
        installationTimeWindow: { type: ['string', 'null'] },
        promotion: { type: ['string', 'null'] },
        monthlyPrice: { type: ['string', 'null'] },
        confidence: { type: 'number' },
        notes: { type: ['string', 'null'] },
      },
      required: [
        'extractionStatus',
        'orderConfirmationNumber',
        'customerName',
        'customerPhone',
        'serviceAddress',
        'unit',
        'city',
        'state',
        'zip',
        'installationDate',
        'installationTimeWindow',
        'promotion',
        'monthlyPrice',
        'confidence',
        'notes',
      ],
    },
  };
}

async function extractOneScreenshot({ attachment, rawText, index, total, fetchImpl = fetch }) {
  const imageUrl = await imageToDataUrl(attachment, fetchImpl);
  if (!imageUrl) return null;
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0,
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: extractionPrompt({ rawText, index, total }) },
          { type: 'input_image', image_url: imageUrl },
        ],
      }],
      text: { format: extractionSchema() },
    }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.error?.message || `OpenAI extraction failed: HTTP ${response.status}`);
  const parsed = parseJsonObject(textFromResponse(json));
  return parsed ? normalizeExtraction(parsed, attachment) : null;
}

function clean(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || null;
}

function normalizePhone(value) {
  const text = clean(value);
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  if (digits.length === 10) return digits.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1).replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  return text;
}

function normalizeExtraction(item, attachment = null) {
  return {
    extractionStatus: ['ORDER_DETAILS', 'ORDER_SUMMARY', 'NOT_ORDER_SCREENSHOT', 'UNCLEAR'].includes(item.extractionStatus)
      ? item.extractionStatus
      : 'UNCLEAR',
    attachmentId: attachment?.id || null,
    attachmentName: attachment?.name || null,
    orderConfirmationNumber: normalizeTmoOrderId(item.orderConfirmationNumber) || extractTmoOrderId(item.orderConfirmationNumber),
    customerName: clean(item.customerName),
    customerPhone: normalizePhone(item.customerPhone),
    serviceAddress: clean(item.serviceAddress),
    unit: clean(item.unit),
    city: clean(item.city),
    state: clean(item.state),
    zip: clean(item.zip),
    installationDate: clean(item.installationDate),
    installationTimeWindow: clean(item.installationTimeWindow),
    promotion: clean(item.promotion),
    monthlyPrice: clean(item.monthlyPrice),
    confidence: typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : null,
    notes: clean(item.notes),
  };
}

function pickUnique(items, field, conflicts) {
  const values = [...new Set(items.map((item) => clean(item[field])).filter(Boolean))];
  if (values.length <= 1) return values[0] || null;
  conflicts.push(field);
  return null;
}

function mergeTfiberExtractions(items, { fallbackTmoOrderId = null } = {}) {
  const allItems = (items || []).filter(Boolean).map((item) => normalizeExtraction(item));
  const normalizedItems = allItems.filter((item) => item.extractionStatus !== 'NOT_ORDER_SCREENSHOT');
  const conflicts = [];
  const ids = [...new Set(normalizedItems.map((item) => normalizeTmoOrderId(item.orderConfirmationNumber)).filter(Boolean))];
  const fallbackId = normalizeTmoOrderId(fallbackTmoOrderId);
  if (fallbackId && ids.length && !ids.includes(fallbackId)) conflicts.push('orderConfirmationNumber');
  if (ids.length > 1) conflicts.push('orderConfirmationNumber');

  const extracted = {
    extractionStatus: conflicts.includes('orderConfirmationNumber') ? 'NEEDS_REVIEW' : 'EXTRACTED',
    extractionSource: 'OPENAI_VISION',
    screenshotCount: allItems.length,
    orderScreenshotCount: normalizedItems.length,
    orderConfirmationNumber: conflicts.includes('orderConfirmationNumber') ? null : (ids[0] || fallbackId || null),
    customerName: pickUnique(normalizedItems, 'customerName', conflicts),
    customerPhone: pickUnique(normalizedItems, 'customerPhone', conflicts),
    serviceAddress: pickUnique(normalizedItems, 'serviceAddress', conflicts),
    unit: pickUnique(normalizedItems, 'unit', conflicts),
    city: pickUnique(normalizedItems, 'city', conflicts),
    state: pickUnique(normalizedItems, 'state', conflicts),
    zip: pickUnique(normalizedItems, 'zip', conflicts),
    installationDate: pickUnique(normalizedItems, 'installationDate', conflicts),
    installationTimeWindow: pickUnique(normalizedItems, 'installationTimeWindow', conflicts),
    promotion: pickUnique(normalizedItems, 'promotion', conflicts),
    monthlyPrice: pickUnique(normalizedItems, 'monthlyPrice', conflicts),
    fieldConflicts: [...new Set(conflicts)],
    screenshots: allItems,
  };

  const missingFields = [];
  if (!normalizedItems.length) missingFields.push('orderScreenshot');
  if (!extracted.orderConfirmationNumber) missingFields.push('orderConfirmationNumber');
  if (!extracted.customerName) missingFields.push('customerName');
  if (!extracted.customerPhone) missingFields.push('customerPhone');
  if (!extracted.serviceAddress) missingFields.push('serviceAddress');
  if (!extracted.installationDate) missingFields.push('installationDate');
  if (!extracted.installationTimeWindow) missingFields.push('installationTimeWindow');
  for (const field of extracted.fieldConflicts) missingFields.push(`${field}Conflict`);

  const confidenceValues = normalizedItems.map((item) => item.confidence).filter((value) => typeof value === 'number');
  const confidence = confidenceValues.length ? Math.min(...confidenceValues) : null;
  return { extracted, missingFields: [...new Set(missingFields)], confidence };
}

async function enrichTfiberProofPayload(payload, { fetchImpl = fetch } = {}) {
  const attachments = Array.isArray(payload?.attachments) ? payload.attachments.filter((att) => att?.isScreenshot).slice(0, MAX_SCREENSHOTS) : [];
  if (!attachments.length || !isTfiberProofExtractionConfigured()) return payload;
  try {
    const extractedItems = [];
    for (let i = 0; i < attachments.length; i += 1) {
      const extracted = await extractOneScreenshot({
        attachment: attachments[i],
        rawText: payload.rawText,
        index: i + 1,
        total: attachments.length,
        fetchImpl,
      });
      if (extracted) extractedItems.push(extracted);
    }
    if (!extractedItems.length) return payload;
    const merged = mergeTfiberExtractions(extractedItems, { fallbackTmoOrderId: payload.tmoOrderId });
    return {
      ...payload,
      tmoOrderId: payload.tmoOrderId || merged.extracted.orderConfirmationNumber || null,
      tmoOrderIdSource: payload.tmoOrderId
        ? payload.tmoOrderIdSource
        : (merged.extracted.orderConfirmationNumber ? 'SCREENSHOT_OCR' : payload.tmoOrderIdSource),
      confidence: typeof payload.confidence === 'number' ? payload.confidence : merged.confidence,
      extracted: merged.extracted,
      missingFields: merged.missingFields,
    };
  } catch (err) {
    console.error('[Pulse][T-Fiber] proof extraction skipped:', err.message || err);
    return payload;
  }
}

module.exports = {
  isTfiberProofExtractionConfigured,
  mergeTfiberExtractions,
  enrichTfiberProofPayload,
};
