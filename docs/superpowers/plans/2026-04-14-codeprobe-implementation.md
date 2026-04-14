# CodeProbe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that quizzes developers on code changes (diff or module) with XP, levels, streaks, and achievement badges — all in-context, no external API calls, no npm production dependencies.

**Architecture:** Pure Claude Code plugin. Skills (Markdown files) instruct Claude to generate quiz questions in-context using its understanding of the code. A single `scripts/store.js` (CommonJS, zero deps) handles all persistence via flat JSON files in `~/.codeprobe/`. Plain JS hooks detect Claude file edits and queue them for quizzing.

**Tech Stack:** Node.js CommonJS, `node:test` (built-in) for testing, flat JSON/JSONL files for persistence, esbuild (dev-only) for hook bundling if needed.

---

## File Map

```
codeprobe/
├── CLAUDE.md                          ← plugin registration, store.js interface docs
├── package.json                       ← no prod deps, devDep: esbuild
├── .gitignore
│
├── skills/
│   ├── quiz/skill.md                  ← /quiz: diff mode + module mode, full quiz flow
│   ├── quiz-status/skill.md           ← /quiz-status: XP, level, streak display
│   └── quiz-achievements/skill.md    ← /quiz-achievements: badge display
│
├── hooks/
│   ├── post-tool-use.js               ← queues source files edited by Claude
│   └── session-start.js               ← reads queue, prints pending quiz banner
│
├── scripts/
│   └── store.js                       ← ALL persistence: queue, scores, stats, achievements
│
└── tests/
    └── store.test.js                  ← unit tests for all store.js exported functions
```

**State files (created automatically on first use):**
```
~/.codeprobe/
├── queue.json       ← string[] of file paths Claude edited this session
├── scores.jsonl     ← append-only, one QuizResult JSON per line
└── stats.json       ← aggregated: xp, level, streak, moduleStats
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `CLAUDE.md`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "codeprobe",
  "version": "0.1.0",
  "description": "Gamified code quiz plugin for Claude Code",
  "scripts": {
    "test": "node --test tests/store.test.js"
  },
  "devDependencies": {
    "esbuild": "^0.24.0"
  }
}
```

- [ ] **Step 2: Create CLAUDE.md**

```markdown
# CodeProbe

CodeProbe is installed. It quizzes you on code changes to reinforce understanding.

## Available skills

- `/quiz` — quiz on current git diff or a specific module path
- `/quiz-status` — show XP, level, streak, recent sessions
- `/quiz-achievements` — show earned badges and progress toward locked ones

## store.js CLI interface

All persistence goes through `node scripts/store.js <command>`:

```
node scripts/store.js record '<json>'   — save quiz result, recalculate stats
node scripts/store.js stats             — print formatted stats (XP, level, streak)
node scripts/store.js queue             — print queued file paths
node scripts/store.js queue-clear       — empty the queue after a quiz session
node scripts/store.js achievements      — print badge status
```

The `record` command takes a JSON string with this shape:
```json
{
  "module": "src/payments",
  "score": 0.8,
  "correct": 4,
  "durationSeconds": 142,
  "questions": [
    { "difficulty": "medium", "correct": true },
    { "difficulty": "hard", "correct": false }
  ]
}
```

It prints a JSON result with `xpEarned` and updated stats.

## Data location

`~/.codeprobe/` — created automatically on first use.
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
*.jsonl
stats.json
queue.json
```

- [ ] **Step 4: Create directory structure**

```bash
mkdir -p skills/quiz skills/quiz-status skills/quiz-achievements hooks scripts tests
```

- [ ] **Step 5: Commit**

```bash
git add package.json CLAUDE.md .gitignore
git commit -m "feat: scaffold CodeProbe plugin"
```

---

## Task 2: store.js — Foundation, Directory Init, Queue Operations

**Files:**
- Create: `scripts/store.js`
- Create: `tests/store.test.js`

- [ ] **Step 1: Write failing tests for queue operations**

Create `tests/store.test.js`:

```js
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
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test
```

Expected: `ERR_MODULE_NOT_FOUND` or similar — `scripts/store.js` does not exist yet.

