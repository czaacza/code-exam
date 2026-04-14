# CodeProbe

CodeProbe is installed. It quizzes you on the codebase to reinforce understanding.

## Available skills

- `/quiz` — smart codebase exploration: picks unquizzed, weak, or stale modules automatically
- `/quiz <path>` — quiz on a specific file or directory
- `/quiz --diff` — quiz on current git diff or queued Claude changes
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
