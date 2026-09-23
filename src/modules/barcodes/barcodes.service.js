const db = require('../../lib/db');

async function find(filter, { skip, limit }) {
  const docs = await db.db().collection('submissions')
    .find(filter, { projection: { _id: 0, scanId: 1, barcodeId: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit + 1)
    .toArray();
  return { items: docs.slice(0, limit), hasMore: docs.length > limit };
}

module.exports = { find };
