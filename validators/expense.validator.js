const ValidationError = require('../errors/ValidationError');
const { VALID_DOCUMENT_TYPES, ALL_STATUSES } = require('../config/constants');

function normalizeFilterDate(value) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new ValidationError('פורמט תאריך לא תקין. השתמש ב-YYYY-MM-DD.');
  }
  return trimmed;
}

function validateDateRange(dateFrom, dateTo) {
  const from = normalizeFilterDate(dateFrom);
  const to = normalizeFilterDate(dateTo);
  if (from && to && from > to) {
    throw new ValidationError('תאריך "מתאריך" לא יכול להיות אחרי "עד תאריך".');
  }
  return { dateFrom: from, dateTo: to };
}

function validateFilterStatus(status) {
  const trimmed = status?.trim();
  if (!trimmed) return null;
  if (!ALL_STATUSES.includes(trimmed)) {
    throw new ValidationError('סטטוס סינון לא תקין.');
  }
  return trimmed;
}

function validateExpenseDateNotFuture(expenseDate) {
  const trimmed = expenseDate?.trim();
  const today = new Date().toISOString().slice(0, 10);
  if (trimmed > today) {
    throw new ValidationError('תאריך הוצאה לא יכול להיות בעתיד.');
  }
  return trimmed;
}

function validateDocumentType(documentType) {
  const trimmed = documentType?.trim();
  if (!VALID_DOCUMENT_TYPES.includes(trimmed)) {
    throw new ValidationError(
      `סוג מסמך לא תקין. מותר: ${VALID_DOCUMENT_TYPES.join(', ')}`
    );
  }
  return trimmed;
}

function validateCreateExpenseInput(input) {
  const expenseDateInput = (input.expense_date || input.invoice_date)?.trim();

  if (!input.supplier_name?.trim() || !input.document_type?.trim() || !expenseDateInput) {
    throw new ValidationError('חסרים שדות חובה.');
  }

  const parsedAmount = parseFloat(input.amount);
  if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
    throw new ValidationError('סכום לא תקין.');
  }

  validateExpenseDateNotFuture(expenseDateInput);

  return {
    supplierName: input.supplier_name.trim(),
    documentType: validateDocumentType(input.document_type),
    amount: parsedAmount,
    expenseDate: expenseDateInput,
  };
}

function parseListFilters(filters = {}) {
  const supplier = filters.supplier?.trim() || '';
  const documentType = filters.document_type?.trim() || '';
  const status = validateFilterStatus(filters.status);
  const { dateFrom, dateTo } = validateDateRange(
    filters.date_from || filters.from_date,
    filters.date_to || filters.to_date
  );

  return {
    queryFilters: {
      supplier: supplier || null,
      documentType: documentType || null,
      status,
      dateFrom,
      dateTo,
    },
    responseFilters: {
      supplier,
      documentType,
      status: status || '',
      dateFrom: dateFrom || '',
      dateTo: dateTo || '',
    },
  };
}

module.exports = {
  validateDateRange,
  validateFilterStatus,
  validateExpenseDateNotFuture,
  validateDocumentType,
  validateCreateExpenseInput,
  parseListFilters,
};
