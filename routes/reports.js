const express = require('express');
const router = express.Router();
const { db } = require('../config/db');

// Check login
router.use((req, res, next) => {
  if (!req.session.userId) return res.redirect('/auth/login');
  next();
});

// GET report detail
router.get('/:id', (req, res) => {
  const reportId = req.params.id;
  try {
    const report = db.prepare(`
      SELECT wr.*, c.name as category_name, l.name as location_name, 
             u.name as reporter_name, m.name as assigned_name
      FROM waste_reports wr
      JOIN waste_categories c ON wr.category_id = c.category_id
      JOIN locations l ON wr.location_id = l.location_id
      JOIN users u ON wr.reporter_id = u.user_id
      LEFT JOIN users m ON wr.assigned_to = m.user_id
      WHERE wr.report_id = ?
    `).get(reportId);

    if (!report) {
      return res.status(404).render('error', { message: 'Report not found', error: { status: 404, stack: '' } });
    }

    // Authorization check
    if (req.session.role === 'student' && report.reporter_id !== req.session.userId) {
      return res.status(403).render('error', { message: 'Access Denied', error: { status: 403, stack: '' } });
    }

    const comments = db.prepare(`
      SELECT c.*, u.name as user_name, u.role as user_role
      FROM comments c
      JOIN users u ON c.user_id = u.user_id
      WHERE c.report_id = ?
      ORDER BY c.created_at ASC
    `).all(reportId);

    const history = db.prepare(`
      SELECT sh.*, u.name as changed_by_name
      FROM status_history sh
      JOIN users u ON sh.changed_by = u.user_id
      WHERE sh.report_id = ?
      ORDER BY sh.changed_at DESC
    `).all(reportId);

    res.render('reports/detail', { report, comments, history });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'Failed to load report detail', error: err });
  }
});

// POST update status
router.post('/:id/status', (req, res) => {
  if (req.session.role === 'student') return res.status(403).send('Forbidden');
  
  const reportId = req.params.id;
  const { new_status, change_reason, priority } = req.body;
  
  try {
    const report = db.prepare('SELECT status, priority, reporter_id FROM waste_reports WHERE report_id = ?').get(reportId);
    if (!report) return res.status(404).send('Not Found');

    const updateStatus = db.transaction(() => {
      let statusChanged = false;
      
      if (report.status !== new_status) {
        db.prepare('UPDATE waste_reports SET status = ? WHERE report_id = ?').run(new_status, reportId);
        
        db.prepare('INSERT INTO status_history (report_id, changed_by, old_status, new_status, change_reason) VALUES (?, ?, ?, ?, ?)')
          .run(reportId, req.session.userId, report.status, new_status, change_reason || '');

        db.prepare("INSERT INTO notifications (user_id, report_id, message, notification_type) VALUES (?, ?, ?, 'status_update')")
          .run(report.reporter_id, reportId, `Report status changed to ${new_status}`);
        
        statusChanged = true;
      }

      if (priority && report.priority !== priority && req.session.role === 'admin') {
         db.prepare('UPDATE waste_reports SET priority = ? WHERE report_id = ?').run(priority, reportId);
      }
      
      if(statusChanged || priority) {
         req.session.success = 'Report updated successfully';
      }
    });
    
    updateStatus();
    res.redirect(`/reports/${reportId}`);
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to update report';
    res.redirect(`/reports/${reportId}`);
  }
});

// POST add comment
router.post('/:id/comment', (req, res) => {
  const reportId = req.params.id;
  const { comment_text } = req.body;
  
  try {
    const report = db.prepare('SELECT reporter_id, assigned_to FROM waste_reports WHERE report_id = ?').get(reportId);
    if (!report) return res.status(404).send('Not Found');

    db.prepare('INSERT INTO comments (report_id, user_id, comment_text) VALUES (?, ?, ?)').run(reportId, req.session.userId, comment_text);
    
    // Notify reporter if comment is from someone else
    if (req.session.userId !== report.reporter_id) {
      db.prepare("INSERT INTO notifications (user_id, report_id, message, notification_type) VALUES (?, ?, 'New comment on your report', 'comment')")
        .run(report.reporter_id, reportId);
    }
    
    // Notify assigned maintenance user if comment is from someone else
    if (report.assigned_to && req.session.userId !== report.assigned_to) {
      db.prepare("INSERT INTO notifications (user_id, report_id, message, notification_type) VALUES (?, ?, 'New comment on an assigned report', 'comment')")
        .run(report.assigned_to, reportId);
    }

    req.session.success = 'Comment added';
    res.redirect(`/reports/${reportId}`);
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to add comment';
    res.redirect(`/reports/${reportId}`);
  }
});

module.exports = router;
