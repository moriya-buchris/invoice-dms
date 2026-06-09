const expenseService = require('../services/expense.service');

async function getExpenses(req, res) {
  res.json(expenseService.listExpenses(req.query));
}

async function addExpense(req, res) {
  const { scenario, expense, webViewLink } = await expenseService.createExpenseWithDocument(
    req.body,
    req.file || null
  );

  console.log(
    `Expense saved — scenario ${scenario}, expense #${expense.id}` +
      (webViewLink ? `, Drive: ${webViewLink}` : ', no file uploaded')
  );

  res.redirect('/');
}

async function deleteExpense(req, res) {
  const result = await expenseService.deleteExpenseWorkflow(req.params.id);
  res.json({
    success: true,
    message: 'ההוצאה נמחקה בהצלחה.',
    ...result,
  });
}

async function updateExpense(req, res) {
  const result = await expenseService.updateExpenseWorkflow(
    req.params.id,
    req.body,
    req.file || null
  );

  res.json({
    success: true,
    message: 'ההוצאה עודכנה בהצלחה.',
    ...result,
  });
}

module.exports = {
  getExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
};
