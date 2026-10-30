const fs = require('node:fs');
const path = require('node:path');
const assets = require('./public-assets.cjs');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'dist');
// Remove the output path itself so a stale symlink cannot redirect cleanup elsewhere.
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
for (const file of assets) fs.copyFileSync(path.join(root, file), path.join(destination, file));
console.log(`Built ${assets.length} public assets into dist/`);
