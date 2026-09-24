// Downloads a material image from the graph service (images are not stored in fs.chunks).
const fs = require('fs');
const https = require('https');
const { pipeline } = require('stream');
const { promisify } = require('util');

const pipe = promisify(pipeline);
const TIMEOUT_MS = 30000;

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`graph returned HTTP ${res.statusCode}`));
      }
      resolve(res);
    });
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('graph request timed out')));
    req.on('error', reject);
  });
}

function getMaterial(material) {
  return get(process.env.GRAPH_MATERIAL_URL + encodeURIComponent(material));
}

// Writes to a .part file first so a failed download never leaves a truncated image; rename overwrites.
async function downloadMaterial(material, destPath) {
  const res = await getMaterial(material);
  const tmp = `${destPath}.part`;
  try {
    await pipe(res, fs.createWriteStream(tmp));
    await fs.promises.rename(tmp, destPath);
  } catch (err) {
    await fs.promises.unlink(tmp).catch(() => {});
    throw err;
  }
  return (await fs.promises.stat(destPath)).size;
}

// Reads the whole image into memory (for zips); a dropped connection rejects instead of returning a partial buffer.
async function fetchMaterial(material) {
  const res = await getMaterial(material);
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  return Buffer.concat(chunks);
}

module.exports = { downloadMaterial, fetchMaterial };
