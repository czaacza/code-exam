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

test('updateStreak: first quiz ever starts streak at 1', () => {
  const stats = { streak: 0, longestStreak: 0, lastQuizDate: null };
  const result = store.updateStreak(stats, '2026-04-14');
  assert.strictEqual(result.streak, 1);
  assert.strictEqual(result.longestStreak, 1);
});

test('updateStreak: quiz on same day keeps streak unchanged', () => {
  const stats = { streak: 3, longestStreak: 5, lastQuizDate: '2026-04-14' };
  const result = store.updateStreak(stats, '2026-04-14');
  assert.strictEqual(result.streak, 3);
  assert.strictEqual(result.longestStreak, 5);
});

test('updateStreak: quiz on consecutive day increments streak', () => {
  const stats = { streak: 3, longestStreak: 5, lastQuizDate: '2026-04-13' };
  const result = store.updateStreak(stats, '2026-04-14');
  assert.strictEqual(result.streak, 4);
  assert.strictEqual(result.longestStreak, 5);
});

test('updateStreak: new streak beats longestStreak', () => {
  const stats = { streak: 5, longestStreak: 5, lastQuizDate: '2026-04-13' };
  const result = store.updateStreak(stats, '2026-04-14');
  assert.strictEqual(result.streak, 6);
  assert.strictEqual(result.longestStreak, 6);
});

test('updateStreak: gap of 2+ days resets streak to 1', () => {
  const stats = { streak: 10, longestStreak: 10, lastQuizDate: '2026-04-10' };
  const result = store.updateStreak(stats, '2026-04-14');
  assert.strictEqual(result.streak, 1);
  assert.strictEqual(result.longestStreak, 10);
});

test('readStats: returns default stats when file does not exist', () => {
  // Use a sub-directory to guarantee no stats.json exists
  const freshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codeprobe-fresh-'));
  const origDir = path.join(tmpHome, '.codeprobe', 'stats.json');
  // Delete stats.json if it exists from previous tests
  if (fs.existsSync(origDir)) fs.unlinkSync(origDir);

  const stats = store.readStats();
  assert.strictEqual(stats.xp, 0);
  assert.strictEqual(stats.level, 1);
  assert.strictEqual(stats.levelTitle, 'Newcomer');
  assert.strictEqual(stats.streak, 0);
  assert.strictEqual(stats.totalQuizzes, 0);
  assert.deepStrictEqual(stats.moduleStats, {});
  fs.rmSync(freshHome, { recursive: true, force: true });
});

test('recordResult: appends to scores.jsonl and updates stats.json', () => {
  // Clear any prior state
  const cpDir = path.join(tmpHome, '.codeprobe');
  const statsFile = path.join(cpDir, 'stats.json');
  const scoresFile = path.join(cpDir, 'scores.jsonl');
  if (fs.existsSync(statsFile)) fs.unlinkSync(statsFile);
  if (fs.existsSync(scoresFile)) fs.unlinkSync(scoresFile);

  const result = {
    module: 'src/payments',
    score: 0.8,
    correct: 4,
    durationSeconds: 90,
    questions: [
      { difficulty: 'medium', correct: true },
      { difficulty: 'medium', correct: true },
      { difficulty: 'hard', correct: true },
      { difficulty: 'hard', correct: true },
      { difficulty: 'easy', correct: false },
    ],
  };

  const output = store.recordResult(JSON.stringify(result));
  const parsed = JSON.parse(output);

  assert.ok(parsed.xpEarned > 0, 'xpEarned should be positive');
  assert.strictEqual(parsed.totalQuizzes, 1);
  assert.ok(parsed.moduleStats['src/payments'], 'moduleStats should have src/payments');
  assert.strictEqual(parsed.moduleStats['src/payments'].quizzes, 1);

  // Verify scores.jsonl has one line
  const lines = fs.readFileSync(scoresFile, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 1);
  const scored = JSON.parse(lines[0]);
  assert.strictEqual(scored.module, 'src/payments');
  assert.ok(scored.id, 'should have an id');
  assert.ok(scored.ts, 'should have a timestamp');
});

test('recordResult: second quiz on same module increments moduleStats', () => {
  const result = {
    module: 'src/payments',
    score: 1.0,
    correct: 5,
    durationSeconds: 55,
    questions: [
      { difficulty: 'medium', correct: true },
      { difficulty: 'medium', correct: true },
      { difficulty: 'hard', correct: true },
      { difficulty: 'hard', correct: true },
      { difficulty: 'easy', correct: true },
    ],
  };

  store.recordResult(JSON.stringify(result));
  const stats = store.readStats();
  assert.strictEqual(stats.moduleStats['src/payments'].quizzes, 2);
  assert.strictEqual(stats.totalQuizzes, 2);
});

test('computeAchievements: First Blood earned after 1 quiz', () => {
  const scores = [{ score: 0.6, module: 'src/a', questions: [], durationSeconds: 100 }];
  const stats = { longestStreak: 1, totalQuizzes: 1 };
  const result = store.computeAchievements(scores, stats);
  assert.ok(result.earned.some(b => b.id === 'first-blood'));
});

test('computeAchievements: Perfect Run earned when score is 1.0', () => {
  const scores = [{ score: 1.0, module: 'src/a', questions: [], durationSeconds: 100 }];
  const stats = { longestStreak: 1, totalQuizzes: 1 };
  const result = store.computeAchievements(scores, stats);
  assert.ok(result.earned.some(b => b.id === 'perfect-run'));
});

test('computeAchievements: Module Master earned after 3 quizzes >= 0.8 on same module', () => {
  const scores = [
    { score: 0.8, module: 'src/auth', questions: [], durationSeconds: 100 },
    { score: 0.9, module: 'src/auth', questions: [], durationSeconds: 100 },
    { score: 1.0, module: 'src/auth', questions: [], durationSeconds: 100 },
  ];
  const stats = { longestStreak: 1, totalQuizzes: 3 };
  const result = store.computeAchievements(scores, stats);
  assert.ok(result.earned.some(b => b.id === 'module-master'));
});

test('computeAchievements: Explorer earned after quizzing on 5 different modules', () => {
  const scores = ['src/a','src/b','src/c','src/d','src/e'].map(m => ({
    score: 0.5, module: m, questions: [], durationSeconds: 100
  }));
  const stats = { longestStreak: 1, totalQuizzes: 5 };
  const result = store.computeAchievements(scores, stats);
  assert.ok(result.earned.some(b => b.id === 'explorer'));
});

test('computeAchievements: Speed Demon earned with perfect score under 60s', () => {
  const scores = [{ score: 1.0, module: 'src/a', questions: [], durationSeconds: 55 }];
  const stats = { longestStreak: 1, totalQuizzes: 1 };
  const result = store.computeAchievements(scores, stats);
  assert.ok(result.earned.some(b => b.id === 'speed-demon'));
});

test('computeAchievements: unearned badges appear in locked list', () => {
  const scores = [];
  const stats = { longestStreak: 0, totalQuizzes: 0 };
  const result = store.computeAchievements(scores, stats);
  assert.strictEqual(result.earned.length, 0);
  assert.ok(result.locked.length > 0);
});
