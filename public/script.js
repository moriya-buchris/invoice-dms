const addForm = document.getElementById('add-invoice-form');
const filterForm = document.getElementById('filter-form');
const clearFilterBtn = document.getElementById('clear-filter');
const invoicesTbody = document.getElementById('invoices-tbody');
const invoiceCount = document.getElementById('invoice-count');
const supplierSuggestions = document.getElementById('supplier-suggestions');
const filterSupplier = document.getElementById('filter_supplier');
const filterDocumentType = document.getElementById('filter_document_type');
const filterStatus = document.getElementById('filter_status');
const filterDateFrom = document.getElementById('filter_date_from');
const filterDateTo = document.getElementById('filter_date_to');
const addFormError = document.getElementById('add-form-error');
const toastEl = document.getElementById('toast');
const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-expense-form');
const editFormError = document.getElementById('edit-form-error');
const editExpenseId = document.getElementById('edit_expense_id');
const editSupplierName = document.getElementById('edit_supplier_name');
const editAmount = document.getElementById('edit_amount');
const editExpenseDate = document.getElementById('edit_expense_date');
const editStatusDisplay = document.getElementById('edit_status_display');
const editDocumentType = document.getElementById('edit_document_type');
const editFilePath = document.getElementById('edit_file_path');

let cachedExpenses = [];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusBadgeClass(status) {
  if (status === '🟢 שולם ומאושר לרואה חשבון') return 'status-approved';
  if (status === '⚠️ שולם - חסרה חשבונית מס!') return 'status-warning';
  return 'status-pending';
}

function formatAmount(amount) {
  return Number(amount).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function driveLinkForFileId(fileId) {
  if (!fileId) return null;
  if (fileId.startsWith('http://') || fileId.startsWith('https://')) {
    return fileId;
  }
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

let toastTimer = null;

function showToast(message, isError = false) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.remove('hidden', 'toast-error', 'toast-success');
  toastEl.classList.add(isError ? 'toast-error' : 'toast-success');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 3500);
}

function renderDocuments(documents) {
  if (!documents?.length) return '—';
  return documents
    .map((doc) => {
      const href = driveLinkForFileId(doc.drive_file_id);
      if (!href) {
        return `<span class="badge">${escapeHtml(doc.document_type)}</span>`;
      }
      return `<span class="badge"><a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(doc.document_type)}</a></span>`;
    })
    .join(' ');
}

function populateDatalist(datalistEl, values) {
  datalistEl.innerHTML = values.map((v) => `<option value="${escapeHtml(v)}"></option>`).join('');
}

function populateSupplierFilter(suppliers, selected) {
  const options = ['<option value="">הכל</option>'];
  for (const name of suppliers) {
    const sel = name === selected ? ' selected' : '';
    options.push(`<option value="${escapeHtml(name)}"${sel}>${escapeHtml(name)}</option>`);
  }
  filterSupplier.innerHTML = options.join('');
}

const EMPTY_FILTERS = {
  supplier: '',
  document_type: '',
  status: '',
  date_from: '',
  date_to: '',
};

function normalizeFilters(filters = {}) {
  return {
    supplier: filters.supplier?.trim() || '',
    document_type: filters.document_type?.trim() || '',
    status: filters.status?.trim() || '',
    date_from: filters.date_from?.trim() || '',
    date_to: filters.date_to?.trim() || '',
  };
}

function hasActiveFilters(filters) {
  const f = normalizeFilters(filters);
  return Boolean(f.supplier || f.document_type || f.status || f.date_from || f.date_to);
}

function applyFiltersToForm(filters) {
  const f = normalizeFilters(filters);
  filterSupplier.value = f.supplier;
  filterDocumentType.value = f.document_type;
  filterStatus.value = f.status;
  filterDateFrom.value = f.date_from;
  filterDateTo.value = f.date_to;
}

function getFiltersFromForm() {
  return normalizeFilters({
    supplier: filterSupplier.value,
    document_type: filterDocumentType.value,
    status: filterStatus.value,
    date_from: filterDateFrom.value,
    date_to: filterDateTo.value,
  });
}

function getFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return normalizeFilters({
    supplier: params.get('supplier') || '',
    document_type: params.get('document_type') || '',
    status: params.get('status') || '',
    date_from: params.get('date_from') || '',
    date_to: params.get('date_to') || '',
  });
}

