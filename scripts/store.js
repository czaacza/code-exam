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
