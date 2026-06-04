const path = require('path');
const { Readable } = require('stream');
const { google } = require('googleapis');

if (
  !process.env.GOOGLE_CLIENT_ID ||
  !process.env.GOOGLE_CLIENT_SECRET ||
  !process.env.GOOGLE_REFRESH_TOKEN ||
  !process.env.GOOGLE_DRIVE_MAIN_FOLDER_ID
) {
  throw new Error(
    'Missing OAuth config in .env — need GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_DRIVE_MAIN_FOLDER_ID'
  );
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const MAIN_FOLDER_ID = process.env.GOOGLE_DRIVE_MAIN_FOLDER_ID;
const drive = google.drive({ version: 'v3', auth: oauth2Client });

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

function buildDriveFileName(documentType, invoiceDate, amount, extension) {
  const dateHebrew = formatInvoiceDateHebrew(invoiceDate);
  const amountPart = Number(amount).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const name = `${documentType}_${dateHebrew} (${amountPart})${extension}`;
  return name.replace(/[\\/:*?"<>|]/g, '-');
}

async function findOrCreateSupplierFolder(supplierName) {
  const supplierTrimmed = supplierName.trim();
  const safeSupplier = escapeDriveQueryValue(supplierTrimmed);

  const listResponse = await drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.folder' and name = '${safeSupplier}' and '${MAIN_FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (listResponse.data.files?.length) {
    return listResponse.data.files[0].id;
  }

  const folder = await drive.files.create({
    requestBody: {
      name: supplierTrimmed,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [MAIN_FOLDER_ID],
    },
    fields: 'id',
    supportsAllDrives: true,
  });

  return folder.data.id;
}

async function uploadInvoiceFile({
  supplierName,
  documentType,
  invoiceDate,
  amount,
  file,
}) {
  const folderId = await findOrCreateSupplierFolder(supplierName);

  const extension = path.extname(file.originalname).toLowerCase();
  const newFileName = buildDriveFileName(
    documentType.trim(),
    invoiceDate.trim(),
    amount,
    extension
  );

  const media = {
    mimeType: file.mimetype,
    body: Readable.from(file.buffer),
  };

  const googleFile = await drive.files.create({
    requestBody: {
      name: newFileName,
      parents: [folderId],
    },
    media,
    fields: 'webViewLink, id',
    supportsAllDrives: true,
  });

  const webViewLink = googleFile.data.webViewLink;
  if (!webViewLink) {
    throw new Error('Google Drive did not return webViewLink.');
  }

  return webViewLink;
}

module.exports = {
  MAIN_FOLDER_ID,
  uploadInvoiceFile,
};
