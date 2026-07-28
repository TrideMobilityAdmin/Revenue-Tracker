const express = require('express');
const Entry = require('../models/Entry');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/entries
router.get('/', async (req, res) => {
  const entries = await Entry.find().sort({ date: 1 });
  res.json(entries);
});

// POST /api/entries
router.post('/', async (req, res) => {
  try {
    const { project, milestone, current, potential, date, bucketOverride, status, remarks } = req.body;
    if (!project || !project.trim()) {
      return res.status(400).json({ error: 'Project name is required.' });
    }
    const entry = await Entry.create({
      project: project.trim(),
      milestone,
      current: Number(current) || 0,
      potential: potential === '' || potential === undefined || potential === null
        ? Number(current) || 0
        : Number(potential),
      date: date || null,
      bucketOverride: bucketOverride || 'auto',
      status,
      remarks,
    });
    res.status(201).json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/entries/:id
router.put('/:id', async (req, res) => {
  try {
    const { project, milestone, current, potential, date, bucketOverride, status, remarks } = req.body;
    const entry = await Entry.findByIdAndUpdate(
      req.params.id,
      {
        project,
        milestone,
        current: Number(current) || 0,
        potential: potential === '' || potential === undefined || potential === null
          ? Number(current) || 0
          : Number(potential),
        date: date || null,
        bucketOverride: bucketOverride || 'auto',
        status,
        remarks,
      },
      { new: true, runValidators: true }
    );
    if (!entry) return res.status(404).json({ error: 'Entry not found.' });
    res.json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/entries/:id
router.delete('/:id', async (req, res) => {
  const entry = await Entry.findByIdAndDelete(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found.' });
  res.json({ success: true });
});

module.exports = router;
