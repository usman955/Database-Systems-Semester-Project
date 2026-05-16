const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../config/db');

// GET login page
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('auth/login');
});

// POST login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      req.session.error = 'Invalid email or password';
      return res.redirect('/auth/login');
    }

    req.session.userId = user.user_id;
    req.session.role = user.role;
    req.session.success = 'Successfully logged in!';
    res.redirect('/');
  } catch (error) {
    console.error(error);
    req.session.error = 'Login failed';
    res.redirect('/auth/login');
  }
});

// GET register page
router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('auth/register');
});

// POST register
router.post('/register', (req, res) => {
  const { name, email, password, role, phone, department } = req.body;
  try {
    // Check if email exists
    const existing = db.prepare('SELECT user_id FROM users WHERE email = ?').get(email);
    if (existing) {
      req.session.error = 'Email already registered';
      return res.redirect('/auth/register');
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (name, email, password_hash, role, phone, department) VALUES (?, ?, ?, ?, ?, ?)').run(name, email, hash, role, phone, department);
    
    req.session.userId = result.lastInsertRowid;
    req.session.role = role;
    req.session.success = 'Registration successful!';
    res.redirect('/');
  } catch (error) {
    console.error(error);
    req.session.error = 'Registration failed';
    res.redirect('/auth/register');
  }
});

// GET logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/auth/login');
});

module.exports = router;
