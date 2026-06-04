const express = require('express');
const multer = require('multer');
const {
  selectDistinctSuppliers,
  selectDistinctDocumentTypes,
  insertInvoice,
  queryInvoices,
} = require('../db/invoices');
const { uploadInvoiceFile } = require('../services/googleDriveService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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

router.get('/get-invoices', (req, res) => {
  const supplier = req.query.supplier?.trim() || '';
  const documentType = req.query.document_type?.trim() || '';
  const filters = {
    supplier: supplier || null,
    documentType: documentType || null,
  };

  const suppliers = selectDistinctSuppliers.all().map((r) => r.supplier_name);
  const documentTypes = selectDistinctDocumentTypes.all().map((r) => r.document_type);
  const invoices = queryInvoices(filters);

  res.json({
    invoices,
    suppliers,
    documentTypes: buildDocumentTypeSuggestions(documentTypes),
    filters: { supplier, documentType },
  });
});

router.post('/add-invoice', upload.single('file_path'), async (req, res) => {
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

    const webViewLink = await uploadInvoiceFile({
      supplierName: supplierTrimmed,
      documentType: document_type.trim(),
      invoiceDate: invoice_date.trim(),
      amount: parsedAmount,
      file: req.file,
    });

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

module.exports = router;
