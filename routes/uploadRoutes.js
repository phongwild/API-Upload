const catchAsync = require('../utils/catchAsync');
const upload = require('../controllers/uploadControllers');
const router = require('express').Router();

router.route('/sendmedia')
    .post(upload.sendMedia);



module.exports = router;