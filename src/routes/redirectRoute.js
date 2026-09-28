const express = require('express');
const urlController = require('../controllers/urlController');

const router = express.Router();

// Short codes are nanoid(7) from a URL-safe alphabet (A-Za-z0-9_-).
// Constraining the param pattern keeps obviously-invalid codes (and
// anything path-traversal-shaped) from ever reaching the lookup.
router.get('/:shortCode([A-Za-z0-9_-]{1,32})', urlController.redirectToOriginal);

module.exports = router;
