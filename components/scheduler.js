const DEBUG = true;
const uuid = require('uuid');
const redis = require("redis");
const transactions = require('./redis-transaction');
const events = require('events');
const MAX_SLEEP_TIMEOUT = 10 * 24 * 60 * 60 * 1000;

const SCHEDULER_SET = 'delayed:Scheduler';

let timer = null;
let queueInProgress = false;

class Scheduler {
    /**
     * @param connection
     * @param onReadyCallback
     */
    constructor(connection = {}, onReadyCallback) {
        this._singleInstanceProtection();

        this.client = redis.createClient(connection);
        this.emitter = new events.EventEmitter();
        this.t = transactions(this.client);

        this._subscribeOnEvents(onReadyCallback);
    }

    /**
     * Trying to find closest item and setup timer
     */
    setupTimer(attempt = 0) {
        try {
            this.client.zrangebyscore([SCHEDULER_SET, 0, "+inf", 'withscores', 'LIMIT', 0, 1], async (err, item) => {
                if (!item || !item.length) {
                    if (DEBUG)
                        console.log('DEBUG: There are no items in delayed queue. Sleep');

                    return true;
                }

                let now = (new Date()).getTime();
                let executionTs = parseInt(item[1]);
                if (executionTs <= now) {
                    if (DEBUG)
                        console.log('DEBUG: Expired items already exists');

                    return this.pollQueue();
                }

                let executionTimeout = executionTs - now;

                if (executionTimeout > MAX_SLEEP_TIMEOUT)
                    executionTimeout = MAX_SLEEP_TIMEOUT;

                clearTimeout(timer);
                timer = setTimeout(() => this.pollQueue(), executionTimeout);

                if (DEBUG)
                    console.log('DEBUG: Next execution will be ' + (new Date(now + executionTimeout)).toISOString());
            });
        } catch (err) {
            console.log(err);
            if(attempt < 10)
                return this.setupTimer(++attempt);

            if(DEBUG)
                console.log('DEBUG: It\'s time to panic')
        }
    }

    /**
     * Execution of expired tasks
     * @param offset
     * @returns {*}
     */
    pollQueue(offset = 0) {
        console.log('DEBUG: Start polling queue');
        queueInProgress = true;
        clearTimeout(timer);
        try {
            const count = 1;
            const min = 0;
            const max = (new Date()).getTime();

            this.client.zrangebyscore([SCHEDULER_SET, min, max, 'withscores', 'LIMIT', offset, count], async (err, item) => {
                try {
                    if (err)
                        return this.emitter.emit('pollingError', err);

                    if (!item || !item.length) {
                        queueInProgress = false;
                        console.log('DEBUG: No items in queue');
                        return this.emitter.emit('setupTimer');
                    }

                    let [identifier, message] = JSON.parse(item[0]);
                    let successfullyLocked = await this.t.acquireLock(identifier);

                    if (!successfullyLocked) {
                        console.log('DEBUG: Item locked by another instance');
                        return this.pollQueue(++offset);
                    }

                    let t = this.client.multi().zrem(SCHEDULER_SET, item[0]);

                    try {
                        console.log('DEBUG: Item found. Trying to write in console');
                        await this.onItemTimeReached(message, item[1]);
                        t.exec();
                    } catch (err) {
                        console.log('DEBUG: Impossible to write in console. Rollback');
                        t.discard();
                    }

                    this.t.releaseLock(identifier, successfullyLocked);
                    return this.pollQueue();
                } catch (err) {
                    return this.emitter.emit('pollingError', err);
                }
            });
        } catch (err) {
            return this.emitter.emit('pollingError', err);
        }
    }

    /**
     * Task scheduling
     * @param message
     * @param dateTime
     * @returns {Promise<any>}
     */
    scheduleTask(message, dateTime) {
        return new Promise((resolve, reject) => {
            let ts = new Date(dateTime).getTime();
            let identifier = uuid.v4();

            let data = JSON.stringify([identifier, message]);

            this.client.zadd(SCHEDULER_SET, ts, data, (err) => {
                if (err && typeof onError === 'function') {
                    return reject(err);
                }

                console.log('DEBUG: Task successfully scheduled. Enabling timer');
                this.emitter.emit('setupTimer');
                return resolve(true)
            });
        })
    }

    /**
     * Callback on emitet task
     * @param message
     * @param ts
     * @returns {Promise<any>}
     */
    onItemTimeReached(message, ts) {
        console.log('DEBUG: Callback execution');
        return new Promise(resolve => {
            console.log((new Date(parseInt(ts))).toISOString() + ': ' + message);
            return resolve();
        })
    };

    /**
     * Events listener
     * @param onReadyCallback
     * @private
     */
    _subscribeOnEvents(onReadyCallback) {
        this.emitter.on('pollingError', (err) => {
            queueInProgress = false;
            console.log('DEBUG: Error during polling', err);
            this.emitter.emit('setupTimer');
        });

        this.emitter.on('setupTimer', () => {
            if (!queueInProgress) {
                this.setupTimer();
            }
        });

        this.client.on("ready", () => {
            this.setupTimer();
            onReadyCallback();
        });

        this.client.on("error", (err) => {
            console.log("DEBUG: " + err);
            this.setupTimer();
        });
    }

    _singleInstanceProtection() {
        if (Scheduler._instance) {
            throw new Error('Scheduler already has an instance!');
        }
        Scheduler._instance = this;
    }
}

module.exports = Scheduler;