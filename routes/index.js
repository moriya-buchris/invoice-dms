const express = require('express');
const oauthRoutes = require('./oauth.routes');
const expenseRoutes = require('./expense.routes');

const router = express.Router();

router.use(oauthRoutes);
router.use(expenseRoutes);

module.exports = router;
