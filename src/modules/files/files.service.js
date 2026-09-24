const fs = require('fs');
const path = require('path');
const db = require('../../lib/db');
const yazl = require('yazl');
const { downloadMaterial, fetchMaterial } = require('./files.graph');

// Submissions matching filter, newest first, each with its materials' fs.files details.
async function listMaterials(filter, { skip, limit }) {
  const docs = await db.db().collection('submissions')
    .find(filter, { projection: { _id: 0, barcodeId: 1, scanId: 1, createdAt: 1, materials: 1 } })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit + 1)
    .toArray();
  const submissions = docs.slice(0, limit);

  const names = [].concat(...submissions.map((s) => s.materials || []));
  const files = await db.db().collection('fs.files')
    .find({ filename: { $in: names } }, {
      projection: { filename: 1, content_type: 1, 'metadata.mimetype': 1, 'metadata.originalname': 1, length: 1, uploadDate: 1 },
    })
    .sort({ uploadDate: 1 })
    .toArray();
  // Same filename uploaded twice: ascending sort means the latest revision wins.
  const byName = new Map(files.map((f) => [f.filename, f]));

  return {
    items: submissions.map((s) => ({
      barcodeId: s.barcodeId,
      scanId: s.scanId,
      createdAt: s.createdAt,
      materials: (s.materials || []).map((material) => {
        const f = byName.get(material);
        if (!f) return { material, missing: true };
        return {
          material,
          originalname: f.metadata && f.metadata.originalname,
          contentType: f.content_type || (f.metadata && f.metadata.mimetype),
          length: f.length,
          uploadDate: f.uploadDate,
        };
      }),
    })),
    hasMore: docs.length > limit,
  };
}

// originalname comes from the caller, so reduce it to a plain file name; '.'/'..'/empty fall back to the material id.
function safeName(name, material) {
  const clean = path.basename(String(name || '')).replace(/[^A-Za-z0-9._-]/g, '_');
  return /^\.*$/.test(clean) ? material : clean;
}

// File name per material within one item; a clash gets the material id prefixed.
function fileNames(materials) {
  const used = new Set();
  return materials.map(({ material, originalname }) => {
    let name = safeName(originalname, material);
    if (used.has(name)) name = `${material}-${name}`;
    used.add(name);
    return { material, name };
  });
}

// Downloads each item's materials into <outputDir>/<barcodeId>/<originalname>, overwriting existing files.
// items are shaped like listMaterials() output: [{ barcodeId, materials: [{ material, originalname }] }].
async function downloadMaterials(items, outputDir) {
  const out = [];
  for (const item of items) {
    const dir = path.join(outputDir, item.barcodeId);
    await fs.promises.mkdir(dir, { recursive: true });

    const results = [];
    // ponytail: sequential downloads; add limited concurrency if large batches get slow.
    for (const { material, name } of fileNames(item.materials)) {
      const file = path.join(dir, name);
      try {
        results.push({ material, status: 'saved', file, bytes: await downloadMaterial(material, file) });
      } catch (err) {
        results.push({ material, status: 'failed', error: err.message });
      }
    }
    out.push({ barcodeId: item.barcodeId, outputDir: dir, results });
  }
  return { items: out };
}

// Fetches each item's materials into a zip laid out as <scanId>/<barcodeId>/<name>; failed images are left out.
// Returns { zip: null, items } with per-material results when nothing was fetched, so the caller can answer 502.
// ponytail: whole batch held in memory (<= 100 images) before sending; stream entries if the limit grows.
async function zipMaterials(items, scanId) {
  const entries = [];
  const out = [];
  for (const item of items) {
    const results = [];
    for (const { material, name } of fileNames(item.materials)) {
      try {
        const data = await fetchMaterial(material);
        entries.push({ data, file: `${scanId}/${item.barcodeId}/${name}` });
      } catch (err) {
        results.push({ material, status: 'failed', error: err.message });
      }
    }
    out.push({ barcodeId: item.barcodeId, results });
  }
  if (!entries.length) return { zip: null, items: out };

  const zip = new yazl.ZipFile();
  // Images are already compressed; storing them skips wasted CPU.
  for (const { data, file } of entries) zip.addBuffer(data, file, { compress: false });
  zip.end();
  return { zip };
}

module.exports = { listMaterials, downloadMaterials, zipMaterials };
