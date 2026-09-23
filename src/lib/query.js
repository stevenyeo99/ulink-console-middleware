// Shared query-string parsing. typeof checks block ?x[$ne]=y being parsed into a Mongo operator.
const SCAN_ID = /^[A-Za-z0-9_-]{3,64}$/;
const BARCODE_ID = /^[A-Za-z0-9]{1,32}$/;

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function parsePaging(query, { defaultLimit, maxLimit }) {
  return {
    skip: toInt(query.skip, 0),
    limit: Math.min(toInt(query.limit, defaultLimit), maxLimit) || 1,
  };
}

// scanId is used as an unanchored regex (LIKE '%x%'); the pattern guarantees no regex metacharacters.
// ponytail: no index on submissions.scanId, so this scans the collection; add { scanId: 1 } index when it gets slow.
function scanIdFilter(value) {
  const scanId = str(value);
  return SCAN_ID.test(scanId) ? { scanId: { $regex: scanId } } : null;
}

function barcodeIdFilter(value) {
  const barcodeId = str(value);
  return BARCODE_ID.test(barcodeId) ? { barcodeId } : null;
}

module.exports = { str, parsePaging, scanIdFilter, barcodeIdFilter };
