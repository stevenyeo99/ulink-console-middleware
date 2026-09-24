const path = require('path');
const { pipeline } = require('stream');
const express = require('express');
const asyncHandler = require('../../lib/asyncHandler');
const { str, parsePaging, scanIdFilter, barcodeIdFilter } = require('../../lib/query');
const service = require('./files.service');

const router = express.Router();

router.get('/materials', asyncHandler(async (req, res) => {
  const hasScan = str(req.query.scanId) !== '';
  const hasBarcode = str(req.query.barcodeId) !== '';
  if (hasScan === hasBarcode) {
    return res.status(400).json({ error: 'Provide exactly one of scanId or barcodeId' });
  }
  const filter = hasScan ? scanIdFilter(req.query.scanId) : barcodeIdFilter(req.query.barcodeId);
  if (!filter) {
    return res.status(400).json({
      error: hasScan ? 'scanId must be 3-64 chars of letters, digits, _ or -' : 'barcodeId must be 1-32 letters or digits',
    });
  }
  res.json(await service.listMaterials(filter, parsePaging(req.query, { defaultLimit: 10, maxLimit: 50 })));
}));

const MATERIAL = /^[A-Za-z0-9]{16,128}$/;
const MAX_MATERIALS = 100;

// Resolves outputDownloadPath (relative, or absolute inside DOWNLOAD_ROOT); null if it escapes the root.
function resolveOutputDir(value) {
  const p = str(value);
  if (!p) return null;
  const root = path.resolve(process.env.DOWNLOAD_ROOT);
  const full = path.resolve(root, p);
  const rel = path.relative(root, full);
  return rel.startsWith('..') || path.isAbsolute(rel) ? null : full;
}

// Accepts the /materials response items; keeps only the fields needed and rejects anything malformed.
function parseItems(items) {
  if (!Array.isArray(items) || !items.length) return null;
  const parsed = [];
  for (const item of items) {
    const filter = item && barcodeIdFilter(item.barcodeId);
    if (!filter || !Array.isArray(item.materials) || !item.materials.length) return null;
    const seen = new Set();
    const materials = [];
    for (const m of item.materials) {
      if (!m || typeof m.material !== 'string' || !MATERIAL.test(m.material)) return null;
      if (seen.has(m.material)) continue;
      seen.add(m.material);
      materials.push({ material: m.material, originalname: typeof m.originalname === 'string' ? m.originalname : '' });
    }
    parsed.push({ barcodeId: filter.barcodeId, scanId: str(item.scanId), materials });
  }
  return parsed;
}

// Shared body checks for both download endpoints; returns { items } or { error }.
function readItems(body) {
  const items = parseItems(body.items);
  if (!items) {
    return { error: 'items must be the /materials response items: [{ barcodeId, materials: [{ material, originalname }] }]' };
  }
  const total = items.reduce((n, i) => n + i.materials.length, 0);
  if (total > MAX_MATERIALS) {
    return { error: `At most ${MAX_MATERIALS} materials per request (got ${total})` };
  }
  return { items };
}

router.post('/download', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const { items, error } = readItems(body);
  if (error) return res.status(400).json({ error });

  const outputDir = resolveOutputDir(body.outputDownloadPath);
  if (!outputDir) {
    return res.status(400).json({ error: 'outputDownloadPath must be inside DOWNLOAD_ROOT' });
  }

  res.json(await service.downloadMaterials(items, outputDir));
}));

// Same input as /download plus the scanId the caller searched with; responds with <scanId>.zip, nothing saved on disk.
router.post('/download/zip', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const scanId = str(body.scanId);
  if (!scanIdFilter(scanId)) {
    return res.status(400).json({ error: 'scanId must be 3-64 chars of letters, digits, _ or -' });
  }
  const { items, error } = readItems(body);
  if (error) return res.status(400).json({ error });
  // Keeps the zip name honest: every submission in it must belong to the scan it's named after.
  const stray = items.find((i) => !i.scanId.includes(scanId));
  if (stray) {
    return res.status(400).json({ error: `items[].scanId must contain ${scanId} (barcode ${stray.barcodeId} does not)` });
  }

  const { zip, items: results } = await service.zipMaterials(items, scanId);
  if (!zip) return res.status(502).json({ error: 'No materials could be downloaded', items: results });

  res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${scanId}.zip"` });
  // pipeline stops the zip stream if the client disconnects; headers are sent, so there is nothing else to report.
  pipeline(zip.outputStream, res, () => {});
}));

module.exports = router;
