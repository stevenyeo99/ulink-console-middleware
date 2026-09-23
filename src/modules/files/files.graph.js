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

// Writes to a .part file first so a failed download never leaves a truncated image; rename overwrites.
async function downloadMaterial(material, destPath) {
  const res = await get(process.env.GRAPH_MATERIAL_URL + encodeURIComponent(material));
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

module.exports = { downloadMaterial };
