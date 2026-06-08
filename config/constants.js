const DOC_INVOICE = 'חשבונית מס';
const DOC_RECEIPT = 'קבלה';
const DOC_COMBINED = 'חשבונית מס / קבלה';

const VALID_DOCUMENT_TYPES = [DOC_INVOICE, DOC_RECEIPT, DOC_COMBINED];

const STATUS_PENDING = 'ממתין לתשלום';
const STATUS_PAID_MISSING_INVOICE = '⚠️ שולם - חסרה חשבונית מס!';
const STATUS_APPROVED = '🟢 שולם ומאושר לרואה חשבון';

const ALL_STATUSES = [STATUS_PENDING, STATUS_PAID_MISSING_INVOICE, STATUS_APPROVED];

const SUPPLIER_SHEET_NAME_PREFIX = 'ריכוז הוצאות - ';
const LEGACY_SUPPLIER_SHEET_NAME = 'סיכום הוצאות';
const SUPPLIER_SHEET_HEADERS = ['תאריך', 'שם ספק', 'סכום', 'סטטוס'];
const SHEET_HEADER_ROW = 1;
const SHEET_DATA_START_ROW = 2;

const SUMMARY_LABEL_TOTAL = 'סך הכל הוצאות';
const SUMMARY_LABEL_PAID = 'שולם בפועל';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
];

function buildSupplierSpreadsheetName(supplierName) {
  return `${SUPPLIER_SHEET_NAME_PREFIX}${supplierName.trim()}`;
}

module.exports = {
  DOC_INVOICE,
  DOC_RECEIPT,
  DOC_COMBINED,
  VALID_DOCUMENT_TYPES,
  STATUS_PENDING,
  STATUS_PAID_MISSING_INVOICE,
  STATUS_APPROVED,
  ALL_STATUSES,
  SUPPLIER_SHEET_NAME_PREFIX,
  LEGACY_SUPPLIER_SHEET_NAME,
  SUPPLIER_SHEET_HEADERS,
  SHEET_HEADER_ROW,
  SHEET_DATA_START_ROW,
  SUMMARY_LABEL_TOTAL,
  SUMMARY_LABEL_PAID,
  buildSupplierSpreadsheetName,
  GOOGLE_SCOPES,
};
