const uuid = require('uuid');

module.exports = (client) => {
    return {
        client,
        acquireLock(lockName, acquireTimeout = 10) {
            let identifier = uuid.v4();
            return new Promise(resolve => {
                lockName = 'lock:' + lockName;
                this.client.setnx(lockName, identifier, (err, res) => {
                    if (res) {
                        this.client.expire(lockName, acquireTimeout);
                        return resolve(identifier);
                    }
                    return resolve(false);
                });
            });
        },
        releaseLock(lockName, identifier) {
            lockName = 'lock:' + lockName;
            this.client.get(lockName, (err, res) => {
                if (res === identifier) {
                    this.client.multi()
                        .del(lockName)
                        .exec();
                }
            });
        }
    }
};