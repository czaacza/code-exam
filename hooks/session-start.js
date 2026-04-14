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