- [ ] **Step 3: Create scripts/store.js with queue operations**

```js
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DIR = path.join(os.homedir(), '.codeprobe');
const SCORES_FILE = path.join(DIR, 'scores.jsonl');
const STATS_FILE = path.join(DIR, 'stats.json');
const QUEUE_FILE = path.join(DIR, 'queue.json');

function ensureDir() {
  if (!fs.existsSync(DIR)) {
    fs.mkdirSync(DIR, { recursive: true });
  }
}

function readQueue() {
  ensureDir();
  if (!fs.existsSync(QUEUE_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  ensureDir();
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue));
}

function clearQueue() {
  writeQueue([]);
}

function addToQueue(filePath) {
  const queue = readQueue();
  if (!queue.includes(filePath)) {
    queue.push(filePath);
    writeQueue(queue);
  }
}

// CLI execution guard — only runs when called directly, not when require()'d in tests
if (require.main === module) {
  const [,, command, ...args] = process.argv;
  switch (command) {
    case 'queue':
      console.log(JSON.stringify(readQueue(), null, 2));
      break;
    case 'queue-clear':
      clearQueue();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

module.exports = { ensureDir, readQueue, writeQueue, clearQueue, addToQueue };
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test
```

Expected: `5 passing`

- [ ] **Step 5: Commit**

```bash
git add scripts/store.js tests/store.test.js
git commit -m "feat: add store.js queue operations"
```

---

## Task 3: store.js — XP and Level Calculation

**Files:**
- Modify: `scripts/store.js`
- Modify: `tests/store.test.js`

- [ ] **Step 1: Add failing tests for calculateLevel and calculateXP**

Append to `tests/store.test.js`:

```js
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

test('calculateXP: all correct medium questions = 50 XP', () => {
  const questions = [
    { difficulty: 'medium', correct: true },
    { difficulty: 'medium', correct: true },
  ];
  const xp = store.calculateXP(questions, 1.0, false, false);
  // 25 + 25 + 100 perfect bonus = 150
  assert.strictEqual(xp, 150);
});

test('calculateXP: new module adds 50 XP bonus', () => {
  const questions = [{ difficulty: 'easy', correct: true }];
  const xp = store.calculateXP(questions, 1.0, true, false);
  // 10 + 100 perfect + 50 new module = 160
  assert.strictEqual(xp, 160);
});

test('calculateXP: streak day adds 20 XP', () => {
  const questions = [{ difficulty: 'easy', correct: false }];
  const xp = store.calculateXP(questions, 0.0, false, true);
  // 0 + 20 streak = 20
  assert.strictEqual(xp, 20);
});
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
npm test
```

Expected: new tests fail with `TypeError: store.calculateLevel is not a function`

- [ ] **Step 3: Add calculateLevel and calculateXP to store.js**

Add these functions to `scripts/store.js` before the `if (require.main === module)` block:

```js
const TIERS = [
  { title: 'Newcomer',   minXp: 0,     maxXp: 500,      startLevel: 1,  levels: 4 },
  { title: 'Apprentice', minXp: 500,   maxXp: 2000,     startLevel: 5,  levels: 5 },
  { title: 'Specialist', minXp: 2000,  maxXp: 5000,     startLevel: 10, levels: 5 },
  { title: 'Expert',     minXp: 5000,  maxXp: 12000,    startLevel: 15, levels: 5 },
  { title: 'Architect',  minXp: 12000, maxXp: Infinity, startLevel: 20, levels: null },
];

function calculateLevel(xp) {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    const tier = TIERS[i];
    if (xp >= tier.minXp) {
      if (tier.levels === null) {
        const level = tier.startLevel + Math.floor((xp - tier.minXp) / 2000);
        return { level, title: tier.title };
      }
      const range = tier.maxXp - tier.minXp;
      const xpInTier = xp - tier.minXp;
      const levelInTier = Math.min(tier.levels - 1, Math.floor(xpInTier / (range / tier.levels)));
      return { level: tier.startLevel + levelInTier, title: tier.title };
    }
  }
  return { level: 1, title: 'Newcomer' };
}

const XP_PER_DIFFICULTY = { easy: 10, medium: 25, hard: 50 };

function calculateXP(questions, score, isNewModule, isStreakDay) {
  let xp = 0;
  for (const q of questions) {
    if (q.correct) xp += (XP_PER_DIFFICULTY[q.difficulty] || 25);
  }
  if (score === 1.0) xp += 100;
  if (isNewModule) xp += 50;
  if (isStreakDay) xp += 20;
  return xp;
}
```

