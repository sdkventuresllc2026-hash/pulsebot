const test = require('node:test');
const assert = require('node:assert/strict');

const { mergeTfiberExtractions } = require('./tfiber-proof-extraction');

test('merges multiple screenshots for one T-Fiber order without guessing missing repeated fields', () => {
  const merged = mergeTfiberExtractions([
    {
      orderConfirmationNumber: 'TMO-20260729-ABC12',
      customerName: 'Jane Doe',
      customerPhone: null,
      serviceAddress: null,
      installationDate: null,
      installationTimeWindow: null,
      confidence: 0.94,
    },
    {
      orderConfirmationNumber: null,
      customerName: null,
      customerPhone: '9105551212',
      serviceAddress: '123 Main St',
      city: 'Wilmington',
      state: 'NC',
      zip: '28401',
      installationDate: 'July 31, 2026',
      installationTimeWindow: '8 AM - 10 AM',
      confidence: 0.9,
    },
  ], { fallbackTmoOrderId: 'TMO20260729ABC12' });

  assert.equal(merged.extracted.orderConfirmationNumber, 'TMO20260729ABC12');
  assert.equal(merged.extracted.customerName, 'Jane Doe');
  assert.equal(merged.extracted.customerPhone, '910-555-1212');
  assert.equal(merged.extracted.serviceAddress, '123 Main St');
  assert.equal(merged.extracted.installationTimeWindow, '8 AM - 10 AM');
  assert.ok(!merged.missingFields.includes('customerPhone'));
});

test('refuses to merge screenshots with conflicting T-Mobile order ids', () => {
  const merged = mergeTfiberExtractions([
    { orderConfirmationNumber: 'TMO20260729AAAAA', customerName: 'Jane Doe', confidence: 0.95 },
    { orderConfirmationNumber: 'TMO20260729BBBBB', customerName: 'Jane Doe', confidence: 0.95 },
  ]);

  assert.equal(merged.extracted.extractionStatus, 'NEEDS_REVIEW');
  assert.equal(merged.extracted.orderConfirmationNumber, null);
  assert.ok(merged.missingFields.includes('orderConfirmationNumberConflict'));
});
