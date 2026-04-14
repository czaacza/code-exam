---
name: quiz-status
description: "Show your CodeProbe stats: XP, level, streak, and recent quiz sessions. Run /quiz-status to see your progress."
---

# CodeProbe Status

Display the user's current quiz stats.

## Steps

1. Run via Bash:
```
node scripts/store.js stats
```

2. Parse the JSON output. The output has this shape:
```json
{"xp":1385,"level":7,"levelTitle":"Apprentice","streak":5,"longestStreak":12,"lastQuizDate":"2026-04-14","totalQuizzes":34,"moduleStats":{"src/payments":{"quizzes":8,"correct":31,"total":40}}}
```

3. Calculate next level XP threshold using these tier boundaries:
   - Newcomer: 0–500 (levels 1–4)
   - Apprentice: 500–2000 (levels 5–9)
   - Specialist: 2000–5000 (levels 10–14)
   - Expert: 5000–12000 (levels 15–19)
   - Architect: 12000+ (level 20+, next milestone every 2000 XP)

4. Build a 20-character XP bar using `█` for filled and `░` for empty.

5. Display in this format:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CodeProbe Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Level {level} {levelTitle}
XP: {xp}  [{20-char bar}]  {xp}/{nextLevelXp}
🔥 Streak: {streak} days  (longest: {longestStreak})
Total quizzes: {totalQuizzes}

Top modules:
  {module}: {quizzes} quizzes, {accuracy}% accuracy
  (show top 3 by quiz count, sorted descending)

Run /quiz to start a quiz.
Run /quiz-achievements to see your badges.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Accuracy for each module = round(correct / total * 100).
If no quizzes yet, show a friendly "No quizzes yet. Run /quiz to get started!"