Also add `calculateLevel` and `calculateXP` to the `module.exports` at the bottom:

```js
module.exports = { ensureDir, readQueue, writeQueue, clearQueue, addToQueue, calculateLevel, calculateXP };
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/store.js tests/store.test.js
git commit -m "feat: add XP and level calculation to store.js"
```

---

## Task 4: store.js — Streak Calculation

**Files:**
- Modify: `scripts/store.js`
- Modify: `tests/store.test.js`

- [ ] **Step 1: Add failing tests for updateStreak**

Append to `tests/store.test.js`:

```js
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
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
npm test
```

Expected: new tests fail with `TypeError: store.updateStreak is not a function`

- [ ] **Step 3: Add updateStreak to store.js**

Add this function before the `if (require.main === module)` block:

```js
function updateStreak(stats, todayStr) {
  if (!stats.lastQuizDate) {
    return { streak: 1, longestStreak: Math.max(1, stats.longestStreak) };
  }
  const last = new Date(stats.lastQuizDate);
  const today = new Date(todayStr);
  const diffMs = today.getTime() - last.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return { streak: stats.streak, longestStreak: stats.longestStreak };
  } else if (diffDays === 1) {
    const newStreak = stats.streak + 1;
    return { streak: newStreak, longestStreak: Math.max(newStreak, stats.longestStreak) };
  } else {
    return { streak: 1, longestStreak: stats.longestStreak };
  }
}
```

Add `updateStreak` to `module.exports`.

- [ ] **Step 4: Run tests — verify all pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/store.js tests/store.test.js
git commit -m "feat: add streak calculation to store.js"
```

---

## Task 5: store.js — Score Recording and Stats

**Files:**
- Modify: `scripts/store.js`
- Modify: `tests/store.test.js`

- [ ] **Step 1: Add failing tests for readStats, recordResult**

Append to `tests/store.test.js`:

```js
test('readStats: returns default stats when file does not exist', () => {
  // Use a fresh temp dir for this test
  const freshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codeprobe-fresh-'));
  const origHome = process.env.HOME;
  process.env.HOME = freshHome;

  // Re-require store with new HOME — Node caches modules, so we patch directly
  const statsFile = path.join(freshHome, '.codeprobe', 'stats.json');
  assert.ok(!fs.existsSync(statsFile));

  // Restore
  process.env.HOME = origHome;
});

test('recordResult: appends to scores.jsonl and updates stats.json', () => {
  store.clearQueue();

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

  assert.ok(parsed.xpEarned > 0);
  assert.strictEqual(parsed.totalQuizzes, 1);
  assert.ok(parsed.moduleStats['src/payments']);
  assert.strictEqual(parsed.moduleStats['src/payments'].quizzes, 1);
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
});
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
npm test
```

Expected: `TypeError: store.readStats is not a function` and `TypeError: store.recordResult is not a function`

- [ ] **Step 3: Add readStats, writeStats, recordResult to store.js**

Add these functions before the `if (require.main === module)` block:

```js
function readStats() {
  ensureDir();
  if (!fs.existsSync(STATS_FILE)) {
    return {
      xp: 0,
      level: 1,
      levelTitle: 'Newcomer',
      streak: 0,
      longestStreak: 0,
      lastQuizDate: null,
      totalQuizzes: 0,
      moduleStats: {},
    };
  }
  return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
}