function resolveFiltersForQuery(filters) {
  if (!hasActiveFilters(filters)) {
    return { ...EMPTY_FILTERS };
  }
  return normalizeFilters(filters);
}

function syncUrlWithFilters(filters) {
  const params = new URLSearchParams();
  if (filters.supplier) params.set('supplier', filters.supplier);
  if (filters.document_type) params.set('document_type', filters.document_type);
  if (filters.status) params.set('status', filters.status);
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  const qs = params.toString();
  const newUrl = qs ? `?${qs}` : window.location.pathname;
  window.history.replaceState({}, '', newUrl);
}

async function loadExpenses(filters) {
  const activeFilters = resolveFiltersForQuery(filters);
  const params = new URLSearchParams();
  if (activeFilters.supplier) params.set('supplier', activeFilters.supplier);
  if (activeFilters.document_type) params.set('document_type', activeFilters.document_type);
  if (activeFilters.status) params.set('status', activeFilters.status);
  if (activeFilters.date_from) params.set('date_from', activeFilters.date_from);
  if (activeFilters.date_to) params.set('date_to', activeFilters.date_to);

  const url = `/get-expenses${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'שגיאה בטעינת ההוצאות');
  }

  const { expenses, suppliers, filters: serverFilters } = data;
  cachedExpenses = expenses;
  const hasFilters = Boolean(
    serverFilters.supplier ||
      serverFilters.documentType ||
      serverFilters.status ||
      serverFilters.dateFrom ||
      serverFilters.dateTo
  );

  populateDatalist(supplierSuggestions, suppliers);
  populateSupplierFilter(suppliers, serverFilters.supplier);
  filterDocumentType.value = serverFilters.documentType || '';
  filterStatus.value = serverFilters.status || '';
  filterDateFrom.value = serverFilters.dateFrom || '';
  filterDateTo.value = serverFilters.dateTo || '';

  const emptyMessage = hasFilters
    ? 'לא נמצאו הוצאות לפי הסינון.'
    : 'אין הוצאות עדיין.';

  if (expenses.length === 0) {
    invoicesTbody.innerHTML = `<tr><td colspan="7" class="empty">${emptyMessage}</td></tr>`;
  } else {
    invoicesTbody.innerHTML = expenses
      .map(
        (row) => `
        <tr data-expense-id="${escapeHtml(row.id)}">
          <td>${escapeHtml(row.id)}</td>
          <td>${escapeHtml(row.supplier_name)}</td>
          <td class="amount">₪${escapeHtml(formatAmount(row.amount))}</td>
          <td>${escapeHtml(row.expense_date)}</td>
          <td><span class="badge ${statusBadgeClass(row.status)}">${escapeHtml(row.status)}</span></td>
          <td class="file-path">${renderDocuments(row.documents)}</td>
          <td class="actions-cell">
            <button
              type="button"
              class="btn-edit"
              data-expense-id="${escapeHtml(row.id)}"
              title="ערוך הוצאה"
              aria-label="ערוך הוצאה מספר ${escapeHtml(row.id)}"
            >✏️</button>
            <button
              type="button"
              class="btn-delete"
              data-expense-id="${escapeHtml(row.id)}"
              title="מחק הוצאה"
              aria-label="מחק הוצאה מספר ${escapeHtml(row.id)}"
            >🗑️</button>
          </td>
        </tr>`
      )
      .join('');
  }

  invoiceCount.textContent = `מוצגות: ${expenses.length}${hasFilters ? ' (מסונן)' : ''}`;
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

  const expenseDate = document.getElementById('expense_date')?.value?.trim();
  const today = new Date().toISOString().slice(0, 10);
  if (expenseDate && expenseDate > today) {
    showAddError('תאריך הוצאה לא יכול להיות בעתיד.');
    return;
  }

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
      setExpenseDateMaxToday();
      const filters = resolveFiltersForQuery(getFiltersFromUrl());
      await loadExpenses(filters);
      return;
    }

    const text = await res.text();
    showAddError(text || 'שגיאה בהוספת מסמך');
  } catch (err) {
    showAddError(err.message || 'שגיאת רשת');
  } finally {
    submitBtn.disabled = false;
  }
});

filterForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const filters = resolveFiltersForQuery(getFiltersFromForm());
  applyFiltersToForm(filters);
  syncUrlWithFilters(filters);
  await loadExpenses(filters);
});

clearFilterBtn.addEventListener('click', async () => {
  const filters = { ...EMPTY_FILTERS };
  applyFiltersToForm(filters);
  syncUrlWithFilters(filters);
  await loadExpenses(filters);
});

function setExpenseDateMaxToday() {
  const expenseDateInput = document.getElementById('expense_date');
  if (expenseDateInput) {
    expenseDateInput.max = new Date().toISOString().slice(0, 10);
  }
}

async function deleteExpenseById(expenseId, buttonEl) {
  if (!window.confirm('למחוק את ההוצאה הזו? הפעולה תסיר גם את הקבצים ב-Drive ואת השורה בגיליון הספק.')) {
    return;
  }

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  try {
    const res = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || 'שגיאה במחיקת ההוצאה');
    }

    const row = invoicesTbody.querySelector(`tr[data-expense-id="${expenseId}"]`);
    if (row) {
      row.remove();
    }

    const filters = resolveFiltersForQuery(getFiltersFromUrl());
    await loadExpenses(filters);
    showToast(data.message || 'ההוצאה נמחקה בהצלחה.');
  } catch (err) {
    showToast(err.message || 'שגיאה במחיקה', true);
    if (buttonEl) {
      buttonEl.disabled = false;
    }
  }
}

function showEditError(message) {
  editFormError.textContent = message;
  editFormError.classList.remove('hidden');
}

function hideEditError() {
  editFormError.textContent = '';
  editFormError.classList.add('hidden');
}

function openEditModal(expense) {
  hideEditError();
  editExpenseId.value = expense.id;
  editSupplierName.value = expense.supplier_name;
  editAmount.value = expense.amount;
  editExpenseDate.value = expense.expense_date;
  editExpenseDate.max = new Date().toISOString().slice(0, 10);
  editStatusDisplay.value = expense.status;
  editDocumentType.value = '';
  editFilePath.value = '';
  editModal.classList.remove('hidden');
}

function closeEditModal() {
  editModal.classList.add('hidden');
  editForm.reset();
  hideEditError();
}

editModal?.querySelectorAll('[data-close-modal]').forEach((el) => {
  el.addEventListener('click', closeEditModal);
});

editForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideEditError();

  const expenseId = editExpenseId.value;
  const expenseDate = editExpenseDate.value?.trim();
  const today = new Date().toISOString().slice(0, 10);
  if (expenseDate && expenseDate > today) {
    showEditError('תאריך הוצאה לא יכול להיות בעתיד.');
    return;
  }

  if (editFilePath.files.length > 0 && !editDocumentType.value) {
    showEditError('יש לבחור סוג מסמך בעת העלאת קובץ.');
    return;
  }

  const submitBtn = editForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const formData = new FormData(editForm);
    formData.delete('expense_id');

    const res = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}`, {
      method: 'PUT',
      headers: { Accept: 'application/json' },
      body: formData,
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || 'שגיאה בעדכון ההוצאה');
    }

    closeEditModal();
    const filters = resolveFiltersForQuery(getFiltersFromUrl());
    await loadExpenses(filters);
    showToast(data.message || 'ההוצאה עודכנה בהצלחה.');
  } catch (err) {
    showEditError(err.message || 'שגיאת רשת');
  } finally {
    submitBtn.disabled = false;
  }
});

invoicesTbody.addEventListener('click', (e) => {
  const editBtn = e.target.closest('.btn-edit');
  if (editBtn) {
    const expenseId = Number(editBtn.dataset.expenseId);
    const expense = cachedExpenses.find((row) => row.id === expenseId);
    if (expense) {
      openEditModal(expense);
    }
    return;
  }

  const deleteBtn = e.target.closest('.btn-delete');
  if (!deleteBtn) return;
  const expenseId = deleteBtn.dataset.expenseId;
  if (expenseId) {
    deleteExpenseById(expenseId, deleteBtn);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  setExpenseDateMaxToday();
  const filters = resolveFiltersForQuery(getFiltersFromUrl());
  applyFiltersToForm(filters);
  syncUrlWithFilters(filters);
  loadExpenses(filters).catch((err) => {
    invoicesTbody.innerHTML = `<tr><td colspan="7" class="empty">${escapeHtml(err.message)}</td></tr>`;
  });
});
