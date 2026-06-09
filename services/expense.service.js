const { VALID_DOCUMENT_TYPES, ALL_STATUSES } = require('../config/constants');
const { db } = require('../db/connection');
const expenseRepository = require('../repositories/expense.repository');
const expenseDocumentRepository = require('../repositories/expenseDocument.repository');
const {
  validateCreateExpenseInput,
  validateUpdateExpenseInput,
  parseListFilters,
} = require('../validators/expense.validator');
const NotFoundError = require('../errors/NotFoundError');
const ValidationError = require('../errors/ValidationError');
const ConflictError = require('../errors/ConflictError');
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

async function deleteExpenseWorkflow(expenseId) {
  const parsedId = Number(expenseId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new NotFoundError('מזהה הוצאה לא תקין.');
  }

  const expense = getExpenseWithDocuments(parsedId);
  if (!expense) {
    throw new NotFoundError();
  }

  const auth = await authService.getAuth();
  const supplierFolderId = await driveService.findOrCreateSupplierFolder(
    auth,
    expense.supplier_name
  );

  const driveFileIds = [
    ...new Set(
      expense.documents
        .map((doc) => driveService.parseDriveFileId(doc.drive_file_id))
        .filter(Boolean)
    ),
  ];

  for (const fileId of driveFileIds) {
    await driveService.deleteFile(fileId, auth);
  }

  await sheetsService.deleteExpenseRowFromSupplierSheet(
    auth,
    supplierFolderId,
    expense.supplier_name,
    expense
  );

  const deleted = db.transaction(() => {
    expenseDocumentRepository.deleteByExpenseId(parsedId);
    return expenseRepository.deleteExpense(parsedId);
  })();

  if (!deleted) {
    throw new NotFoundError();
  }

  console.log(
    `Deleted expense #${parsedId} — ${driveFileIds.length} Drive file(s), sheet row cleaned`
  );

  return { id: parsedId, deleted: true };
}

async function updateExpenseWorkflow(expenseId, updateInput, newFile = null) {
  const parsedId = Number(expenseId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new NotFoundError('מזהה הוצאה לא תקין.');
  }

  const existing = getExpenseWithDocuments(parsedId);
  if (!existing) {
    throw new NotFoundError();
  }

  const validated = validateUpdateExpenseInput(updateInput);
  const previousSnapshot = {
    ...existing,
    documents: existing.documents.map((doc) => ({ ...doc })),
  };

  if (newFile && !validated.documentType) {
    throw new ValidationError('יש לבחור סוג מסמך בעת העלאת קובץ.');
  }

  if (
    validated.documentType &&
    existing.documents.some((doc) => doc.document_type === validated.documentType)
  ) {
    throw new ConflictError('מסמך מסוג זה כבר קיים עבור העסקה.');
  }

  let auth = await authService.getAuth();
  let driveFileId = null;

  const supplierChanged =
    validated.supplierName.trim() !== existing.supplier_name.trim();

  if (supplierChanged) {
    const newSupplierFolderId = await driveService.findOrCreateSupplierFolder(
      auth,
      validated.supplierName
    );

    const driveFileIds = [
      ...new Set(
        existing.documents
          .map((doc) => driveService.parseDriveFileId(doc.drive_file_id))
          .filter(Boolean)
      ),
    ];

    for (const fileId of driveFileIds) {
      await driveService.moveFile(fileId, newSupplierFolderId, auth);
    }

    if (driveFileIds.length > 0) {
      console.log(
        `Moved ${driveFileIds.length} Drive file(s) for expense #${parsedId} to supplier "${validated.supplierName}"`
      );
    }
  }

  if (newFile) {
    const uploadResult = await driveService.uploadExpenseDocument({
      supplierName: validated.supplierName,
      documentType: validated.documentType,
      expenseDate: validated.expenseDate,
      amount: validated.amount,
      file: newFile,
      auth,
    });

    auth = uploadResult.auth;
    driveFileId = uploadResult.driveFileId;
  }

  db.transaction(() => {
    expenseRepository.updateExpense(parsedId, {
      supplierName: validated.supplierName,
      amount: validated.amount,
      expenseDate: validated.expenseDate,
      status: existing.status,
    });

    if (newFile && validated.documentType) {
      expenseDocumentRepository.insert({
        expenseId: parsedId,
        documentType: validated.documentType,
        driveFileId,
      });
    }

    expenseStatusService.recomputeAndPersistExpenseStatus(parsedId);
  })();

  const updated = getExpenseWithDocuments(parsedId);

  const rowNumber = await sheetsService.updateExpenseInSupplierSheet(
    auth,
    updated,
    previousSnapshot
  );

  if (rowNumber) {
    expenseRepository.updateSheetRow(parsedId, rowNumber);
    updated.sheet_row = rowNumber;
  }

  console.log(`Updated expense #${parsedId} in database and supplier sheet`);

  return {
    id: parsedId,
    expense: updated,
  };
}

module.exports = {
  listExpenses,
  createExpenseWithDocument,
  updateExpenseWorkflow,
  deleteExpenseWorkflow,
};
