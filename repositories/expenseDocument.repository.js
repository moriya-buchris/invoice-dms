const { db } = require('../db/connection');

const insertExpenseDocumentStmt = db.prepare(`
  INSERT INTO expense_documents (expense_id, document_type, drive_file_id)
  VALUES (@expense_id, @document_type, @drive_file_id)
`);

const getDocumentsForExpenseStmt = db.prepare(`
  SELECT * FROM expense_documents WHERE expense_id = @expense_id ORDER BY id
`);

const deleteByExpenseIdStmt = db.prepare(`
  DELETE FROM expense_documents WHERE expense_id = @expense_id
`);

function insert({ expenseId, documentType, driveFileId = null }) {
  insertExpenseDocumentStmt.run({
    expense_id: expenseId,
    document_type: documentType,
    drive_file_id: driveFileId,
  });
}

function findByExpenseId(expenseId) {
  return getDocumentsForExpenseStmt.all({ expense_id: expenseId });
}

function deleteByExpenseId(expenseId) {
  return deleteByExpenseIdStmt.run({ expense_id: expenseId }).changes;
}

module.exports = {
  insert,
  findByExpenseId,
  deleteByExpenseId,
};
