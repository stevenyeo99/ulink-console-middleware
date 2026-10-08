// Fetches a material image from the graph service (images are not stored in fs.chunks).
const https = require('https');

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

// Reads the whole image into memory (for zips); a dropped connection rejects instead of returning a partial buffer.
async function fetchMaterial(material) {
  const res = await getMaterial(material);
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  return Buffer.concat(chunks);
}

module.exports = { fetchMaterial };
