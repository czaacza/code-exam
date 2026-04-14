'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

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

module.exports = { ensureDir, readQueue, writeQueue, clearQueue, addToQueue, calculateLevel, calculateXP };
