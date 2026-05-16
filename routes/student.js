const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(requireRole('student'));

// GET dashboard
router.get('/dashboard', (req, res) => {
  try {
    const reports = db.prepare(`
      SELECT wr.*, c.name as category_name, l.name as location_name 
      FROM waste_reports wr
      JOIN waste_categories c ON wr.category_id = c.category_id
      JOIN locations l ON wr.location_id = l.location_id
      WHERE wr.reporter_id = ?
      ORDER BY wr.created_at DESC
    `).all(req.session.userId);
    
    res.render('student/dashboard', { reports });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'Failed to load dashboard', error: err });
  }
});

// GET submit-report
router.get('/submit-report', (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM waste_categories').all();
    const locations = db.prepare('SELECT * FROM locations WHERE is_active = 1').all();
    res.render('student/submit-report', { categories, locations });
  } catch (err) {
    res.status(500).render('error', { message: 'Failed to load form', error: err });
  }
});

// POST submit-report
router.post('/submit-report', upload.single('photo'), (req, res) => {
  const { category_id, location_id, description, priority } = req.body;
  const photo_path = req.file ? `/uploads/${req.file.filename}` : null;
  
  try {
    const result = db.prepare(`
      INSERT INTO waste_reports (reporter_id, category_id, location_id, description, photo_path, priority)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.session.userId, category_id, location_id, description, photo_path, priority || 'Medium');
    
    // Create notification for all admins
    const admins = db.prepare("SELECT user_id FROM users WHERE role = 'admin' AND is_active = 1").all();
    const insertNotif = db.prepare("INSERT INTO notifications (user_id, report_id, message, notification_type) VALUES (?, ?, ?, 'status_update')");
    
    const insertMany = db.transaction((adminsList) => {
      for (const admin of adminsList) {
        insertNotif.run(admin.user_id, result.lastInsertRowid, `New waste report submitted by ${req.user.name}`);
      }
    });
    insertMany(admins);
    
    req.session.success = 'Report submitted successfully';
    res.redirect('/student/dashboard');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to submit report';
    res.redirect('/student/submit-report');
  }
});

module.exports = router;
