const express = require('express');
const asyncHandler = require('../../lib/asyncHandler');
const { parsePaging, scanIdFilter } = require('../../lib/query');
const service = require('./barcodes.service');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const filter = scanIdFilter(req.query.scanId);
  if (!filter) {
    return res.status(400).json({ error: 'scanId must be 3-64 chars of letters, digits, _ or -' });
  }
  res.json(await service.find(filter, parsePaging(req.query, { defaultLimit: 20, maxLimit: 100 })));
}));

module.exports = router;
