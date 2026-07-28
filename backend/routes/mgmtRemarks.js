const express = require('express');
const MgmtRemark = require('../models/MgmtRemark');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/mgmt-remarks -> { "Project Name": "remark text", ... }
router.get('/', async (req, res) => {
  const rows = await MgmtRemark.find();
  const map = {};
  rows.forEach((r) => { map[r.project] = r.text; });
  res.json(map);
});

// PUT /api/mgmt-remarks/:project  { text }
// Overwrites (does not append) - matches "remarks can override when updated and submitted".
router.put('/:project', async (req, res) => {
  const project = decodeURIComponent(req.params.project);
  const { text } = req.body || {};
  const updated = await MgmtRemark.findOneAndUpdate(
    { project },
    { project, text: text || '' },
    { new: true, upsert: true }
  );
  res.json({ project: updated.project, text: updated.text });
});

module.exports = router;
