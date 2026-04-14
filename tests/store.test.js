'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Use a temp dir so tests never touch ~/.code-exam
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'code-exam-test-'));
process.env.HOME = tmpHome;

// Import after setting HOME so DIR resolves to tmpHome
const store = require('../scripts/store.js');

process.on('exit', () => {
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
});

// === Queue operations ===

test('ensureDir creates ~/.code-exam directory', () => {
  store.ensureDir();
  assert.ok(fs.existsSync(path.join(tmpHome, '.code-exam')));
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

// === Grade calculation ===

test('calculateGrade: 100% = A, 4.0 GPA', () => {
  const result = store.calculateGrade(1.0);
  assert.strictEqual(result.grade, 'A');
  assert.strictEqual(result.gpa, 4.0);
  assert.strictEqual(result.pct, 100);
});

test('calculateGrade: 90% = A', () => {
  const result = store.calculateGrade(0.9);
  assert.strictEqual(result.grade, 'A');
  assert.strictEqual(result.gpa, 4.0);
});

test('calculateGrade: 80% = B, 3.0 GPA', () => {
  const result = store.calculateGrade(0.8);
  assert.strictEqual(result.grade, 'B');
  assert.strictEqual(result.gpa, 3.0);
});

test('calculateGrade: 70% = C, 2.0 GPA', () => {
  const result = store.calculateGrade(0.7);
  assert.strictEqual(result.grade, 'C');
  assert.strictEqual(result.gpa, 2.0);
});

test('calculateGrade: 60% = D, 1.0 GPA', () => {
  const result = store.calculateGrade(0.6);
  assert.strictEqual(result.grade, 'D');
  assert.strictEqual(result.gpa, 1.0);
});

test('calculateGrade: 40% = F, 0.0 GPA', () => {
  const result = store.calculateGrade(0.4);
  assert.strictEqual(result.grade, 'F');
  assert.strictEqual(result.gpa, 0.0);
});

// === GPA calculation ===

test('calculateGPA: empty grades = 0.0', () => {
  assert.strictEqual(store.calculateGPA([]), 0.0);
});

test('calculateGPA: average of [4.0, 3.0] = 3.5', () => {
  assert.strictEqual(store.calculateGPA([4.0, 3.0]), 3.5);
});

test('calculateGPA: average of [4.0, 4.0, 0.0] = 2.67', () => {
  assert.strictEqual(store.calculateGPA([4.0, 4.0, 0.0]), 2.67);
});

// === Streak ===

test('updateStreak: first exam ever starts streak at 1', () => {
  const stats = { streak: 0, longestStreak: 0, lastExamDate: null };
  const result = store.updateStreak(stats, '2026-04-14');
  assert.strictEqual(result.streak, 1);
  assert.strictEqual(result.longestStreak, 1);
});

test('updateStreak: exam on same day keeps streak unchanged', () => {
  const stats = { streak: 3, longestStreak: 5, lastExamDate: '2026-04-14' };
  const result = store.updateStreak(stats, '2026-04-14');
  assert.strictEqual(result.streak, 3);
  assert.strictEqual(result.longestStreak, 5);
});

test('updateStreak: exam on consecutive day increments streak', () => {
  const stats = { streak: 3, longestStreak: 5, lastExamDate: '2026-04-13' };
  const result = store.updateStreak(stats, '2026-04-14');
  assert.strictEqual(result.streak, 4);
  assert.strictEqual(result.longestStreak, 5);
});

test('updateStreak: new streak beats longestStreak', () => {
  const stats = { streak: 5, longestStreak: 5, lastExamDate: '2026-04-13' };
  const result = store.updateStreak(stats, '2026-04-14');
  assert.strictEqual(result.streak, 6);
  assert.strictEqual(result.longestStreak, 6);
});

test('updateStreak: gap of 2+ days resets streak to 1', () => {
  const stats = { streak: 10, longestStreak: 10, lastExamDate: '2026-04-10' };
  const result = store.updateStreak(stats, '2026-04-14');
  assert.strictEqual(result.streak, 1);
  assert.strictEqual(result.longestStreak, 10);
});

// === Stats ===

test('readStats: returns default stats when file does not exist', () => {
  const statsFile = path.join(tmpHome, '.code-exam', 'stats.json');
  if (fs.existsSync(statsFile)) fs.unlinkSync(statsFile);

  const stats = store.readStats();
  assert.strictEqual(stats.gpa, 0.0);
  assert.strictEqual(stats.streak, 0);
  assert.strictEqual(stats.totalExams, 0);
  assert.deepStrictEqual(stats.moduleStats, {});
  assert.deepStrictEqual(stats.allGrades, []);
  assert.deepStrictEqual(stats.examinedFiles, []);
});

// === Record result ===

test('recordResult: records exam with grade B for 80% score', () => {
  const cpDir = path.join(tmpHome, '.code-exam');
  const statsFile = path.join(cpDir, 'stats.json');
  const scoresFile = path.join(cpDir, 'scores.jsonl');
  if (fs.existsSync(statsFile)) fs.unlinkSync(statsFile);
  if (fs.existsSync(scoresFile)) fs.unlinkSync(scoresFile);

  const result = {
    module: 'src/payments',
    score: 0.8,
    correct: 4,
    durationSeconds: 90,
    files: ['src/payments/refund.ts', 'src/payments/types.ts'],
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

  assert.strictEqual(parsed.grade, 'B');
  assert.strictEqual(parsed.gpa, 3.0);
  assert.strictEqual(parsed.totalExams, 1);
  assert.ok(parsed.moduleStats['src/payments']);
  assert.strictEqual(parsed.moduleStats['src/payments'].exams, 1);
  assert.ok(parsed.moduleStats['src/payments'].lastExamDate);
  assert.deepStrictEqual(parsed.moduleStats['src/payments'].examinedFiles, ['src/payments/refund.ts', 'src/payments/types.ts']);
  assert.deepStrictEqual(parsed.examinedFiles, ['src/payments/refund.ts', 'src/payments/types.ts']);

  // Verify scores.jsonl
  const lines = fs.readFileSync(scoresFile, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 1);
  const scored = JSON.parse(lines[0]);
  assert.strictEqual(scored.grade, 'B');
});

test('recordResult: second exam updates GPA correctly', () => {
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

  const output = store.recordResult(JSON.stringify(result));
  const parsed = JSON.parse(output);
  assert.strictEqual(parsed.grade, 'A');
  assert.strictEqual(parsed.totalExams, 2);
  assert.strictEqual(parsed.gpa, 3.5); // (3.0 + 4.0) / 2
  assert.strictEqual(parsed.moduleStats['src/payments'].exams, 2);
});

test('recordResult: tracks examined files and deduplicates across exams', () => {
  const result = {
    module: 'src/payments',
    score: 0.6,
    correct: 3,
    durationSeconds: 120,
    files: ['src/payments/refund.ts', 'src/payments/index.ts'],
    questions: [
      { difficulty: 'easy', correct: true },
      { difficulty: 'easy', correct: true },
      { difficulty: 'easy', correct: true },
      { difficulty: 'medium', correct: false },
      { difficulty: 'medium', correct: false },
    ],
  };

  store.recordResult(JSON.stringify(result));
  const stats = store.readStats();
  // refund.ts was in both exams — should not be duplicated
  const paymentFiles = stats.moduleStats['src/payments'].examinedFiles;
  assert.ok(paymentFiles.includes('src/payments/refund.ts'));
  assert.ok(paymentFiles.includes('src/payments/types.ts'));
  assert.ok(paymentFiles.includes('src/payments/index.ts'));
  assert.strictEqual(paymentFiles.filter(f => f === 'src/payments/refund.ts').length, 1);
});

// === Achievements ===

test('computeAchievements: Enrolled earned after 1 exam', () => {
  const scores = [{ score: 0.6, module: 'src/a', questions: [], durationSeconds: 100 }];
  const stats = { longestStreak: 1 };
  const result = store.computeAchievements(scores, stats);
  assert.ok(result.earned.some(b => b.id === 'enrolled'));
});

test('computeAchievements: Straight A earned when score >= 0.9', () => {
  const scores = [{ score: 0.9, module: 'src/a', questions: [], durationSeconds: 100 }];
  const stats = { longestStreak: 1 };
  const result = store.computeAchievements(scores, stats);
  assert.ok(result.earned.some(b => b.id === 'straight-a'));
});

test('computeAchievements: Honors Student earned after 3 A grades on same module', () => {
  const scores = [
    { score: 0.9, module: 'src/auth', questions: [], durationSeconds: 100 },
    { score: 0.95, module: 'src/auth', questions: [], durationSeconds: 100 },
    { score: 1.0, module: 'src/auth', questions: [], durationSeconds: 100 },
  ];
  const stats = { longestStreak: 1 };
  const result = store.computeAchievements(scores, stats);
  assert.ok(result.earned.some(b => b.id === 'honors'));
});

test('computeAchievements: Explorer earned after exams on 5 different modules', () => {
  const scores = ['src/a','src/b','src/c','src/d','src/e'].map(m => ({
    score: 0.5, module: m, questions: [], durationSeconds: 100
  }));
  const stats = { longestStreak: 1 };
  const result = store.computeAchievements(scores, stats);
  assert.ok(result.earned.some(b => b.id === 'explorer'));
});

test('computeAchievements: Speed Demon earned with perfect score under 60s', () => {
  const scores = [{ score: 1.0, module: 'src/a', questions: [], durationSeconds: 55 }];
  const stats = { longestStreak: 1 };
  const result = store.computeAchievements(scores, stats);
  assert.ok(result.earned.some(b => b.id === 'speed-demon'));
});

test('computeAchievements: unearned badges appear in locked list', () => {
  const scores = [];
  const stats = { longestStreak: 0 };
  const result = store.computeAchievements(scores, stats);
  assert.strictEqual(result.earned.length, 0);
  assert.ok(result.locked.length > 0);
});
