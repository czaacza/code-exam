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

process.on('exit', () => {
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
});

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

test('calculateLevel: 0 XP = level 1 Newcomer', () => {
  const result = store.calculateLevel(0);
  assert.strictEqual(result.level, 1);
  assert.strictEqual(result.title, 'Newcomer');
});

test('calculateLevel: 499 XP = level 4 Newcomer', () => {
  const result = store.calculateLevel(499);
  assert.strictEqual(result.level, 4);
  assert.strictEqual(result.title, 'Newcomer');
});

test('calculateLevel: 500 XP = level 5 Apprentice', () => {
  const result = store.calculateLevel(500);
  assert.strictEqual(result.level, 5);
  assert.strictEqual(result.title, 'Apprentice');
});

test('calculateLevel: 2000 XP = level 10 Specialist', () => {
  const result = store.calculateLevel(2000);
  assert.strictEqual(result.level, 10);
  assert.strictEqual(result.title, 'Specialist');
});

test('calculateLevel: 12000 XP = level 20 Architect', () => {
  const result = store.calculateLevel(12000);
  assert.strictEqual(result.level, 20);
  assert.strictEqual(result.title, 'Architect');
});

test('calculateXP: 2 correct medium answers + perfect = 150 XP', () => {
  const questions = [
    { difficulty: 'medium', correct: true },
    { difficulty: 'medium', correct: true },
  ];
  // 25 + 25 + 100 perfect bonus = 150
  const xp = store.calculateXP(questions, 1.0, false, false);
  assert.strictEqual(xp, 150);
});

test('calculateXP: new module adds 50 XP bonus', () => {
  const questions = [{ difficulty: 'easy', correct: true }];
  // 10 + 100 perfect + 50 new module = 160
  const xp = store.calculateXP(questions, 1.0, true, false);
  assert.strictEqual(xp, 160);
});

test('calculateXP: streak day adds 20 XP', () => {
  const questions = [{ difficulty: 'easy', correct: false }];
  // 0 + 20 streak = 20
  const xp = store.calculateXP(questions, 0.0, false, true);
  assert.strictEqual(xp, 20);
});
