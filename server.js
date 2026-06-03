require('dotenv').config();

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const { Readable } = require('stream');
const { google } = require('googleapis');

// --- Google OAuth2 ---
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

// --- App setup ---
const app = express();
const PORT = 3000;

const dbPath = path.join(__dirname, 'invoices.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name TEXT NOT NULL,
    document_type TEXT NOT NULL,
    amount REAL NOT NULL,
    invoice_date TEXT NOT NULL,
    file_path TEXT
  );
`);

console.log('Database and invoices table are ready!');

const selectDistinctSuppliers = db.prepare(
  'SELECT DISTINCT supplier_name FROM invoices ORDER BY supplier_name COLLATE NOCASE'
);
const selectDistinctDocumentTypes = db.prepare(
  'SELECT DISTINCT document_type FROM invoices ORDER BY document_type COLLATE NOCASE'
);
const insertInvoice = db.prepare(`
  INSERT INTO invoices (supplier_name, document_type, amount, invoice_date, file_path)
  VALUES (@supplier_name, @document_type, @amount, @invoice_date, @file_path)
`);

app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    return next();
  }
  express.urlencoded({ extended: true })(req, res, next);
});

const upload = multer({ storage: multer.memoryStorage() });

// --- Helpers ---
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

function queryInvoices(filters = {}) {
  let sql = 'SELECT * FROM invoices WHERE 1=1';
  const params = {};
  if (filters.supplier) {
    sql += ' AND supplier_name = @supplier';
    params.supplier = filters.supplier;
  }
  if (filters.documentType) {
    sql += ' AND document_type = @documentType';
    params.documentType = filters.documentType;
  }
  sql += ' ORDER BY id DESC';
  return db.prepare(sql).all(params);
}

function optionSelected(value, current) {
  return value === current ? ' selected' : '';
}

const STANDARD_DOCUMENT_TYPES = ['חשבונית מס', 'קבלה'];

function buildDocumentTypeSuggestions(existingTypes) {
  const seen = new Set();
  const merged = [];
  for (const type of [...STANDARD_DOCUMENT_TYPES, ...existingTypes]) {
    const t = type?.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      merged.push(t);
    }
  }
  return merged;
}

function renderFileLink(filePath) {
  if (!filePath) return '—';
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return `<a href="${escapeHtml(filePath)}" target="_blank" rel="noopener">צפייה ב-Drive</a>`;
  }
  return escapeHtml(filePath);
}

function renderPage(invoices, filters, suppliers, documentTypes) {
  const hasFilters = Boolean(filters.supplier || filters.documentType);
  const emptyMessage = hasFilters
    ? 'לא נמצאו חשבוניות לפי הסינון. <a href="/">איפוס</a>'
    : 'אין חשבוניות עדיין.';

  const supplierFilterOptions = suppliers
    .map(
      (n) =>
        `<option value="${escapeHtml(n)}"${optionSelected(n, filters.supplier)}>${escapeHtml(n)}</option>`
    )
    .join('');
  const supplierSuggestions = suppliers
    .map((n) => `<option value="${escapeHtml(n)}"></option>`)
    .join('');
  const documentTypeSuggestions = buildDocumentTypeSuggestions(documentTypes)
    .map((t) => `<option value="${escapeHtml(t)}"></option>`)
    .join('');

  const tableRows =
    invoices.length === 0
      ? `<tr><td colspan="6" class="empty">${emptyMessage}</td></tr>`
      : invoices
          .map(
            (row) => `
        <tr>
          <td>${escapeHtml(row.id)}</td>
          <td>${escapeHtml(row.supplier_name)}</td>
          <td><span class="badge">${escapeHtml(row.document_type)}</span></td>
          <td class="amount">₪${escapeHtml(Number(row.amount).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</td>
          <td>${escapeHtml(row.invoice_date)}</td>
          <td class="file-path">${renderFileLink(row.file_path)}</td>
        </tr>`
          )
          .join('');

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>מערכת ניהול חשבוניות - Invoice DMS</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; background: linear-gradient(135deg, #f0f4ff 0%, #e8f5e9 100%); min-height: 100vh; padding: 2rem 1rem; color: #1a1a2e; }
    .container { max-width: 1100px; margin: 0 auto; }
    h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem; color: #16213e; }
    .subtitle { color: #5c6b7a; margin-bottom: 2rem; font-size: 0.95rem; }
    .card { background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(22, 33, 62, 0.08); padding: 1.75rem; margin-bottom: 2rem; }
    .card h2 { font-size: 1.15rem; margin-bottom: 1.25rem; color: #0f3460; border-bottom: 2px solid #e8eef5; padding-bottom: 0.5rem; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem 1.25rem; }
    label { display: block; font-size: 0.85rem; font-weight: 600; color: #394867; margin-bottom: 0.35rem; }
    input, select { width: 100%; padding: 0.65rem 0.85rem; border: 1px solid #d0dae8; border-radius: 10px; font-size: 0.95rem; font-family: inherit; }
    input:focus, select:focus { outline: none; border-color: #4361ee; box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.15); }
    .field-hint { font-size: 0.78rem; color: #7a8a99; margin-top: 0.35rem; font-weight: 400; }
    input[type="file"] { padding: 0.5rem; background: #f8fafc; }
    .full-width { grid-column: 1 / -1; }
    button[type="submit"] { margin-top: 0.5rem; padding: 0.75rem 2rem; background: linear-gradient(135deg, #4361ee, #3a56d4); color: #fff; border: none; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; font-family: inherit; }
    button[type="submit"]:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(67, 97, 238, 0.35); }
    .form-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin-top: 0.5rem; }
    button[type="submit"].btn-filter { background: linear-gradient(135deg, #0f766e, #0d9488); }
    .btn-clear { display: inline-block; padding: 0.75rem 1.25rem; color: #4361ee; text-decoration: none; font-weight: 600; border-radius: 10px; border: 1px solid #d0dae8; background: #fff; }
    .filter-hint { font-size: 0.85rem; color: #5c6b7a; margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    thead { background: #f4f7fb; }
    th { text-align: right; padding: 0.85rem 1rem; font-weight: 600; color: #394867; border-bottom: 2px solid #e2e8f0; }
    td { padding: 0.85rem 1rem; border-bottom: 1px solid #eef2f7; vertical-align: top; }
    tr:hover td { background: #fafbfd; }
    .amount { font-weight: 600; color: #0f766e; }
    .file-path a { color: #4361ee; }
    .badge { display: inline-block; padding: 0.2rem 0.55rem; background: #e8eeff; color: #3a56d4; border-radius: 6px; font-size: 0.8rem; font-weight: 600; }
    .empty { text-align: center; color: #7a8a99; padding: 2rem !important; }
    .count { font-size: 0.85rem; color: #5c6b7a; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>מערכת ניהול חשבוניות - Invoice DMS</h1>
    <p class="subtitle">OAuth2 — קבצים נשמרים ב-Google Drive שלך לפי ספק</p>

    <div class="card">
      <h2>הוספת חשבונית חדשה</h2>
      <form method="POST" action="/add-invoice" enctype="multipart/form-data">
        <div class="form-grid">
          <div class="full-width">
            <label for="supplier_name">שם בית עסק / ספק</label>
            <input type="text" id="supplier_name" name="supplier_name" list="supplier-suggestions" required autocomplete="off" />
            <datalist id="supplier-suggestions">${supplierSuggestions}</datalist>
          </div>
          <div class="full-width">
            <label for="document_type">סוג מסמך</label>
            <input type="text" id="document_type" name="document_type" list="document-type-suggestions" required autocomplete="off" />
            <datalist id="document-type-suggestions">${documentTypeSuggestions}</datalist>
          </div>
          <div>
            <label for="amount">סכום (₪)</label>
            <input type="number" id="amount" name="amount" step="0.01" min="0" required />
          </div>
          <div>
            <label for="invoice_date">תאריך חשבונית</label>
            <input type="date" id="invoice_date" name="invoice_date" required />
          </div>
          <div class="full-width">
            <label for="file_path">תמונה / קובץ חשבונית</label>
            <input type="file" id="file_path" name="file_path" required />
            <p class="field-hint">העלאה מהזיכרון ישירות ל-Drive (OAuth2).</p>
          </div>
        </div>
        <button type="submit">הוסף חשבונית</button>
      </form>
    </div>

    <div class="card">
      <h2>סינון חשבוניות</h2>
      <form method="GET" action="/">
        <div class="form-grid">
          <div>
            <label for="filter_supplier">ספק</label>
            <select id="filter_supplier" name="supplier">
              <option value=""${optionSelected('', filters.supplier)}>— הכל —</option>
              ${supplierFilterOptions}
            </select>
          </div>
          <div>
            <label for="filter_document_type">סוג מסמך</label>
            <select id="filter_document_type" name="document_type">
              <option value=""${optionSelected('', filters.documentType)}>— הכל —</option>
              <option value="חשבונית מס"${optionSelected('חשבונית מס', filters.documentType)}>חשבונית מס</option>
              <option value="קבלה"${optionSelected('קבלה', filters.documentType)}>קבלה</option>
            </select>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-filter">הצג תוצאות</button>
          <a href="/" class="btn-clear">נקה סינון</a>
        </div>
      </form>
    </div>

    <div class="card">
      <h2>חשבוניות שמורות</h2>
      <p class="count">מוצגות: ${invoices.length}${hasFilters ? ' (מסונן)' : ''}</p>
      <table>
        <thead>
          <tr><th>#</th><th>ספק</th><th>סוג</th><th>סכום</th><th>תאריך</th><th>Drive</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

// --- Routes ---
app.get('/', (req, res) => {
  const supplier = req.query.supplier?.trim() || '';
  const documentType = req.query.document_type?.trim() || '';
  const filters = {
    supplier: supplier || null,
    documentType: documentType || null,
  };
  const suppliers = selectDistinctSuppliers.all().map((r) => r.supplier_name);
  const documentTypes = selectDistinctDocumentTypes.all().map((r) => r.document_type);
  const rows = queryInvoices(filters);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(renderPage(rows, { supplier, documentType }, suppliers, documentTypes));
});

app.post('/add-invoice', upload.single('file_path'), async (req, res) => {
  try {
    const { supplier_name, document_type, amount, invoice_date } = req.body;

    if (!supplier_name?.trim() || !document_type?.trim() || !invoice_date?.trim() || !req.file) {
      return res.status(400).send('חסרים שדות חובה או שלא הועלה קובץ.');
    }

    const parsedAmount = parseFloat(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).send('סכום לא תקין.');
    }

    const supplierTrimmed = supplier_name.trim();
    const safeSupplier = escapeDriveQueryValue(supplierTrimmed);

    // 1. Find or create supplier subfolder inside MAIN_FOLDER_ID
    let folderId = MAIN_FOLDER_ID;
    const listResponse = await drive.files.list({
      q: `mimeType = 'application/vnd.google-apps.folder' and name = '${safeSupplier}' and '${MAIN_FOLDER_ID}' in parents and trashed = false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (listResponse.data.files?.length) {
      folderId = listResponse.data.files[0].id;
    } else {
      const folder = await drive.files.create({
        requestBody: {
          name: supplierTrimmed,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [MAIN_FOLDER_ID],
        },
        fields: 'id',
        supportsAllDrives: true,
      });
      folderId = folder.data.id;
    }

    // 2. Hebrew file name: documentType_date (amount).ext
    const extension = path.extname(req.file.originalname).toLowerCase();
    const newFileName = buildDriveFileName(
      document_type.trim(),
      invoice_date.trim(),
      parsedAmount,
      extension
    );

    // 3. Upload from memory buffer (user OAuth quota)
    const media = {
      mimeType: req.file.mimetype,
      body: Readable.from(req.file.buffer),
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

    // 4. Save to SQLite
    insertInvoice.run({
      supplier_name: supplierTrimmed,
      document_type: document_type.trim(),
      amount: parsedAmount,
      invoice_date: invoice_date.trim(),
      file_path: webViewLink,
    });

    res.redirect('/');
  } catch (error) {
    console.error('Error during invoice creation:', error);
    res.status(500).send(error.message || 'שגיאה פנימית בשרת בעת העלאת הקובץ.');
  }
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
  console.log('Auth: OAuth2 (refresh token)');
  console.log(`Drive main folder: ${MAIN_FOLDER_ID}`);
});
