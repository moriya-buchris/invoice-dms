const { google } = require('googleapis');

const {
  STATUS_APPROVED,
  STATUS_PAID_MISSING_INVOICE,
  LEGACY_SUPPLIER_SHEET_NAME,
  SUPPLIER_SHEET_HEADERS,
  SHEET_DATA_START_ROW,
  SUMMARY_LABEL_TOTAL,
  SUMMARY_LABEL_PAID,
  buildSupplierSpreadsheetName,
} = require('../../config/constants');

const LEGACY_SUMMARY_LABELS = new Set([
  SUMMARY_LABEL_TOTAL,
  SUMMARY_LABEL_PAID,
  'סך התחייבויות והוצאות כללי',
  'סך הוצאות ששולמו בפועל',
  'סה"כ התחייבויות',
  'סה"כ שולם',
]);

function escapeDriveQueryValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatInvoiceDateHebrew(invoiceDate) {
  const trimmed = String(invoiceDate).trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return `${Number(isoMatch[3])}/${Number(isoMatch[2])}/${isoMatch[1].slice(-2)}`;
  }
  return trimmed;
}

function sheetRange(sheetTitle, a1Range) {
  const escapedTitle = sheetTitle.replace(/'/g, "''");
  return `'${escapedTitle}'!${a1Range}`;
}

function isSummaryRow(row) {
  const label = row?.[0]?.trim();
  return LEGACY_SUMMARY_LABELS.has(label);
}

function normalizeDataRow(row) {
  return [
    row?.[0] ?? '',
    row?.[1] ?? '',
    row?.[2] ?? '',
    row?.[3] ?? '',
  ];
}

function splitSheetRows(allRows) {
  const headers =
    allRows.length > 0 && allRows[0]?.length
      ? normalizeDataRow(allRows[0])
      : [...SUPPLIER_SHEET_HEADERS];

  const body = allRows
    .slice(1)
    .map(normalizeDataRow)
    .filter((row) => !row.every((cell) => cell === ''));

  const dataRows = [...body];
  while (dataRows.length && isSummaryRow(dataRows[dataRows.length - 1])) {
    dataRows.pop();
  }

  return { headers, dataRows };
}

function findExpenseRowIndex(dataRows, expense) {
  const targetDate = formatInvoiceDateHebrew(expense.expense_date);
  const targetAmount = Number(expense.amount);

  for (let i = 0; i < dataRows.length; i++) {
    const [date, supplier, amount] = dataRows[i];
    if (
      date === targetDate &&
      supplier === expense.supplier_name &&
      Number(amount) === targetAmount
    ) {
      return i;
    }
  }

  return -1;
}

function buildSummaryRows(dataRowCount) {
  if (dataRowCount === 0) {
    return [
      [SUMMARY_LABEL_TOTAL, '', '0', ''],
      [SUMMARY_LABEL_PAID, '', '0', ''],
    ];
  }

  const dataStart = SHEET_DATA_START_ROW;
  const dataEnd = SHEET_DATA_START_ROW + dataRowCount - 1;

  return [
    [SUMMARY_LABEL_TOTAL, '', `=SUM(C${dataStart}:C${dataEnd})`, ''],
    [
      SUMMARY_LABEL_PAID,
      '',
      `=SUMIF(D${dataStart}:D${dataEnd},"${STATUS_APPROVED}",C${dataStart}:C${dataEnd})+SUMIF(D${dataStart}:D${dataEnd},"${STATUS_PAID_MISSING_INVOICE}",C${dataStart}:C${dataEnd})`,
      '',
    ],
  ];
}

function buildFullSheetValues(dataRows) {
  const summaryRows = buildSummaryRows(dataRows.length);
  return [[...SUPPLIER_SHEET_HEADERS], ...dataRows, ...summaryRows];
}

function sheetRowNumberForDataIndex(dataIndex) {
  return SHEET_DATA_START_ROW + dataIndex;
}

async function getFirstSheetTitle(sheets, spreadsheetId) {
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });

  const title = data.sheets?.[0]?.properties?.title;
  if (!title) {
    throw new Error('Spreadsheet has no sheets.');
  }

  return title;
}

async function findSpreadsheetByName(auth, folderId, fileName) {
  const drive = google.drive({ version: 'v3', auth });
  const safeName = escapeDriveQueryValue(fileName);

  const listResponse = await drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${safeName}' and '${folderId}' in parents and trashed = false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return listResponse.data.files?.[0]?.id ?? null;
}

