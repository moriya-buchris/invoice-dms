const { db } = require('../db/connection');
const {
  DOC_INVOICE,
  DOC_RECEIPT,
  DOC_COMBINED,
} = require('../config/constants');

function normalizeAmount(amount) {
  return Math.round(Number(amount) * 100) / 100;
}

const insertExpenseStmt = db.prepare(`
  INSERT INTO expenses (supplier_name, amount, expense_date, status, sheet_row)
  VALUES (@supplier_name, @amount, @expense_date, @status, @sheet_row)
`);

const updateExpenseStatusStmt = db.prepare(`
  UPDATE expenses SET status = @status WHERE id = @id
`);

const updateExpenseSheetRowStmt = db.prepare(`
  UPDATE expenses SET sheet_row = @sheet_row WHERE id = @id
`);

const findMatchingExpenseStmt = db.prepare(`
  SELECT * FROM expenses
  WHERE supplier_name = @supplier_name
    AND ROUND(amount, 2) = ROUND(@amount, 2)
    AND strftime('%Y-%m', expense_date) = strftime('%Y-%m', @expense_date)
  ORDER BY id ASC
  LIMIT 1
`);

const findMatchForReceiptStmt = db.prepare(`
  SELECT * FROM expenses
  WHERE supplier_name = @supplier_name
    AND ROUND(amount, 2) = ROUND(@amount, 2)
    AND strftime('%Y-%m', expense_date) = strftime('%Y-%m', @expense_date)
    AND EXISTS (
      SELECT 1 FROM expense_documents ed
      WHERE ed.expense_id = expenses.id
        AND ed.document_type IN (@doc_invoice, @doc_combined)
    )
    AND NOT EXISTS (
      SELECT 1 FROM expense_documents ed
      WHERE ed.expense_id = expenses.id
        AND ed.document_type = @doc_receipt
    )
  ORDER BY id ASC
  LIMIT 1
`);

const findMatchForInvoiceStmt = db.prepare(`
  SELECT * FROM expenses
  WHERE supplier_name = @supplier_name
    AND ROUND(amount, 2) = ROUND(@amount, 2)
    AND strftime('%Y-%m', expense_date) = strftime('%Y-%m', @expense_date)
    AND EXISTS (
      SELECT 1 FROM expense_documents ed
      WHERE ed.expense_id = expenses.id
        AND ed.document_type = @doc_receipt
    )
    AND NOT EXISTS (
      SELECT 1 FROM expense_documents ed
      WHERE ed.expense_id = expenses.id
        AND ed.document_type IN (@doc_invoice, @doc_combined)
    )
  ORDER BY id ASC
  LIMIT 1
`);

const getExpenseByIdStmt = db.prepare('SELECT * FROM expenses WHERE id = @id');

const selectDistinctSuppliersStmt = db.prepare(`
  SELECT DISTINCT supplier_name FROM expenses ORDER BY supplier_name COLLATE NOCASE
`);

const selectAllExpenseIdsStmt = db.prepare('SELECT id FROM expenses');

function insert({ supplierName, amount, expenseDate, status, sheetRow = null }) {
  const result = insertExpenseStmt.run({
    supplier_name: supplierName.trim(),
    amount: normalizeAmount(amount),
    expense_date: expenseDate.trim(),
    status,
    sheet_row: sheetRow,
  });
  return Number(result.lastInsertRowid);
}

function updateStatus(expenseId, status) {
  updateExpenseStatusStmt.run({ id: expenseId, status });
}

function updateSheetRow(expenseId, sheetRow) {
  updateExpenseSheetRowStmt.run({ id: expenseId, sheet_row: sheetRow });
}

function findMatchingExpense(supplierName, amount, expenseDate) {
  return (
    findMatchingExpenseStmt.get({
      supplier_name: supplierName.trim(),
      amount: normalizeAmount(amount),
      expense_date: expenseDate.trim(),
    }) || null
  );
}

function findMatchingExpenseForDocument(supplierName, amount, expenseDate, documentType) {
  const params = {
    supplier_name: supplierName.trim(),
    amount: normalizeAmount(amount),
    expense_date: expenseDate.trim(),
    doc_invoice: DOC_INVOICE,
    doc_receipt: DOC_RECEIPT,
    doc_combined: DOC_COMBINED,
  };

  if (documentType === DOC_RECEIPT) {
    return findMatchForReceiptStmt.get(params) || null;
  }

  if (documentType === DOC_INVOICE || documentType === DOC_COMBINED) {
    return findMatchForInvoiceStmt.get(params) || null;
  }

  return findMatchingExpense(supplierName, amount, expenseDate);
}

function findById(expenseId) {
  return getExpenseByIdStmt.get({ id: expenseId }) || null;
}

function listDistinctSuppliers() {
  return selectDistinctSuppliersStmt.all().map((row) => row.supplier_name);
}

function listAllIds() {
  return selectAllExpenseIdsStmt.all().map((row) => row.id);
}

function listExpenses(filters = {}) {
  let sql = `
    SELECT e.*,
      GROUP_CONCAT(d.document_type, ', ') AS document_types,
      GROUP_CONCAT(d.drive_file_id, '||') AS drive_file_ids
    FROM expenses e
    LEFT JOIN expense_documents d ON d.expense_id = e.id
    WHERE 1=1
  `;
  const params = {};

  if (filters.supplier) {
    sql += ' AND e.supplier_name = @supplier';
    params.supplier = filters.supplier;
  }
  if (filters.status) {
    sql += ' AND e.status = @status';
    params.status = filters.status;
  }
  if (filters.documentType) {
    sql += ` AND EXISTS (
      SELECT 1 FROM expense_documents ed
      WHERE ed.expense_id = e.id AND ed.document_type = @documentType
    )`;
    params.documentType = filters.documentType;
  }
  if (filters.dateFrom) {
    sql += ' AND e.expense_date >= @dateFrom';
    params.dateFrom = filters.dateFrom;
  }
  if (filters.dateTo) {
    sql += ' AND e.expense_date <= @dateTo';
    params.dateTo = filters.dateTo;
  }

  sql += ' GROUP BY e.id ORDER BY e.id DESC';

  const rows = db.prepare(sql).all(params);
  return rows.map((row) => {
    const types = row.document_types ? row.document_types.split(', ') : [];
    const ids = row.drive_file_ids ? row.drive_file_ids.split('||') : [];
    const documents = types.map((document_type, index) => ({
      document_type,
      drive_file_id: ids[index] || '',
    }));

    return {
      id: row.id,
      supplier_name: row.supplier_name,
      amount: row.amount,
      expense_date: row.expense_date,
      status: row.status,
      sheet_row: row.sheet_row,
      documents,
    };
  });
}

module.exports = {
  insert,
  updateStatus,
  updateSheetRow,
  findMatchingExpense,
  findMatchingExpenseForDocument,
  findById,
  listDistinctSuppliers,
  listAllIds,
  listExpenses,
};
