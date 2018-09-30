const express = require('express');
const echoAtTimeAction = require('./actions/echo-at-time');

module.exports = (app) => {
    const router = express.Router();

    router.route('/echo-at-time').post((req,res) => echoAtTimeAction(app, req, res));

    return router;
};