require('dotenv').config();

const express = require('express');
const path = require('path');
const invoiceRoutes = require('./routes/invoiceRoutes');
const { MAIN_FOLDER_ID } = require('./services/googleDriveService');

const app = express();
const PORT = 3000;

app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    return next();
  }
  express.urlencoded({ extended: true })(req, res, next);
});

app.use(invoiceRoutes);
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
  console.log('Auth: OAuth2 (refresh token)');
  console.log(`Drive main folder: ${MAIN_FOLDER_ID}`);
});
