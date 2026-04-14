# Code Exam

Code Exam is installed. It tests your understanding of the codebase through graded exams.

## Auto-exam behavior

<IMPORTANT>
After you finish a coding task that involved editing source files (Write, Edit, or MultiEdit), offer the user an exam on those changes. Say something like:

"I've finished editing {N} files. Want to take a quick exam on these changes? (Type /exam --diff to start, or keep working)"

Do this naturally — don't interrupt mid-task. Only offer when the coding work is genuinely complete and you're about to report the results. If the user declines or ignores it, don't ask again until the next coding task.
</IMPORTANT>

## Available skills

- `/exam` — smart codebase exploration: picks unexamined, weak, or stale modules automatically
- `/exam <path>` — exam on a specific file or directory
- `/exam --diff` — exam on current git diff or queued Claude changes
- `/exam-status` — show GPA, streak, module grades, and codebase coverage
- `/exam-achievements` — show earned badges and progress toward locked ones
- `/exam-config` — configure exam settings (question count, difficulty, types, auto-exam)

## store.js CLI interface

All persistence goes through `node scripts/store.js <command>`:

```
node scripts/store.js record '<json>'   — save exam result, recalculate stats
node scripts/store.js stats             — print stats (GPA, streak, coverage)
node scripts/store.js queue             — print queued file paths
node scripts/store.js queue-clear       — empty the queue after an exam
node scripts/store.js achievements      — print badge status
```

The `record` command takes a JSON string with this shape:
```json
{
  "module": "src/payments",
  "score": 0.8,
  "correct": 4,
  "durationSeconds": 142,
  "files": ["src/payments/refund.ts", "src/payments/types.ts"],
  "questions": [
    { "difficulty": "medium", "correct": true },
    { "difficulty": "hard", "correct": false }
  ]
}
```

The `files` array lists which source files were read and examined. This is used to track codebase coverage.

It prints a JSON result with `grade`, `gpa`, and updated stats.

## Grading scale

| Grade | Score | GPA |
|-------|-------|-----|
| A | 90-100% | 4.0 |
| B | 80-89% | 3.0 |
| C | 70-79% | 2.0 |
| D | 60-69% | 1.0 |
| F | <60% | 0.0 |

## Data location

`~/.code-exam/` — created automatically on first use.
