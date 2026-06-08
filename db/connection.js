const Database = require('better-sqlite3');
const config = require('../config');

const db = new Database(config.db.path);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function closeDatabase() {
  if (db.open) {
    db.close();
  }
}

module.exports = { db, closeDatabase };