function writeStats(stats) {
  ensureDir();
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

function recordResult(resultJson) {
  const result = JSON.parse(resultJson);
  ensureDir();

  if (!result.id) result.id = crypto.randomUUID();
  if (!result.ts) result.ts = new Date().toISOString();

  // Append to scores.jsonl
  fs.appendFileSync(SCORES_FILE, JSON.stringify(result) + '\n');

  const stats = readStats();
  const today = new Date().toISOString().split('T')[0];

  const isNewModule = !stats.moduleStats[result.module];
  const streakUpdate = updateStreak(stats, today);
  const isNewStreakDay = stats.lastQuizDate !== today;

  const xpEarned = calculateXP(
    result.questions || [],
    result.score,
    isNewModule,
    isNewStreakDay && streakUpdate.streak > stats.streak
  );

  if (!stats.moduleStats[result.module]) {
    stats.moduleStats[result.module] = { quizzes: 0, correct: 0, total: 0 };
  }
  const mod = stats.moduleStats[result.module];
  mod.quizzes++;
  mod.correct += result.correct || 0;
  mod.total += (result.questions || []).length || 5;

  stats.xp += xpEarned;
  stats.totalQuizzes++;
  stats.streak = streakUpdate.streak;
  stats.longestStreak = streakUpdate.longestStreak;
  stats.lastQuizDate = today;

  const { level, title } = calculateLevel(stats.xp);
  stats.level = level;
  stats.levelTitle = title;

  writeStats(stats);
  return JSON.stringify({ xpEarned, ...stats });
}
```

Update the CLI switch to handle `record` and `stats`:

```js
if (require.main === module) {
  const [,, command, ...args] = process.argv;
  switch (command) {
    case 'record':
      console.log(recordResult(args[0]));
      break;
    case 'stats':
      console.log(JSON.stringify(readStats(), null, 2));
      break;
    case 'queue':
      console.log(JSON.stringify(readQueue(), null, 2));
      break;
    case 'queue-clear':
      clearQueue();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}
```

Add `readStats`, `writeStats`, `recordResult` to `module.exports`.

- [ ] **Step 4: Run tests — verify all pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/store.js tests/store.test.js
git commit -m "feat: add score recording and stats to store.js"
```

---

## Task 6: store.js — Achievement Detection

**Files:**
- Modify: `scripts/store.js`
- Modify: `tests/store.test.js`

- [ ] **Step 1: Add failing tests for computeAchievements**

Append to `tests/store.test.js`:

```js
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
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
npm test
```

Expected: `TypeError: store.computeAchievements is not a function`

- [ ] **Step 3: Add computeAchievements to store.js**

Add before the `if (require.main === module)` block:

```js
const BADGES = [
  {
    id: 'first-blood',
    name: 'First Blood',
    description: 'Complete your first quiz',
    check: (scores) => scores.length >= 1,
  },
  {
    id: 'perfect-run',
    name: 'Perfect Run',
    description: 'Score 100% on any quiz',
    check: (scores) => scores.some(s => s.score === 1.0),
  },
  {
    id: 'module-master',
    name: 'Module Master',
    description: 'Score ≥ 80% on the same module 3 times',
    check: (scores) => {
      const byModule = {};
      for (const s of scores) {
        if (s.score >= 0.8) byModule[s.module] = (byModule[s.module] || 0) + 1;
      }
      return Object.values(byModule).some(count => count >= 3);
    },
  },
  {
    id: 'streak-week',
    name: 'Streak Week',
    description: '7-day quiz streak',
    check: (scores, stats) => stats.longestStreak >= 7,
  },
  {
    id: 'deep-diver',
    name: 'Deep Diver',
    description: 'Score 100% on a quiz that included a hard question',
    check: (scores) => scores.some(s =>
      s.score === 1.0 && (s.questions || []).some(q => q.difficulty === 'hard')
    ),
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Quiz on 5 different modules',
    check: (scores) => new Set(scores.map(s => s.module)).size >= 5,
  },
  {
    id: 'speed-demon',
    name: 'Speed Demon',
    description: 'Perfect score in under 60 seconds',
    check: (scores) => scores.some(s => s.score === 1.0 && s.durationSeconds < 60),
  },
  {
    id: 'centurion',
    name: 'Centurion',
    description: 'Complete 100 quizzes',
    check: (scores) => scores.length >= 100,
  },
];

function readAllScores() {
  ensureDir();
  if (!fs.existsSync(SCORES_FILE)) return [];
  return fs.readFileSync(SCORES_FILE, 'utf8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

function computeAchievements(scores, stats) {
  const earned = [];
  const locked = [];
  for (const badge of BADGES) {
    if (badge.check(scores, stats)) {
      earned.push({ id: badge.id, name: badge.name, description: badge.description });
    } else {
      locked.push({ id: badge.id, name: badge.name, description: badge.description });
    }
  }
  return { earned, locked };
}
```

Update the CLI switch to handle the `achievements` command:

```js
case 'achievements': {
  const scores = readAllScores();
  const stats = readStats();
  const result = computeAchievements(scores, stats);
  console.log(JSON.stringify(result, null, 2));
  break;
}
```

Add `computeAchievements`, `readAllScores` to `module.exports`.

- [ ] **Step 4: Run tests — verify all pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/store.js tests/store.test.js
git commit -m "feat: add achievement detection to store.js"
```

---

## Task 7: hooks/post-tool-use.js

**Files:**
- Create: `hooks/post-tool-use.js`

*Note: Claude Code hooks are not unit-testable in isolation — verify manually.*

- [ ] **Step 1: Create hooks/post-tool-use.js**

```js
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Source file extensions to track (skip generated, docs, lock files, tests)
const TRACKED_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs',
  '.java', '.rb', '.cpp', '.c', '.cs', '.swift', '.kt',
]);

