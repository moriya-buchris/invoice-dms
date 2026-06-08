const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const oauthController = require('../controllers/oauth.controller');

const router = express.Router();

router.get('/oauth/start', asyncHandler(oauthController.startOAuth));
router.get('/oauth/callback', asyncHandler(oauthController.handleOAuthCallback));

module.exports = router;
