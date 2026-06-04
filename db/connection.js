const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'invoices.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name TEXT NOT NULL,
    document_type TEXT NOT NULL,
    amount REAL NOT NULL,
    invoice_date TEXT NOT NULL,
    file_path TEXT
  );
`);

console.log('Database and invoices table are ready!');

module.exports = { db };