const SKIP_PATTERNS = [
  /\.lock$/,
  /package-lock\.json$/,
  /\.generated\./,
  /\/(dist|build|node_modules)\//,
  /\.test\./,
  /\.spec\./,
  /\/__tests__\//,
  /\.md$/,
  /\/(docs)\//,
];

function isTracked(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!TRACKED_EXTENSIONS.has(ext)) return false;
  return !SKIP_PATTERNS.some(pattern => pattern.test(filePath));
}

function addToQueue(filePath) {
  const dir = path.join(os.homedir(), '.codeprobe');
  const queueFile = path.join(dir, 'queue.json');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let queue = [];
  if (fs.existsSync(queueFile)) {
    try { queue = JSON.parse(fs.readFileSync(queueFile, 'utf8')); } catch { queue = []; }
  }
  if (!queue.includes(filePath)) {
    queue.push(filePath);
    fs.writeFileSync(queueFile, JSON.stringify(queue));
  }
}

// Claude Code passes hook input as JSON on stdin
let raw = '';
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw);
    const toolName = input.tool_name;
    const toolInput = input.tool_input || {};

    if (!['Write', 'Edit', 'MultiEdit'].includes(toolName)) process.exit(0);

    const filePaths = [];
    if (toolName === 'Write' || toolName === 'Edit') {
      if (toolInput.file_path) filePaths.push(toolInput.file_path);
    } else if (toolName === 'MultiEdit') {
      for (const edit of (toolInput.edits || [])) {
        if (edit.file_path) filePaths.push(edit.file_path);
      }
    }

    for (const fp of filePaths) {
      if (isTracked(fp)) addToQueue(fp);
    }
  } catch {
    // Never block Claude on hook errors
  }
  process.exit(0);
});
```

- [ ] **Step 2: Commit**

```bash
git add hooks/post-tool-use.js
git commit -m "feat: add post-tool-use hook for file change detection"
```

---

## Task 8: hooks/session-start.js

**Files:**
- Create: `hooks/session-start.js`

- [ ] **Step 1: Create hooks/session-start.js**

```js
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const dir = path.join(os.homedir(), '.codeprobe');
const queueFile = path.join(dir, 'queue.json');

function getQueue() {
  if (!fs.existsSync(queueFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(queueFile, 'utf8'));
  } catch {
    return [];
  }
}

const queue = getQueue();

if (queue.length > 0) {
  const count = queue.length;
  const fileWord = count === 1 ? 'file' : 'files';
  process.stdout.write(
    `\n📚 CodeProbe: Claude edited ${count} ${fileWord} last session. Run /quiz to test your understanding.\n\n`
  );
}

