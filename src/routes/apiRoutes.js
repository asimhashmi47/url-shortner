const express = require('express');
const urlController = require('../controllers/urlController');
const { writeRateLimiter, exportRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// IMPORTANT: /export must be registered before /:id so "export" is never
// parsed as an id.
router.get('/urls/export', exportRateLimiter, urlController.exportExcel);

router.post('/urls', writeRateLimiter, urlController.create);
router.get('/urls', urlController.list);
router.get('/urls/:id', urlController.getById);
router.delete('/urls/:id', writeRateLimiter, urlController.remove);
router.post('/urls/bulk', writeRateLimiter, urlController.bulkCreate);

module.exports = router;
