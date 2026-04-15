---
name: exam-status
description: "Show your Code Exam transcript: GPA, streak, per-module grades, and codebase coverage. Run /exam-status to see your progress."
---

# Code Exam — Transcript

Display the user's exam transcript with codebase coverage analysis.

## Steps

1. Run via Bash to get current stats:
```
node scripts/store.js stats
```

2. Scan the project for all source files using Glob: `**/*.{ts,js,py,go,rs,java,rb,tsx,jsx}`. Exclude `node_modules/`, `dist/`, `build/`, `*.test.*`, `*.spec.*`, `__tests__/`, `*.lock`, `*.generated.*`.

3. Parse the stats JSON. Compare `examinedFiles` against the total source files found to calculate codebase coverage.

4. Display in this format:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Code Exam — Transcript
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GPA: {gpa}/4.0  ·  {totalExams} exams completed
🔥 Streak: {streak} days (longest: {longestStreak})

Codebase Coverage: {examinedFiles.length}/{totalSourceFiles} files ({pct}%)
[{coverage bar, 20 chars, █/░}]

Module Grades:
  {module}: GPA {moduleGPA}/4.0 · {accuracy}% accuracy · {examinedFiles}/{totalModuleFiles} files
  (show all modules sorted by exam count descending)

Unexamined Modules:
  {list of modules with source files but no exams taken}
  (group by directory, show file count per module)

Grading: A (85%+) · B (65-84%) · C (45-64%) · D (30-44%) · F (<30%)

Run /exam to take an exam.
Run /exam-achievements to see your badges.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Coverage calculation:**
- `examinedFiles` from stats.json = files that have been part of at least one exam
- Total source files = all files found by Glob scan
- Coverage % = (examined / total) * 100, rounded
- For per-module coverage: count examined files vs total files in that module's directory

**Module GPA:** Average of the `grades` array for each module entry in moduleStats.

**Accuracy:** round(correct / total * 100) per module.

If no exams yet, show: "No exams taken yet. Run /exam to get started!"
