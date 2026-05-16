const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { requireRole } = require('../middleware/auth');

// All users can view bins
router.get('/', (req, res) => {
  if (!req.session.userId) return res.redirect('/auth/login');
  
  try {
    const bins = db.prepare('SELECT * FROM bin_status_overview ORDER BY current_fill_level DESC').all();
    res.render('bins/index', { bins });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'Failed to load bins', error: err });
  }
});

// Admin can empty a bin
router.post('/:id/empty', requireRole('admin'), (req, res) => {
  const binId = req.params.id;
  try {
    db.prepare("UPDATE recycling_bins SET current_fill_level = 0, last_emptied = CURRENT_TIMESTAMP, status = 'Operational' WHERE bin_id = ?").run(binId);
    req.session.success = 'Bin marked as emptied';
    res.redirect('/bins');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to empty bin';
    res.redirect('/bins');
  }
});

// Admin can update bin level
router.post('/:id/update', requireRole('admin'), (req, res) => {
  const binId = req.params.id;
  const { fill_level } = req.body;
  
  try {
    const level = parseInt(fill_level);
    let status = 'Operational';
    if (level >= 80) status = 'Full';
    
    db.prepare('UPDATE recycling_bins SET current_fill_level = ?, status = ? WHERE bin_id = ?').run(level, status, binId);
    req.session.success = 'Bin level updated';
    res.redirect('/bins');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to update bin level';
    res.redirect('/bins');
  }
});

module.exports = router;