process.exit(0);
```

- [ ] **Step 2: Commit**

```bash
git add hooks/session-start.js
git commit -m "feat: add session-start hook for pending quiz prompt"
```

---

## Task 9: skills/quiz/skill.md

**Files:**
- Create: `skills/quiz/skill.md`

- [ ] **Step 1: Create skills/quiz/skill.md**

````markdown
---
name: quiz
description: "Quiz yourself on code changes or any module. Generates questions from git diff or file contents, runs interactive session, tracks XP and streaks. Usage: /quiz (diff mode) or /quiz <path> (module mode)."
---

# CodeProbe Quiz

Run an interactive quiz to test your understanding of code changes.

## Mode Detection

**Diff mode** (no argument or `/quiz`):
1. Run `git diff HEAD` via Bash. If output is non-empty, use that as the source.
2. If git diff is empty, run `node scripts/store.js queue` to check for queued files from the hook.
3. If both are empty, tell the user: "No staged changes or queued files found. Use `/quiz <path>` to quiz on a specific module."

**Module mode** (`/quiz src/payments` or `/quiz src/payments/refund.ts`):
1. Read the specified file or all source files in the directory using the Read tool.
2. Use the file contents as the source — no diff needed.

## Question Generation

Read the source code carefully. Generate exactly **5 questions** using this mix:
- **2 multiple choice** — 4 options (A/B/C/D), one correct answer. Wrong options must be plausible.
- **2 free text** — open-ended, graded by you after the user answers.
- **1 file picker** — present 4 file paths from the changed/related files, ask which one the user would modify for a given task.

Draw from these question types, mixed across the 5 questions:
- **Logic** — what does this function return/do?
- **Impact** — what other parts of the system are affected by this change?
- **Flow** — trace the execution path through the code
- **Architecture** — why is it designed this way?
- **Debug** — what's missing or could go wrong?

Assign difficulty labels: Easy / Medium / Hard based on how much reasoning is required.

At least 1 question must be about **side effects or impact on other files**.
At least 1 question must require understanding **data flow**, not just the changed lines.

## Quiz Flow

Start with this header:
```
CodeProbe: N questions on <module or file summary>
```

For each question, show:
```
Q{n}/5 [{Type} · {Difficulty}] — {Format}
{question text}

{options if multiple choice or file picker}
```

Wait for the user's answer before showing the next question. After each answer:
- **Multiple choice**: compare to the correct answer immediately. Show ✓ or ✗ and the explanation.
- **Free text**: read the answer carefully and grade it based on whether the user demonstrates genuine understanding. Show ✓ or ✗ and what they got right/wrong.
- **File picker**: compare to the correct file. Show ✓ or ✗ and why.

Show XP earned after each correct answer.

## Results and Persistence

After all 5 questions, show the results block:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Score: {correct}/5 ({pct}%)
```

Then build the result JSON and call store.js:

```bash
node scripts/store.js record '{"module":"<module>","score":<0.0-1.0>,"correct":<n>,"durationSeconds":<n>,"questions":[{"difficulty":"<easy|medium|hard>","correct":<true|false>}]}'
```

Parse the output JSON. Display:
```
+{xpEarned} XP  ·  🔥 Streak: {streak} days  ·  Level {level} {levelTitle}
XP: {xp} / {nextLevelXp}  [{bar}]
```

If a level-up occurred (level changed), celebrate it:
```
🎉 LEVEL UP! You are now Level {level} {levelTitle}!
```

Finally, clear the queue:
```bash
node scripts/store.js queue-clear
```
````

- [ ] **Step 2: Commit**

```bash
git add skills/quiz/skill.md
git commit -m "feat: add /quiz skill"
```

---

## Task 10: skills/quiz-status/skill.md

**Files:**
- Create: `skills/quiz-status/skill.md`

- [ ] **Step 1: Create skills/quiz-status/skill.md**

