function createBaselineTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
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

    CREATE TABLE IF NOT EXISTS expense_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      document_type TEXT NOT NULL CHECK (
        document_type IN ('חשבונית מס', 'קבלה', 'חשבונית מס / קבלה')
      ),
      drive_file_id TEXT,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      UNIQUE (expense_id, document_type)
    );
  `);
}

function migrateLegacyInvoices(db) {
  const legacyTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'invoices'")
    .get();
  if (!legacyTable) return;

  const expenseCount = db.prepare('SELECT COUNT(*) AS count FROM expenses').get().count;
  if (expenseCount > 0) return;

  const legacyRows = db.prepare('SELECT * FROM invoices ORDER BY id').all();
  if (legacyRows.length === 0) return;

  const insertExpense = db.prepare(`
    INSERT INTO expenses (supplier_name, amount, expense_date, status, sheet_row)
    VALUES (@supplier_name, @amount, @expense_date, @status, NULL)
  `);
  const insertDocument = db.prepare(`
    INSERT INTO expense_documents (expense_id, document_type, drive_file_id)
    VALUES (@expense_id, @document_type, @drive_file_id)
  `);

  const allowedTypes = new Set(['חשבונית מס', 'קבלה', 'חשבונית מס / קבלה']);

  const migrateAll = db.transaction((rows) => {
    for (const row of rows) {
      let documentType = row.document_type?.trim();
      if (!allowedTypes.has(documentType)) {
        documentType = 'חשבונית מס';
      }

      let status = 'ממתין לתשלום';
      if (documentType === 'קבלה') {
        status = '⚠️ שולם - חסרה חשבונית מס!';
      } else if (documentType === 'חשבונית מס / קבלה') {
        status = '🟢 שולם ומאושר לרואה חשבון';
      }

      const expenseResult = insertExpense.run({
        supplier_name: row.supplier_name,
        amount: row.amount,
        expense_date: row.invoice_date,
        status,
      });

      insertDocument.run({
        expense_id: expenseResult.lastInsertRowid,
        document_type: documentType,
        drive_file_id: row.file_path || '',
      });
    }
  });

  migrateAll(legacyRows);
  console.log(`  Migrated ${legacyRows.length} legacy invoice row(s) into expenses.`);
}

function migrateExpenseStatusSchema(db) {
  const tableInfo = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'expenses'")
    .get();
  if (!tableInfo?.sql) return;
  if (tableInfo.sql.includes('ממתין לתשלום (חסרה קבלה)')) return;

  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE expenses_migrated (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_name TEXT NOT NULL,
      amount REAL NOT NULL,
      expense_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN (
        'ממתין לתשלום (חסרה קבלה)',
        '⚠️ שולם - חסרה חשבונית מס!',
        '🟢 שולם ומאושר לרואה חשבון'
      )),
      sheet_row INTEGER
    );

    INSERT INTO expenses_migrated (id, supplier_name, amount, expense_date, status, sheet_row)
    SELECT
      id,
      supplier_name,
      amount,
      expense_date,
      CASE status
        WHEN 'ממתין לתשלום' THEN 'ממתין לתשלום (חסרה קבלה)'
        WHEN 'שולם' THEN '🟢 שולם ומאושר לרואה חשבון'
        ELSE status
      END,
      sheet_row
    FROM expenses;

    DROP TABLE expenses;
    ALTER TABLE expenses_migrated RENAME TO expenses;
  `);
  db.pragma('foreign_keys = ON');
  console.log('  Migrated expenses table to intermediate status values.');
}

function migrateNullableDriveFileId(db) {
  const docsSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'expense_documents'")
    .get()?.sql;
  if (!docsSql?.includes('drive_file_id TEXT NOT NULL')) return;

  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE expense_documents_migrated (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      document_type TEXT NOT NULL CHECK (
        document_type IN ('חשבונית מס', 'קבלה', 'חשבונית מס / קבלה')
      ),
      drive_file_id TEXT,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      UNIQUE (expense_id, document_type)
    );
    INSERT INTO expense_documents_migrated (id, expense_id, document_type, drive_file_id)
    SELECT id, expense_id, document_type, drive_file_id FROM expense_documents;
    DROP TABLE expense_documents;
    ALTER TABLE expense_documents_migrated RENAME TO expense_documents;
  `);
  db.pragma('foreign_keys = ON');
  console.log('  Migrated expense_documents: drive_file_id is now optional.');
}

function migratePendingStatusLabel(db) {
  const tableInfo = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'expenses'")
    .get();
  if (!tableInfo?.sql) return;
  if (!tableInfo.sql.includes('ממתין לתשלום (חסרה קבלה)')) return;

  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE expenses_pending_label (
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

    INSERT INTO expenses_pending_label (id, supplier_name, amount, expense_date, status, sheet_row)
    SELECT
      id,
      supplier_name,
      amount,
      expense_date,
      CASE status
        WHEN 'ממתין לתשלום (חסרה קבלה)' THEN 'ממתין לתשלום'
        ELSE status
      END,
      sheet_row
    FROM expenses;

    DROP TABLE expenses;
    ALTER TABLE expenses_pending_label RENAME TO expenses;
  `);
  db.pragma('foreign_keys = ON');
  console.log('  Migrated pending status label to "ממתין לתשלום".');
}

function up(db) {
  createBaselineTables(db);
  migrateLegacyInvoices(db);
  migrateExpenseStatusSchema(db);
  migrateNullableDriveFileId(db);
  migratePendingStatusLabel(db);
}

module.exports = { up };
