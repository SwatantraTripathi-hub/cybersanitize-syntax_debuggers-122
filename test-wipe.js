const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { WipeEngine } = require('./out/main/index.js'); // Not exported directly, but maybe we can just require the compiled js.
