---
name: exam-achievements
description: "Show your Code Exam achievement badges — earned and locked. Run /exam-achievements to see your progress."
---

# Code Exam — Achievements

Display earned and locked achievement badges.

## Steps

1. Run via Bash:
```
node scripts/store.js achievements
```

2. Parse the JSON output. It has this shape:
```json
{
  "earned": [{"id":"enrolled","name":"Enrolled","description":"Complete your first exam"}],
  "locked": [{"id":"straight-a","name":"Straight A","description":"Score an A (90%+) on any exam"}]
}
```

3. Display in this format:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Code Exam — Achievements  ({earned count} / {total count})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Earned
  {emoji} {name} — {description}
  (one line per earned badge)

🔒 Locked
  {emoji} {name} — {description}
  (one line per locked badge)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If no badges earned yet, show "No badges yet — run /exam to earn your first!"

Use these emoji per badge id:
- enrolled: 🎓
- straight-a: 🅰️
- honors: 🏅
- streak-week: 🔥
- deep-diver: 🤿
- explorer: 🗺️
- speed-demon: ⚡
- centurion: 💯
