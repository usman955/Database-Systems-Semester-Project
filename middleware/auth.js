const { db } = require('../config/db');

// Require user to be logged in
const requireLogin = (req, res, next) => {
  if (!req.session.userId) {
    req.session.error = 'Please log in to access this page.';
    return res.redirect('/auth/login');
  }
  next();
};

// Require user to have specific roles
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.session.userId) {
      req.session.error = 'Please log in to access this page.';
      return res.redirect('/auth/login');
    }
    
    if (!roles.includes(req.session.role)) {
      return res.status(403).render('error', { 
        message: 'Access Denied', 
        error: { status: 403, stack: 'You do not have permission to view this page.' },
        user: req.user || null
      });
    }
    next();
  };
};

// Attach user to req and res.locals
const attachUser = (req, res, next) => {
  if (req.session.userId) {
    try {
      const user = db.prepare('SELECT user_id, name, email, role, department FROM users WHERE user_id = ?').get(req.session.userId);
      if (user) {
        req.user = user;
        res.locals.user = user;
        
        // Also fetch unread notifications count for navbar
        const notifs = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(user.user_id);
        res.locals.unreadNotifications = notifs ? notifs.count : 0;
      } else {
        req.session.destroy();
        res.locals.user = null;
        res.locals.unreadNotifications = 0;
      }
    } catch (err) {
      console.error(err);
      res.locals.user = null;
      res.locals.unreadNotifications = 0;
    }
  } else {
    res.locals.user = null;
    res.locals.unreadNotifications = 0;
  }
  
  // Flash messages
  res.locals.error = req.session.error;
  res.locals.success = req.session.success;
  delete req.session.error;
  delete req.session.success;
  
  next();
};

module.exports = {
  requireLogin,
  requireRole,
  attachUser
};
