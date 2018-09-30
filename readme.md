## Installation
* redis-server should be installed
* npm install
* copy and rename config/local.example.js to your process.ENV name (local by Default)
* set up redis configuration
* change (if needed) application port (3000 by default)
* npm start - for launch application

## Usage
POST /echo-at-time

{
	"message":"Hello world",
	"time": "2018-09-30T17:40:40.000Z"
}