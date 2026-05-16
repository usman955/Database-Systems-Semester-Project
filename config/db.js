const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../waste_tracker.db');
const db = new Database(dbPath, { verbose: console.log });

// Enable foreign keys on every connection
db.pragma('foreign_keys = ON');

module.exports = {
  db,
  run: (sql, params = []) => {
    return db.prepare(sql).run(params);
  },
  get: (sql, params = []) => {
    return db.prepare(sql).get(params);
  },
  all: (sql, params = []) => {
    return db.prepare(sql).all(params);
  },
  lastInsertRowid: () => {
    return db.prepare('SELECT last_insert_rowid() as id').get().id;
  }
};
