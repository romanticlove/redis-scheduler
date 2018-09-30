const ENV = process.ENV || 'local';
const config = require('./config/' + ENV);

const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const redisScheduler = require('./components/scheduler');

routes = require('./routes')(app);

app.use(bodyParser.json());
app.use('/', routes);


let scheduler = new redisScheduler(config.redis, () => {
    app.listen(config.port, () => {
        app.set('scheduler', scheduler);
        console.log('App listening on port 3000!');
    });
});