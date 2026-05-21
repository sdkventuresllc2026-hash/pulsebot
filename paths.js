/**
 * Data directory — use PULSE_DATA_DIR on Railway (volume mount) so logs survive redeploys.
 */
const fs = require('fs');
const path = require('path');

const APP_ROOT = __dirname;

function getPulseDataDir() {
  const custom = process.env.PULSE_DATA_DIR?.trim();
  if (custom) {
    const resolved = path.resolve(custom);
    fs.mkdirSync(resolved, { recursive: true });
    return resolved;
  }
  return APP_ROOT;
}

function dataPath(filename) {
  return path.join(getPulseDataDir(), filename);
}

module.exports = {
  APP_ROOT,
  getPulseDataDir,
  dataPath,
};
