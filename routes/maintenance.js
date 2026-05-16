const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { requireRole } = require('../middleware/auth');

router.use(requireRole('maintenance'));

// GET dashboard
router.get('/dashboard', (req, res) => {
  try {
    const reports = db.prepare(`
      SELECT wr.*, c.name as category_name, l.name as location_name 
      FROM waste_reports wr
      JOIN waste_categories c ON wr.category_id = c.category_id
      JOIN locations l ON wr.location_id = l.location_id
      WHERE wr.assigned_to = ? AND wr.status != 'Resolved'
      ORDER BY wr.priority DESC, wr.created_at ASC
    `).all(req.session.userId);
    
    // Also fetch recently resolved for history
    const resolvedReports = db.prepare(`
      SELECT wr.*, c.name as category_name, l.name as location_name 
      FROM waste_reports wr
      JOIN waste_categories c ON wr.category_id = c.category_id
      JOIN locations l ON wr.location_id = l.location_id
      WHERE wr.assigned_to = ? AND wr.status = 'Resolved'
      ORDER BY wr.resolved_at DESC LIMIT 5
    `).all(req.session.userId);
    
    res.render('maintenance/dashboard', { reports, resolvedReports });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'Failed to load dashboard', error: err });
  }
});

module.exports = router;
