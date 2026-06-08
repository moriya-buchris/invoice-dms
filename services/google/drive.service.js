const path = require('path');
const { Readable } = require('stream');
const { google } = require('googleapis');

const config = require('../../config');
const { getAuth } = require('./auth.service');

function escapeDriveQueryValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildSmartDriveFileName(expenseDate, amount, documentType, extension) {
  const datePart = String(expenseDate).trim().slice(0, 10);
  const amountPart = Number(amount).toFixed(2);
  const safeType = String(documentType)
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-');
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  return `${datePart}_סכום_${amountPart}_${safeType}${ext}`;
}

async function findOrCreateSupplierFolder(auth, supplierName) {
  const drive = google.drive({ version: 'v3', auth });
  const supplierTrimmed = supplierName.trim();
  const safeSupplier = escapeDriveQueryValue(supplierTrimmed);

  const listResponse = await drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.folder' and name = '${safeSupplier}' and '${config.google.mainFolderId}' in parents and trashed = false`,
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
      parents: [config.google.mainFolderId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });

  return folder.data.id;
}

async function uploadExpenseDocument({
  supplierName,
  documentType,
  expenseDate,
  amount,
  file,
  auth: providedAuth = null,
}) {
  const auth = providedAuth || (await getAuth());
  const drive = google.drive({ version: 'v3', auth });
  const supplierFolderId = await findOrCreateSupplierFolder(auth, supplierName);

  const extension = path.extname(file.originalname).toLowerCase() || '.bin';
  const newFileName = buildSmartDriveFileName(
    expenseDate,
    amount,
    documentType,
    extension
  );

  const media = {
    mimeType: file.mimetype,
    body: Readable.from(file.buffer),
  };

  const googleFile = await drive.files.create({
    requestBody: {
      name: newFileName,
      parents: [supplierFolderId],
    },
    media,
    fields: 'webViewLink, id',
    supportsAllDrives: true,
  });

  const webViewLink = googleFile.data.webViewLink;
  const driveFileId = googleFile.data.id;
  if (!webViewLink || !driveFileId) {
    throw new Error('Google Drive did not return webViewLink or file id.');
  }

  return {
    auth,
    webViewLink,
    driveFileId,
    supplierFolderId,
  };
}

module.exports = {
  buildSmartDriveFileName,
  findOrCreateSupplierFolder,
  uploadExpenseDocument,
};
