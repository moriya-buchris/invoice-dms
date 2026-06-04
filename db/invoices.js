const { db } = require('./connection');

const selectDistinctSuppliers = db.prepare(
  'SELECT DISTINCT supplier_name FROM invoices ORDER BY supplier_name COLLATE NOCASE'
);
const selectDistinctDocumentTypes = db.prepare(
  'SELECT DISTINCT document_type FROM invoices ORDER BY document_type COLLATE NOCASE'
);
const insertInvoice = db.prepare(`
  INSERT INTO invoices (supplier_name, document_type, amount, invoice_date, file_path)
  VALUES (@supplier_name, @document_type, @amount, @invoice_date, @file_path)
`);

function queryInvoices(filters = {}) {
  let sql = 'SELECT * FROM invoices WHERE 1=1';
  const params = {};
  if (filters.supplier) {
    sql += ' AND supplier_name = @supplier';
    params.supplier = filters.supplier;
  }
  if (filters.documentType) {
    sql += ' AND document_type = @documentType';
    params.documentType = filters.documentType;
  }
  sql += ' ORDER BY id DESC';
  return db.prepare(sql).all(params);
}

module.exports = {
  selectDistinctSuppliers,
  selectDistinctDocumentTypes,
  insertInvoice,
  queryInvoices,
};
