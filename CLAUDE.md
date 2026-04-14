# Code Exam

Code Exam is installed. It tests your understanding of the codebase through graded exams.

## Available skills

- `/exam` — smart codebase exploration: picks unexamined, weak, or stale modules automatically
- `/exam <path>` — exam on a specific file or directory
- `/exam --diff` — exam on current git diff or queued Claude changes
- `/exam-status` — show GPA, rank, streak, module grades
- `/exam-achievements` — show earned badges and progress toward locked ones

## store.js CLI interface

All persistence goes through `node scripts/store.js <command>`:

```
node scripts/store.js record '<json>'   — save exam result, recalculate stats
node scripts/store.js stats             — print stats (GPA, rank, streak)
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
  "questions": [
    { "difficulty": "medium", "correct": true },
    { "difficulty": "hard", "correct": false }
  ]
}
```

It prints a JSON result with `grade`, `gpa`, `rank`, and updated stats.

## Grading scale

| Grade | Score | GPA |
|-------|-------|-----|
| A | 90-100% | 4.0 |
| B | 80-89% | 3.0 |
| C | 70-79% | 2.0 |
| D | 60-69% | 1.0 |
| F | <60% | 0.0 |

## Ranks

Freshman (0-10 exams) → Sophomore (11-25) → Junior (26-50) → Senior (51-100) → Graduate (101+)

## Data location

`~/.code-exam/` — created automatically on first use.
