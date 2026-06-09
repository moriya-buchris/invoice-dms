const AppError = require('../errors/AppError');
const GoogleAuthRequiredError = require('../errors/GoogleAuthRequiredError');

function wantsJsonResponse(req) {
  if (req.path.startsWith('/oauth')) {
    return false;
  }

  if (req.path.startsWith('/api/')) {
    return true;
  }

  if (
    req.method === 'GET' &&
    (req.path === '/get-expenses' || req.path === '/get-invoices')
  ) {
    return true;
  }

  const accept = req.get('Accept') || '';
  return accept.includes('application/json');
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = err.statusCode || 500;
  let message = err.message || 'שגיאה פנימית בשרת.';

  if (err instanceof GoogleAuthRequiredError) {
    statusCode = 401;
    console.log('\n========== GOOGLE OAUTH REQUIRED ==========');
    console.log(err.authUrl);
    console.log('Visit: http://localhost:3000/oauth/start');
    console.log('===========================================\n');
    message =
      'נדרשת הרשאת Google (Drive + Sheets).\n' +
      'פתח http://localhost:3000/oauth/start בדפדפן, אשר, והעתק את ה-token מהמסוף ל-.env.\n\n' +
      err.authUrl;
  } else if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    statusCode = 409;
    message = 'מסמך מסוג זה כבר קיים עבור העסקה.';
  } else if (!(err instanceof AppError) || !err.isOperational) {
    console.error(`Error [${req.method} ${req.path}]:`, err);
    if (statusCode === 500 && req.method === 'POST') {
      message = message || 'שגיאה פנימית בשרת בעת שמירת ההוצאה.';
    }
  }

  if (wantsJsonResponse(req)) {
    return res.status(statusCode).json({
      error: message,
      code: err.code || 'INTERNAL_ERROR',
    });
  }

  return res.status(statusCode).send(message);
}

module.exports = errorHandler;
