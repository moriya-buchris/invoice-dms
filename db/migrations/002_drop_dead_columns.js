function up(db) {
  const columns = db.prepare('PRAGMA table_info(expenses)').all();
  const hasTransactionFolder = columns.some((c) => c.name === 'transaction_folder_id');
  if (!hasTransactionFolder) return;

  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE expenses_clean (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_name TEXT NOT NULL,
      amount REAL NOT NULL,
      expense_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN (
        'ממתין לתשלום',
        '⚠️ שולם - חסרה חשבונית מס!',
        '🟢 שולם ומאושר לרואה חשבון'
      )),
      sheet_row INTEGER
    );

    INSERT INTO expenses_clean (id, supplier_name, amount, expense_date, status, sheet_row)
    SELECT id, supplier_name, amount, expense_date, status, sheet_row
    FROM expenses;

    DROP TABLE expenses;
    ALTER TABLE expenses_clean RENAME TO expenses;
  `);
  db.pragma('foreign_keys = ON');
  console.log('  Dropped legacy column transaction_folder_id from expenses.');
}

module.exports = { up };