```markdown
---
name: quiz-status
description: "Show your CodeProbe stats: XP, level, streak, and recent quiz sessions."
---

# CodeProbe Status

Display the user's current quiz stats.

## Steps

1. Run:
```bash
node scripts/store.js stats
```

2. Parse the JSON output. Display in this format:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CodeProbe Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Level {level} {levelTitle}
XP: {xp}  [{filled bar of 20 chars}]  {xp}/{nextLevelXp}
🔥 Streak: {streak} days  (longest: {longestStreak})
Total quizzes: {totalQuizzes}

Top modules (by quiz count):
  {module}: {quizzes} quizzes, {pct}% accuracy
  ...

Run /quiz to start a quiz. Run /quiz-achievements to see badges.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

For the XP bar: fill `█` characters proportionally between current level's XP floor and the next level's XP ceiling, up to 20 characters total.

For the next level XP: use the tier thresholds (Newcomer 0–500, Apprentice 500–2000, Specialist 2000–5000, Expert 5000–12000, Architect 12000+). If the user is Architect, show total XP to next 2000 milestone.

Show top 3 modules sorted by quiz count. For each: accuracy = (correct/total * 100).
```

- [ ] **Step 2: Commit**

```bash
git add skills/quiz-status/skill.md
git commit -m "feat: add /quiz-status skill"
```

---

## Task 11: skills/quiz-achievements/skill.md

**Files:**
- Create: `skills/quiz-achievements/skill.md`

- [ ] **Step 1: Create skills/quiz-achievements/skill.md**

```markdown
---
name: quiz-achievements
description: "Show your CodeProbe achievement badges — earned and locked."
---

# CodeProbe Achievements

Display earned and locked achievement badges.

## Steps

1. Run:
```bash
node scripts/store.js achievements
```

2. Parse the JSON. Display in this format:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CodeProbe Achievements  ({earned} / {total})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Earned
  🩸 First Blood — Complete your first quiz
  🎯 Perfect Run — Score 100% on any quiz
  ...

🔒 Locked
  🏅 Module Master — Score ≥ 80% on the same module 3 times
  ...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Use these emoji per badge:
- first-blood: 🩸
- perfect-run: 🎯
- module-master: 🏅
- streak-week: 🔥
- deep-diver: 🤿
- explorer: 🗺️
- speed-demon: ⚡
- centurion: 💯
```

- [ ] **Step 2: Commit**

```bash
git add skills/quiz-achievements/skill.md
git commit -m "feat: add /quiz-achievements skill"
```

---

## Task 12: Wire Up package.json and Final Integration

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update package.json with plugin metadata**

```json
{
  "name": "codeprobe",
  "version": "0.1.0",
  "description": "Gamified code quiz plugin for Claude Code",
  "keywords": ["claude-code", "plugin", "quiz", "gamification"],
  "license": "MIT",
  "scripts": {
    "test": "node --test tests/store.test.js"
  },
  "claude": {
    "skills": [
      "skills/quiz/skill.md",
      "skills/quiz-status/skill.md",
      "skills/quiz-achievements/skill.md"
    ],
    "hooks": {
      "PostToolUse": "hooks/post-tool-use.js",
      "SessionStart": "hooks/session-start.js"
    }
  },
  "devDependencies": {
    "esbuild": "^0.24.0"
  }
}
```

- [ ] **Step 2: Run the full test suite one final time**

```bash
npm test
```

Expected: all tests pass with 0 failures.

- [ ] **Step 3: Verify store.js CLI works end-to-end**

```bash
node scripts/store.js queue
# Expected: []

node scripts/store.js record '{"module":"src/test","score":1.0,"correct":5,"durationSeconds":45,"questions":[{"difficulty":"medium","correct":true},{"difficulty":"hard","correct":true},{"difficulty":"easy","correct":true},{"difficulty":"medium","correct":true},{"difficulty":"hard","correct":true}]}'
# Expected: JSON with xpEarned > 0, level, streak info

node scripts/store.js stats
# Expected: JSON showing xp, level, streak, moduleStats

node scripts/store.js achievements
# Expected: JSON with "first-blood" and "perfect-run" in earned[]
```

- [ ] **Step 4: Final commit**

```bash
git add package.json
git commit -m "feat: wire up plugin metadata and finalize CodeProbe v0.1.0"
```
