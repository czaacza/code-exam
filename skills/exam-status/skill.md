---
name: exam-status
description: "Show your Code Exam stats: GPA, rank, streak, and module grades. Run /exam-status to see your transcript."
---

# Code Exam — Transcript

Display the user's current exam transcript.

## Steps

1. Run via Bash:
```
node scripts/store.js stats
```

2. Parse the JSON output. The output has this shape:
```json
{"gpa":3.5,"rank":"Sophomore","streak":5,"longestStreak":12,"lastExamDate":"2026-04-14","totalExams":15,"allGrades":[4.0,3.0,4.0],"moduleStats":{"src/payments":{"exams":8,"correct":31,"total":40,"lastExamDate":"2026-04-14","grades":[3.0,4.0]}}}
```

3. Calculate the module GPA for each module: average of its `grades` array.

4. Display in this format:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Code Exam — Transcript
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{rank}  ·  GPA: {gpa}/4.0  ·  {totalExams} exams completed
🔥 Streak: {streak} days (longest: {longestStreak})

Module Grades:
  {module}: {moduleGPA}/4.0 ({exams} exams, {accuracy}% accuracy)
  (show all modules sorted by exam count descending)

Grading Scale: A (90%+) · B (80-89%) · C (70-79%) · D (60-69%) · F (<60%)
Ranks: Freshman (0-10) · Sophomore (11-25) · Junior (26-50) · Senior (51-100) · Graduate (101+)

Run /exam to take an exam.
Run /exam-achievements to see your badges.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Accuracy for each module = round(correct / total * 100).
If no exams yet, show: "No exams taken yet. Run /exam to get started!"
