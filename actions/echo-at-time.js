const moment = require('moment');

const action = async (app, req, res) => {
    try {
        let {message, time} = req.body;
        if(!moment(time, moment.ISO_8601).isValid())
            throw new Error('Time must be an ISO_8601 format date string');

        if(!message || typeof message !== 'string')
            throw new Error('Message must be not empty string');

        return res.send({success: await app.get('scheduler').scheduleTask(message, time)});
    } catch (err) {
        res.send({error: err.message});
    }
};

module.exports = action;