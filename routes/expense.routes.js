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

module.exports = router;
