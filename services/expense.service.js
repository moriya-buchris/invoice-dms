const { VALID_DOCUMENT_TYPES, ALL_STATUSES } = require('../config/constants');
const { db } = require('../db/connection');
const expenseRepository = require('../repositories/expense.repository');
const expenseDocumentRepository = require('../repositories/expenseDocument.repository');
const {
  validateCreateExpenseInput,
  parseListFilters,
} = require('../validators/expense.validator');
const expenseStatusService = require('./expenseStatus.service');
const authService = require('./google/auth.service');
const driveService = require('./google/drive.service');
const sheetsService = require('./google/sheets.service');

function getExpenseWithDocuments(expenseId) {
  const expense = expenseRepository.findById(expenseId);
  if (!expense) return null;
  return {
    ...expense,
    documents: expenseDocumentRepository.findByExpenseId(expenseId),
  };
}

function listExpenses(filters = {}) {
  const { queryFilters, responseFilters } = parseListFilters(filters);

  return {
    expenses: expenseRepository.listExpenses(queryFilters),
    suppliers: expenseRepository.listDistinctSuppliers(),
    documentTypes: VALID_DOCUMENT_TYPES,
    statuses: ALL_STATUSES,
    filters: responseFilters,
  };
}

async function createExpenseWithDocument(input, file = null) {
  const validated = validateCreateExpenseInput(input);
  const match = expenseRepository.findMatchingExpenseForDocument(
    validated.supplierName,
    validated.amount,
    validated.expenseDate,
    validated.documentType
  );

  let auth;
  let supplierFolderId;
  let driveFileId = null;
  let webViewLink = null;

  if (file) {
    const uploadResult = await driveService.uploadExpenseDocument({
      supplierName: validated.supplierName,
      documentType: validated.documentType,
      expenseDate: validated.expenseDate,
      amount: validated.amount,
      file,
    });

    auth = uploadResult.auth;
    supplierFolderId = uploadResult.supplierFolderId;
    driveFileId = uploadResult.driveFileId;
    webViewLink = uploadResult.webViewLink;
  } else {
    auth = await authService.getAuth();
    supplierFolderId = await driveService.findOrCreateSupplierFolder(
      auth,
      validated.supplierName
    );
  }

  const isNew = !match;
  const scenario = isNew ? 'A' : 'B';

  const persistExpenseData = db.transaction((payload) => {
    let expenseId;

    if (payload.isNew) {
      const provisionalStatus = expenseStatusService.resolveExpenseStatus([
        { document_type: payload.documentType },
      ]);
      expenseId = expenseRepository.insert({
        supplierName: payload.supplierName,
        amount: payload.amount,
        expenseDate: payload.expenseDate,
        status: provisionalStatus,
      });
    } else {
      expenseId = payload.existingExpenseId;
    }

    expenseDocumentRepository.insert({
      expenseId,
      documentType: payload.documentType,
      driveFileId: payload.driveFileId,
    });

    expenseStatusService.recomputeAndPersistExpenseStatus(expenseId);
    return expenseId;
  });

  const expenseId = persistExpenseData({
    isNew,
    existingExpenseId: match?.id,
    supplierName: validated.supplierName,
    amount: validated.amount,
    expenseDate: validated.expenseDate,
    documentType: validated.documentType,
    driveFileId,
  });

  const expense = getExpenseWithDocuments(expenseId);

  const rowNumber = await sheetsService.syncExpenseToSupplierSheet(
    auth,
    supplierFolderId,
    validated.supplierName,
    expense,
    { isNew }
  );

  if (rowNumber) {
    expenseRepository.updateSheetRow(expenseId, rowNumber);
    expense.sheet_row = rowNumber;
  }

  return {
    scenario,
    isNew,
    expense,
    webViewLink,
  };
}

module.exports = {
  listExpenses,
  createExpenseWithDocument,
};
