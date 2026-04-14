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
  } catch (err) {
    if (err instanceof SyntaxError) {
      process.stderr.write('[CodeProbe] Warning: queue.json is corrupted, resetting to empty.\n');
      return [];
    }
    throw err;
  }
}

function writeQueue(queue) {
  ensureDir();
  try {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue));
  } catch (err) {
    process.stderr.write(`[CodeProbe] Warning: could not write queue: ${err.message}\n`);
  }
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
    isNewStreakDay
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
    case 'record':
      console.log(recordResult(args[0]));
      break;
    case 'stats':
      console.log(JSON.stringify(readStats(), null, 2));
      break;
    case 'achievements': {
      const scores = readAllScores();
      const stats = readStats();
      const result = computeAchievements(scores, stats);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

module.exports = { ensureDir, readQueue, writeQueue, clearQueue, addToQueue, calculateLevel, calculateXP, updateStreak, readStats, writeStats, recordResult, readAllScores, computeAchievements };
