const express = require('express');
const path = require('path');
const session = require('express-session');
const { attachUser } = require('./middleware/auth');

const app = express();

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: 'waste-tracker-secret-group14',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));

// Custom middleware to attach user to res.locals
app.use(attachUser);

// Require routes (to be created)
const authRouter = require('./routes/auth');
const studentRouter = require('./routes/student');
const adminRouter = require('./routes/admin');
const maintenanceRouter = require('./routes/maintenance');
const binsRouter = require('./routes/bins');
const reportsRouter = require('./routes/reports');

// Define routes
app.use('/auth', authRouter);
app.use('/student', studentRouter);
app.use('/admin', adminRouter);
app.use('/maintenance', maintenanceRouter);
app.use('/bins', binsRouter);
app.use('/reports', reportsRouter);

// Home route redirect
app.get('/', (req, res) => {
  if (req.session.userId) {
    if (req.session.role === 'admin') return res.redirect('/admin/dashboard');
    if (req.session.role === 'maintenance') return res.redirect('/maintenance/dashboard');
    return res.redirect('/student/dashboard');
  }
  res.redirect('/auth/login');
});

// Notifications mark as read
app.post('/notifications/read', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { db } = require('./config/db');
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.session.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).render('error', { 
    message: 'Page Not Found', 
    error: { status: 404, stack: '' } 
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500);
  res.render('error', {
    message: err.message || 'Internal Server Error',
    error: { status: err.status || 500, stack: '' }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
