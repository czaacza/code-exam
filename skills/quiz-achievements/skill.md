---
name: quiz-achievements
description: "Show your CodeProbe achievement badges — earned and locked. Run /quiz-achievements to see your progress."
---

# CodeProbe Achievements

Display earned and locked achievement badges.

## Steps

1. Run via Bash:
```
node scripts/store.js achievements
```

2. Parse the JSON output. It has this shape:
```json
{
  "earned": [{"id":"first-blood","name":"First Blood","description":"Complete your first quiz"}],
  "locked": [{"id":"perfect-run","name":"Perfect Run","description":"Score 100% on any quiz"}]
}
```

3. Display in this format:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CodeProbe Achievements  ({earned count} / {total count})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Earned
  {emoji} {name} — {description}
  (one line per earned badge)

🔒 Locked
  {emoji} {name} — {description}
  (one line per locked badge)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If no badges earned yet, show "No badges yet — run /quiz to earn your first!"

Use these emoji per badge id:
- first-blood: 🩸
- perfect-run: 🎯
- module-master: 🏅
- streak-week: 🔥
- deep-diver: 🤿
- explorer: 🗺️
- speed-demon: ⚡
- centurion: 💯