async function findSupplierSpreadsheet(auth, folderId, supplierName) {
  const supplierSheetName = buildSupplierSpreadsheetName(supplierName);
  const byNewName = await findSpreadsheetByName(auth, folderId, supplierSheetName);
  if (byNewName) {
    return byNewName;
  }

  return findSpreadsheetByName(auth, folderId, LEGACY_SUPPLIER_SHEET_NAME);
}

async function initializeSupplierSpreadsheet(auth, spreadsheetId) {
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetTitle = await getFirstSheetTitle(sheets, spreadsheetId);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: sheetRange(sheetTitle, 'A1:D1'),
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [SUPPLIER_SHEET_HEADERS],
    },
  });
}

async function createSupplierSpreadsheet(auth, folderId, supplierName) {
  const drive = google.drive({ version: 'v3', auth });
  const spreadsheetName = buildSupplierSpreadsheetName(supplierName);

  const created = await drive.files.create({
    requestBody: {
      name: spreadsheetName,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [folderId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });

  const spreadsheetId = created.data.id;
  if (!spreadsheetId) {
    throw new Error('Google Drive did not return spreadsheet id.');
  }

  await initializeSupplierSpreadsheet(auth, spreadsheetId);
  return spreadsheetId;
}

async function getOrCreateSupplierSpreadsheet(auth, folderId, supplierName) {
  const existingId = await findSupplierSpreadsheet(auth, folderId, supplierName);
  if (existingId) {
    return existingId;
  }

  return createSupplierSpreadsheet(auth, folderId, supplierName);
}

async function readSheetRows(sheets, spreadsheetId, sheetTitle) {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRange(sheetTitle, 'A:D'),
  });

  return data.values || [];
}

async function writeSheetWithDynamicSummary(sheets, spreadsheetId, sheetTitle, dataRows) {
  const values = buildFullSheetValues(dataRows);
  const lastRow = values.length;

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: sheetRange(sheetTitle, 'A:Z'),
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: sheetRange(sheetTitle, `A1:D${lastRow}`),
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

async function syncExpenseToSupplierSheet(
  auth,
  folderId,
  supplierName,
  expense,
  { isNew }
) {
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = await getOrCreateSupplierSpreadsheet(auth, folderId, supplierName);
  const sheetTitle = await getFirstSheetTitle(sheets, spreadsheetId);
  const spreadsheetName = buildSupplierSpreadsheetName(supplierName);

  const allRows = await readSheetRows(sheets, spreadsheetId, sheetTitle);
  const { dataRows } = splitSheetRows(allRows);

  let rowNumber = expense.sheet_row;
  let dataIndex = -1;

  if (isNew) {
    const expenseRow = [
      formatInvoiceDateHebrew(expense.expense_date),
      expense.supplier_name,
      expense.amount,
      expense.status,
    ];
    dataRows.push(expenseRow);
    dataIndex = dataRows.length - 1;
    rowNumber = sheetRowNumberForDataIndex(dataIndex);
  } else {
    dataIndex = findExpenseRowIndex(dataRows, expense);

    if (dataIndex === -1 && rowNumber) {
      dataIndex = rowNumber - SHEET_DATA_START_ROW;
      if (dataIndex >= 0 && dataIndex < dataRows.length) {
        dataRows[dataIndex][3] = expense.status;
      } else {
        dataIndex = -1;
      }
    }

    if (dataIndex >= 0) {
      dataRows[dataIndex][3] = expense.status;
      rowNumber = sheetRowNumberForDataIndex(dataIndex);
    } else {
      const expenseRow = [
        formatInvoiceDateHebrew(expense.expense_date),
        expense.supplier_name,
        expense.amount,
        expense.status,
      ];
      dataRows.push(expenseRow);
      dataIndex = dataRows.length - 1;
      rowNumber = sheetRowNumberForDataIndex(dataIndex);
    }
  }

  await writeSheetWithDynamicSummary(sheets, spreadsheetId, sheetTitle, dataRows);

  console.log(
    `Synced expense #${expense.id} (${isNew ? 'new row' : 'status update'}) in "${spreadsheetName}"`
  );

  return rowNumber || null;
}

module.exports = {
  syncExpenseToSupplierSheet,
  buildSupplierSpreadsheetName,
};
