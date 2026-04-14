'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DIR = path.join(os.homedir(), '.code-exam');
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
      process.stderr.write('[Code Exam] Warning: queue.json is corrupted, resetting to empty.\n');
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
    process.stderr.write(`[Code Exam] Warning: could not write queue: ${err.message}\n`);
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

const GRADE_THRESHOLDS = [
  { grade: 'A', minPct: 90, gpa: 4.0 },
  { grade: 'B', minPct: 80, gpa: 3.0 },
  { grade: 'C', minPct: 70, gpa: 2.0 },
  { grade: 'D', minPct: 60, gpa: 1.0 },
  { grade: 'F', minPct: 0,  gpa: 0.0 },
];

const RANKS = [
  { title: 'Freshman',   minExams: 0 },
  { title: 'Sophomore',  minExams: 11 },
  { title: 'Junior',     minExams: 26 },
  { title: 'Senior',     minExams: 51 },
  { title: 'Graduate',   minExams: 101 },
];

function calculateGrade(score) {
  const pct = Math.round(score * 100);
  for (const t of GRADE_THRESHOLDS) {
    if (pct >= t.minPct) return { grade: t.grade, gpa: t.gpa, pct };
  }
  return { grade: 'F', gpa: 0.0, pct };
}

function calculateRank(totalExams) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (totalExams >= RANKS[i].minExams) return RANKS[i].title;
  }
  return 'Freshman';
}

function calculateGPA(allGrades) {
  if (allGrades.length === 0) return 0.0;
  const sum = allGrades.reduce((acc, g) => acc + g, 0);
  return Math.round((sum / allGrades.length) * 100) / 100;
}

function updateStreak(stats, todayStr) {
  if (!stats.lastExamDate) {
    return { streak: 1, longestStreak: Math.max(1, stats.longestStreak) };
  }
  const last = new Date(stats.lastExamDate);
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
      gpa: 0.0,
      rank: 'Freshman',
      streak: 0,
      longestStreak: 0,
      lastExamDate: null,
      totalExams: 0,
      allGrades: [],
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

  const { grade, gpa, pct } = calculateGrade(result.score);
  result.grade = grade;
  result.gpa = gpa;

  // Append to scores.jsonl
  fs.appendFileSync(SCORES_FILE, JSON.stringify(result) + '\n');

  const stats = readStats();
  const today = new Date().toISOString().split('T')[0];

  const streakUpdate = updateStreak(stats, today);

  if (!stats.moduleStats[result.module]) {
    stats.moduleStats[result.module] = { exams: 0, correct: 0, total: 0, lastExamDate: null, grades: [] };
  }
  const mod = stats.moduleStats[result.module];
  mod.exams++;
  mod.correct += result.correct || 0;
  mod.total += (result.questions || []).length || 5;
  mod.lastExamDate = today;
  mod.grades.push(gpa);

  stats.allGrades.push(gpa);
  stats.gpa = calculateGPA(stats.allGrades);
  stats.totalExams++;
  stats.streak = streakUpdate.streak;
  stats.longestStreak = streakUpdate.longestStreak;
  stats.lastExamDate = today;
  stats.rank = calculateRank(stats.totalExams);

  writeStats(stats);
  return JSON.stringify({ grade, gpa, pct, ...stats });
}

const BADGES = [
  {
    id: 'enrolled',
    name: 'Enrolled',
    description: 'Complete your first exam',
    check: (scores) => scores.length >= 1,
  },
  {
    id: 'straight-a',
    name: 'Straight A',
    description: 'Score an A (90%+) on any exam',
    check: (scores) => scores.some(s => s.score >= 0.9),
  },
  {
    id: 'honors',
    name: 'Honors Student',
    description: 'Score A on the same module 3 times',
    check: (scores) => {
      const byModule = {};
      for (const s of scores) {
        if (s.score >= 0.9) byModule[s.module] = (byModule[s.module] || 0) + 1;
      }
      return Object.values(byModule).some(count => count >= 3);
    },
  },
  {
    id: 'streak-week',
    name: 'Study Streak',
    description: '7-day exam streak',
    check: (scores, stats) => stats.longestStreak >= 7,
  },
  {
    id: 'deep-diver',
    name: 'Deep Diver',
    description: 'Score 100% on an exam with a hard question',
    check: (scores) => scores.some(s =>
      s.score === 1.0 && (s.questions || []).some(q => q.difficulty === 'hard')
    ),
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Take exams on 5 different modules',
    check: (scores) => new Set(scores.map(s => s.module)).size >= 5,
  },
  {
    id: 'speed-demon',
    name: 'Speed Demon',
    description: 'Score 100% in under 60 seconds',
    check: (scores) => scores.some(s => s.score === 1.0 && s.durationSeconds < 60),
  },
  {
    id: 'centurion',
    name: 'Centurion',
    description: 'Complete 100 exams',
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

module.exports = { ensureDir, readQueue, writeQueue, clearQueue, addToQueue, calculateGrade, calculateRank, calculateGPA, updateStreak, readStats, writeStats, recordResult, readAllScores, computeAchievements };
