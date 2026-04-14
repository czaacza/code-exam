'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Source file extensions to track
const TRACKED_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs',
  '.java', '.rb', '.cpp', '.c', '.cs', '.swift', '.kt',
]);

// Patterns for files to skip
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
  const dir = path.join(os.homedir(), '.code-exam');
  const queueFile = path.join(dir, 'queue.json');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let queue = [];
  if (fs.existsSync(queueFile)) {
    try { queue = JSON.parse(fs.readFileSync(queueFile, 'utf8')); } catch { queue = []; }
  }
  if (!queue.includes(filePath)) {
    queue.push(filePath);
    try {
      fs.writeFileSync(queueFile, JSON.stringify(queue));
    } catch (err) {
      process.stderr.write(`[Code Exam] Warning: could not write queue: ${err.message}\n`);
    }
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
