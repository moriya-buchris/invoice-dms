const {
  STATUS_PENDING,
  STATUS_PAID_MISSING_INVOICE,
  STATUS_APPROVED,
  DOC_COMBINED,
  DOC_INVOICE,
  DOC_RECEIPT,
} = require('../config/constants');
const expenseRepository = require('../repositories/expense.repository');
const expenseDocumentRepository = require('../repositories/expenseDocument.repository');

function transactionHasInvoice(documentTypes) {
  return documentTypes.some(
    (type) => type === DOC_INVOICE || type === DOC_COMBINED
  );
}

function transactionHasReceipt(documentTypes) {
  return documentTypes.some(
    (type) => type === DOC_RECEIPT || type === DOC_COMBINED
  );
}

function resolveExpenseStatus(documents) {
  if (!documents?.length) {
    return STATUS_PENDING;
  }

  const documentTypes = documents.map((doc) => doc.document_type);

  if (documentTypes.includes(DOC_COMBINED)) {
    return STATUS_APPROVED;
  }

  const hasInvoice = transactionHasInvoice(documentTypes);
  const hasReceipt = transactionHasReceipt(documentTypes);

  if (hasInvoice && hasReceipt) {
    return STATUS_APPROVED;
  }

  if (hasInvoice) {
    return STATUS_PENDING;
  }

  if (hasReceipt) {
    return STATUS_PAID_MISSING_INVOICE;
  }

  return STATUS_PENDING;
}

function resolveExpenseStatusForTransaction(expenseId) {
  const documents = expenseDocumentRepository.findByExpenseId(expenseId);
  return resolveExpenseStatus(documents);
}

function recomputeAndPersistExpenseStatus(expenseId) {
  const status = resolveExpenseStatusForTransaction(expenseId);
  expenseRepository.updateStatus(expenseId, status);
  return status;
}

function reconcileAllExpenseStatuses() {
  const expenseIds = expenseRepository.listAllIds();
  let updated = 0;

  for (const expenseId of expenseIds) {
    const documents = expenseDocumentRepository.findByExpenseId(expenseId);
    if (documents.length === 0) continue;

    const correctStatus = resolveExpenseStatus(documents);
    const current = expenseRepository.findById(expenseId);
    if (current && current.status !== correctStatus) {
      expenseRepository.updateStatus(expenseId, correctStatus);
      updated += 1;
    }
  }

  if (updated > 0) {
    console.log(`Reconciled status for ${updated} expense row(s) from attached documents.`);
  }
}

module.exports = {
  transactionHasInvoice,
  transactionHasReceipt,
  resolveExpenseStatus,
  resolveExpenseStatusForTransaction,
  recomputeAndPersistExpenseStatus,
  reconcileAllExpenseStatuses,
};
