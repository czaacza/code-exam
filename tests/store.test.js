'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Use a temp dir so tests never touch ~/.codeprobe
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codeprobe-test-'));
process.env.HOME = tmpHome;

// Import after setting HOME so DIR resolves to tmpHome
const store = require('../scripts/store.js');

test('ensureDir creates ~/.codeprobe directory', () => {
  store.ensureDir();
  assert.ok(fs.existsSync(path.join(tmpHome, '.codeprobe')));
});

test('readQueue returns empty array when file does not exist', () => {
  const queue = store.readQueue();
  assert.deepStrictEqual(queue, []);
});

test('writeQueue and readQueue round-trip', () => {
  store.writeQueue(['src/foo.ts', 'src/bar.ts']);
  const queue = store.readQueue();
  assert.deepStrictEqual(queue, ['src/foo.ts', 'src/bar.ts']);
});

test('clearQueue empties the queue', () => {
  store.writeQueue(['src/foo.ts']);
  store.clearQueue();
  assert.deepStrictEqual(store.readQueue(), []);
});

test('addToQueue deduplicates entries', () => {
  store.clearQueue();
  store.addToQueue('src/foo.ts');
  store.addToQueue('src/foo.ts');
  store.addToQueue('src/bar.ts');
  assert.deepStrictEqual(store.readQueue(), ['src/foo.ts', 'src/bar.ts']);
});
