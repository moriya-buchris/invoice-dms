const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const upload = require('../middleware/upload.middleware');
const expenseController = require('../controllers/expense.controller');

const router = express.Router();

router.get('/get-expenses', asyncHandler(expenseController.getExpenses));
router.get('/get-invoices', asyncHandler(expenseController.getExpenses));
router.post(
  '/add-invoice',
  upload.single('file_path'),
  asyncHandler(expenseController.addExpense)
);
router.put(
  '/api/expenses/:id',
  upload.single('file_path'),
  asyncHandler(expenseController.updateExpense)
);
router.delete('/api/expenses/:id', asyncHandler(expenseController.deleteExpense));

module.exports = router;
