const { db } = require('./db');
const bcrypt = require('bcryptjs');

const init = () => {
  console.log('Initializing database...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('student', 'admin', 'maintenance')) NOT NULL,
      phone TEXT,
      department TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS waste_categories (
      category_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      recycling_info TEXT,
      is_recyclable INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS locations (
      location_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      zone TEXT,
      building_code TEXT,
      description TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS waste_reports (
      report_id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      assigned_to INTEGER,
      description TEXT,
      photo_path TEXT,
      status TEXT CHECK(status IN ('Pending', 'In Progress', 'Resolved')) DEFAULT 'Pending',
      priority TEXT CHECK(priority IN ('Low', 'Medium', 'High')) DEFAULT 'Medium',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (reporter_id) REFERENCES users(user_id),
      FOREIGN KEY (category_id) REFERENCES waste_categories(category_id),
      FOREIGN KEY (location_id) REFERENCES locations(location_id),
      FOREIGN KEY (assigned_to) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      comment_text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES waste_reports(report_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS status_history (
      history_id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      changed_by INTEGER NOT NULL,
      old_status TEXT NOT NULL,
      new_status TEXT NOT NULL,
      change_reason TEXT,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES waste_reports(report_id),
      FOREIGN KEY (changed_by) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS recycling_bins (
      bin_id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      bin_code TEXT NOT NULL UNIQUE,
      capacity INTEGER,
      current_fill_level INTEGER DEFAULT 0,
      last_emptied DATETIME,
      status TEXT CHECK(status IN ('Operational', 'Full', 'Damaged')) DEFAULT 'Operational',
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (location_id) REFERENCES locations(location_id),
      FOREIGN KEY (category_id) REFERENCES waste_categories(category_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      report_id INTEGER,
      message TEXT NOT NULL,
      notification_type TEXT CHECK(notification_type IN ('status_update', 'assignment', 'comment', 'bin_full')) NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id),
      FOREIGN KEY (report_id) REFERENCES waste_reports(report_id)
    );
  `);

  console.log('Tables created.');

  // Views
  db.exec(`
    DROP VIEW IF EXISTS active_reports_view;
    CREATE VIEW active_reports_view AS
    SELECT wr.*, u.name as reporter_name, wc.name as category_name, l.name as location_name 
    FROM waste_reports wr
    JOIN users u ON wr.reporter_id = u.user_id
    JOIN waste_categories wc ON wr.category_id = wc.category_id
    JOIN locations l ON wr.location_id = l.location_id
    WHERE wr.status != 'Resolved';

    DROP VIEW IF EXISTS bin_status_overview;
    CREATE VIEW bin_status_overview AS
    SELECT rb.*, l.name as location_name, wc.name as category_name
    FROM recycling_bins rb
    JOIN locations l ON rb.location_id = l.location_id
    JOIN waste_categories wc ON rb.category_id = wc.category_id
    WHERE rb.is_active = 1;

    DROP VIEW IF EXISTS user_report_stats;
    CREATE VIEW user_report_stats AS
    SELECT u.user_id, u.name, u.role,
           COUNT(wr.report_id) as total_reports,
           SUM(CASE WHEN wr.status = 'Pending' THEN 1 ELSE 0 END) as pending_reports,
           SUM(CASE WHEN wr.status = 'In Progress' THEN 1 ELSE 0 END) as in_progress_reports,
           SUM(CASE WHEN wr.status = 'Resolved' THEN 1 ELSE 0 END) as resolved_reports
    FROM users u
    LEFT JOIN waste_reports wr ON u.user_id = wr.reporter_id
    GROUP BY u.user_id;
  `);

  console.log('Views created.');

  // Triggers
  db.exec(`
    DROP TRIGGER IF EXISTS update_report_timestamp;
    CREATE TRIGGER update_report_timestamp
    AFTER UPDATE ON waste_reports
    BEGIN
      UPDATE waste_reports SET updated_at = CURRENT_TIMESTAMP WHERE report_id = NEW.report_id;
    END;

    DROP TRIGGER IF EXISTS set_resolved_timestamp;
    CREATE TRIGGER set_resolved_timestamp
    AFTER UPDATE OF status ON waste_reports
    WHEN NEW.status = 'Resolved' AND OLD.status != 'Resolved'
    BEGIN
      UPDATE waste_reports SET resolved_at = CURRENT_TIMESTAMP WHERE report_id = NEW.report_id;
    END;
  `);

  console.log('Triggers created.');

  // Check if users exist to avoid reseeding
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    console.log('Seeding sample data...');

    // Seed Users
    const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, role, department) VALUES (?, ?, ?, ?, ?)');
    
    // admin123
    const adminHash = bcrypt.hashSync('admin123', 10);
    const adminId = insertUser.run('Admin User', 'admin@campus.edu', adminHash, 'admin', 'Administration').lastInsertRowid;
    
    // student123
    const studentHash = bcrypt.hashSync('student123', 10);
    const student1Id = insertUser.run('John Doe', 'john@campus.edu', studentHash, 'student', 'Computer Science').lastInsertRowid;
    const student2Id = insertUser.run('Jane Smith', 'jane@campus.edu', studentHash, 'student', 'Engineering').lastInsertRowid;
    
    // maint123
    const maintHash = bcrypt.hashSync('maint123', 10);
    const maintId = insertUser.run('Mike Wilson', 'mike@campus.edu', maintHash, 'maintenance', 'Facilities').lastInsertRowid;

    // Seed Categories
    const insertCategory = db.prepare('INSERT INTO waste_categories (name, is_recyclable) VALUES (?, ?)');
    const cats = {
      plastic: insertCategory.run('Plastic', 1).lastInsertRowid,
      organic: insertCategory.run('Organic', 0).lastInsertRowid,
      paper: insertCategory.run('Paper', 1).lastInsertRowid,
      electronic: insertCategory.run('Electronic', 1).lastInsertRowid,
      glass: insertCategory.run('Glass', 1).lastInsertRowid,
      metal: insertCategory.run('Metal', 1).lastInsertRowid,
      general: insertCategory.run('General Waste', 0).lastInsertRowid
    };

    // Seed Locations
    const insertLoc = db.prepare('INSERT INTO locations (name, zone) VALUES (?, ?)');
    const locs = {
      library: insertLoc.run('Main Library', 'Academic').lastInsertRowid,
      scienceA: insertLoc.run('Science Block A', 'Academic').lastInsertRowid,
      cafe: insertLoc.run('Cafeteria', 'Common Area').lastInsertRowid,
      dorm: insertLoc.run('Dormitory Block 1', 'Residential').lastInsertRowid,
      sports: insertLoc.run('Sports Complex', 'Recreation').lastInsertRowid,
      admin: insertLoc.run('Admin Building', 'Administrative').lastInsertRowid,
      parking: insertLoc.run('Parking Lot A', 'Common Area').lastInsertRowid
    };

    // Seed Reports
    const insertReport = db.prepare('INSERT INTO waste_reports (reporter_id, category_id, location_id, assigned_to, description, status, priority) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const r1 = insertReport.run(student1Id, cats.plastic, locs.cafe, null, 'Plastic bottles left on tables', 'Pending', 'Low').lastInsertRowid;
    const r2 = insertReport.run(student2Id, cats.electronic, locs.library, maintId, 'Broken monitor in computer lab', 'In Progress', 'High').lastInsertRowid;
    const r3 = insertReport.run(student1Id, cats.organic, locs.dorm, null, 'Food waste smell in corridor', 'Pending', 'Medium').lastInsertRowid;
    const r4 = insertReport.run(student2Id, cats.general, locs.parking, maintId, 'Trash bin overflowing', 'Resolved', 'Medium').lastInsertRowid;
    const r5 = insertReport.run(student1Id, cats.glass, locs.scienceA, maintId, 'Broken glass near entrance', 'In Progress', 'High').lastInsertRowid;

    // Seed Status History
    const insertHistory = db.prepare('INSERT INTO status_history (report_id, changed_by, old_status, new_status, change_reason) VALUES (?, ?, ?, ?, ?)');
    insertHistory.run(r2, adminId, 'Pending', 'In Progress', 'Assigned to maintenance');
    insertHistory.run(r4, maintId, 'Pending', 'In Progress', 'Cleaning up');
    insertHistory.run(r4, maintId, 'In Progress', 'Resolved', 'Area cleaned');
    insertHistory.run(r5, adminId, 'Pending', 'In Progress', 'High priority cleanup required');

    // Seed Bins
    const insertBin = db.prepare('INSERT INTO recycling_bins (location_id, category_id, bin_code, capacity, current_fill_level, status) VALUES (?, ?, ?, ?, ?, ?)');
    insertBin.run(locs.cafe, cats.plastic, 'BIN-CAFE-P1', 100, 30, 'Operational');
    insertBin.run(locs.library, cats.paper, 'BIN-LIB-P1', 100, 95, 'Full');
    insertBin.run(locs.scienceA, cats.glass, 'BIN-SCI-G1', 100, 10, 'Operational');
    insertBin.run(locs.dorm, cats.general, 'BIN-DORM-G1', 150, 85, 'Full');
    insertBin.run(locs.sports, cats.plastic, 'BIN-SPORT-P1', 100, 60, 'Operational');
    insertBin.run(locs.admin, cats.paper, 'BIN-ADMIN-P1', 100, 40, 'Operational');
    insertBin.run(locs.parking, cats.general, 'BIN-PARK-G1', 200, 100, 'Full');

    console.log('Sample data seeded.');
  }

  console.log('Database initialization complete.');
};

init();
