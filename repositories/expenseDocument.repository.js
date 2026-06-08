const { db } = require('../db/connection');

const insertExpenseDocumentStmt = db.prepare(`
  INSERT INTO expense_documents (expense_id, document_type, drive_file_id)
  VALUES (@expense_id, @document_type, @drive_file_id)
`);

const getDocumentsForExpenseStmt = db.prepare(`
  SELECT * FROM expense_documents WHERE expense_id = @expense_id ORDER BY id
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

module.exports = {
  insert,
  findByExpenseId,
};
