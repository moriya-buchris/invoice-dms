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

module.exports = {
  getExpenses,
  addExpense,
};
