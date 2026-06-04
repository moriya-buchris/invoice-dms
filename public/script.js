const addForm = document.getElementById('add-invoice-form');
const filterForm = document.getElementById('filter-form');
const clearFilterBtn = document.getElementById('clear-filter');
const invoicesTbody = document.getElementById('invoices-tbody');
const invoiceCount = document.getElementById('invoice-count');
const supplierSuggestions = document.getElementById('supplier-suggestions');
const documentTypeSuggestions = document.getElementById('document-type-suggestions');
const filterSupplier = document.getElementById('filter_supplier');
const filterDocumentType = document.getElementById('filter_document_type');
const addFormError = document.getElementById('add-form-error');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAmount(amount) {
  return Number(amount).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function renderFileLink(filePath) {
  if (!filePath) return '—';
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return `<a href="${escapeHtml(filePath)}" target="_blank" rel="noopener">צפייה ב-Drive</a>`;
  }
  return escapeHtml(filePath);
}

function populateDatalist(datalistEl, values) {
  datalistEl.innerHTML = values.map((v) => `<option value="${escapeHtml(v)}"></option>`).join('');
}

function populateSupplierFilter(suppliers, selected) {
  const options = ['<option value="">— הכל —</option>'];
  for (const name of suppliers) {
    const sel = name === selected ? ' selected' : '';
    options.push(`<option value="${escapeHtml(name)}"${sel}>${escapeHtml(name)}</option>`);
  }
  filterSupplier.innerHTML = options.join('');
}

function getFiltersFromForm() {
  return {
    supplier: filterSupplier.value.trim(),
    document_type: filterDocumentType.value.trim(),
  };
}

function getFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    supplier: params.get('supplier')?.trim() || '',
    document_type: params.get('document_type')?.trim() || '',
  };
}

function syncUrlWithFilters(filters) {
  const params = new URLSearchParams();
  if (filters.supplier) params.set('supplier', filters.supplier);
  if (filters.document_type) params.set('document_type', filters.document_type);
  const qs = params.toString();
  const newUrl = qs ? `?${qs}` : window.location.pathname;
  window.history.replaceState({}, '', newUrl);
}

async function loadInvoices(filters) {
  const params = new URLSearchParams();
  if (filters.supplier) params.set('supplier', filters.supplier);
  if (filters.document_type) params.set('document_type', filters.document_type);

  const url = `/get-invoices${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('שגיאה בטעינת החשבוניות');

  const data = await res.json();
  const { invoices, suppliers, documentTypes, filters: serverFilters } = data;
  const hasFilters = Boolean(serverFilters.supplier || serverFilters.documentType);

  populateDatalist(supplierSuggestions, suppliers);
  populateDatalist(documentTypeSuggestions, documentTypes);
  populateSupplierFilter(suppliers, serverFilters.supplier);
  filterDocumentType.value = serverFilters.documentType || '';

  const emptyMessage = hasFilters
    ? 'לא נמצאו חשבוניות לפי הסינון.'
    : 'אין חשבוניות עדיין.';

  if (invoices.length === 0) {
    invoicesTbody.innerHTML = `<tr><td colspan="6" class="empty">${emptyMessage}</td></tr>`;
  } else {
    invoicesTbody.innerHTML = invoices
      .map(
        (row) => `
        <tr>
          <td>${escapeHtml(row.id)}</td>
          <td>${escapeHtml(row.supplier_name)}</td>
          <td><span class="badge">${escapeHtml(row.document_type)}</span></td>
          <td class="amount">₪${escapeHtml(formatAmount(row.amount))}</td>
          <td>${escapeHtml(row.invoice_date)}</td>
          <td class="file-path">${renderFileLink(row.file_path)}</td>
        </tr>`
      )
      .join('');
  }

  invoiceCount.textContent = `מוצגות: ${invoices.length}${hasFilters ? ' (מסונן)' : ''}`;
}

function showAddError(message) {
  addFormError.textContent = message;
  addFormError.classList.remove('hidden');
}

function hideAddError() {
  addFormError.textContent = '';
  addFormError.classList.add('hidden');
}

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAddError();

  const submitBtn = addForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const formData = new FormData(addForm);
    const res = await fetch('/add-invoice', {
      method: 'POST',
      body: formData,
      redirect: 'follow',
    });

    if (res.redirected || res.ok) {
      addForm.reset();
      const filters = getFiltersFromUrl();
      await loadInvoices(filters);
      return;
    }

    const text = await res.text();
    showAddError(text || 'שגיאה בהוספת חשבונית');
  } catch (err) {
    showAddError(err.message || 'שגיאת רשת');
  } finally {
    submitBtn.disabled = false;
  }
});

filterForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const filters = getFiltersFromForm();
  syncUrlWithFilters(filters);
  await loadInvoices(filters);
});

clearFilterBtn.addEventListener('click', async () => {
  filterSupplier.value = '';
  filterDocumentType.value = '';
  syncUrlWithFilters({ supplier: '', document_type: '' });
  await loadInvoices({ supplier: '', document_type: '' });
});

document.addEventListener('DOMContentLoaded', () => {
  const filters = getFiltersFromUrl();
  filterSupplier.value = filters.supplier;
  filterDocumentType.value = filters.document_type;
  loadInvoices(filters).catch((err) => {
    invoicesTbody.innerHTML = `<tr><td colspan="6" class="empty">${escapeHtml(err.message)}</td></tr>`;
  });
});
