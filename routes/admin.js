const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { requireRole } = require('../middleware/auth');

router.use(requireRole('admin'));

// GET dashboard
router.get('/dashboard', (req, res) => {
  try {
    const summary = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved
      FROM waste_reports
    `).get();

    const byCategory = db.prepare(`
      SELECT wc.name, COUNT(*) as count 
      FROM waste_categories wc 
      JOIN waste_reports wr ON wc.category_id=wr.category_id 
      GROUP BY wc.name ORDER BY count DESC
    `).all();

    const byLocation = db.prepare(`
      SELECT l.name, COUNT(*) as count 
      FROM locations l 
      JOIN waste_reports wr ON l.location_id=wr.location_id 
      GROUP BY l.name ORDER BY count DESC
    `).all();

    const fullBins = db.prepare('SELECT * FROM bin_status_overview WHERE current_fill_level >= 80').all();

    const recentReports = db.prepare(`
      SELECT wr.*, c.name as category_name, l.name as location_name, u.name as reporter_name
      FROM waste_reports wr
      JOIN waste_categories c ON wr.category_id = c.category_id
      JOIN locations l ON wr.location_id = l.location_id
      JOIN users u ON wr.reporter_id = u.user_id
      ORDER BY wr.created_at DESC LIMIT 5
    `).all();

    res.render('admin/dashboard', { 
      summary, 
      byCategory, 
      byLocation, 
      fullBins, 
      recentReports 
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'Failed to load dashboard', error: err });
  }
});

// GET reports
router.get('/reports', (req, res) => {
  try {
    const statusFilter = req.query.status;
    
    let query = `
      SELECT wr.*, c.name as category_name, l.name as location_name, 
             u.name as reporter_name, m.name as assigned_name
      FROM waste_reports wr
      JOIN waste_categories c ON wr.category_id = c.category_id
      JOIN locations l ON wr.location_id = l.location_id
      JOIN users u ON wr.reporter_id = u.user_id
      LEFT JOIN users m ON wr.assigned_to = m.user_id
    `;
    
    const params = [];
    if (statusFilter) {
      query += ' WHERE wr.status = ?';
      params.push(statusFilter);
    }
    query += ' ORDER BY wr.created_at DESC';

    const reports = db.prepare(query).all(...params);
    const maintenanceUsers = db.prepare("SELECT user_id, name FROM users WHERE role = 'maintenance' AND is_active = 1").all();
    
    res.render('admin/reports', { reports, maintenanceUsers, currentStatus: statusFilter });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'Failed to load reports', error: err });
  }
});

// POST assign report
router.post('/reports/:id/assign', (req, res) => {
  const { assigned_to } = req.body;
  const reportId = req.params.id;
  
  try {
    db.prepare('UPDATE waste_reports SET assigned_to = ? WHERE report_id = ?').run(assigned_to || null, reportId);
    
    if (assigned_to) {
      db.prepare("INSERT INTO notifications (user_id, report_id, message, notification_type) VALUES (?, ?, 'You have been assigned a new waste report', 'assignment')")
        .run(assigned_to, reportId);
    }
    
    req.session.success = 'Report assignment updated';
    res.redirect('/admin/reports');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to assign report';
    res.redirect('/admin/reports');
  }
});

module.exports = router;
