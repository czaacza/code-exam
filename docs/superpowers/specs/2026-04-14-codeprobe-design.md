# CodeProbe — Claude Code Plugin Design Spec

**Date:** 2026-04-14  
**Status:** Approved

---

## 1. Problem & Goal

Developers using AI coding tools (Claude Code, Cursor, Copilot) increasingly push code they don't fully understand. CodeProbe is a Claude Code plugin that quizzes developers on code changes — both their own and Claude-generated — to reinforce understanding through a gamified, interactive experience.

**Primary goal for v1:** Validate that the quizzes are actually entertaining and meaningful on a real codebase. Ship something testable, not something complete.

---

## 2. Architecture

### Plugin format

Standard Claude Code plugin — identical pattern to Caveman and GSD:

```
codeprobe/
├── CLAUDE.md                       ← auto-loaded: plugin description + instructions
├── package.json                    ← no prod deps, devDeps: esbuild for hooks
│
├── skills/
│   ├── quiz/skill.md               ← /quiz (diff mode + module mode)
│   ├── quiz-status/skill.md        ← /quiz-status (XP, level, streak)
│   └── quiz-achievements/skill.md  ← /quiz-achievements (badges)
│
├── hooks/
│   ├── post-tool-use.js            ← queues files edited by Claude
│   └── session-start.js            ← prompts pending quiz on session open
│
└── scripts/
    └── store.js                    ← plain JS: read/write JSON, compute XP/streak
```

### Key constraints

- **No external API calls** — Claude generates and grades questions in-context using its built-in understanding of the code. No separate Anthropic SDK calls.
- **No npm production dependencies** — zero install friction after `claude plugin install`.
- **No SQLite** — all state is flat JSON files in `~/.codeprobe/`.
- Hooks compiled with esbuild (dev dependency only), same pattern as GSD.

### State files

```
~/.codeprobe/
├── queue.json       ← files Claude edited this session (pending quiz)
├── scores.jsonl     ← append-only log of all quiz results
└── stats.json       ← aggregated: XP, level, streak, achievements
```

---

## 3. Skills

### `/quiz` — Main quiz skill

**Two modes:**

**Diff mode** (default — no argument):
- Reads `git diff HEAD` for staged/committed changes
- If git diff returns nothing (clean working tree), falls back to `queue.json`
- If both exist, git diff takes precedence — queue is used only as a fallback
- Claude analyzes changed files in-context, generates 5 questions about those changes

**Module mode** (`/quiz <path>`):
- Claude reads the specified file or directory directly
- Generates questions without needing a diff
- Useful for studying existing code or onboarding to unfamiliar modules

**Question mix per session (5 questions):**
- 2× multiple choice — instant feedback, no grading overhead
- 2× free text — "explain what this does" — Claude grades in-context
- 1× file picker — "which file would you edit to fix X?" — Claude presents a list

**Question types drawn from:**
- Logic — what does this function do / return?
- Impact — which other parts of the system are affected?
- Flow — trace the execution path through changed code
- Architecture — why is it designed this way?
- Debug — what's missing or could go wrong?

**Difficulty auto-selected** based on diff size and module complexity. Questions labeled Easy / Medium / Hard.

**Session flow:**
```
CodeProbe: 5 questions on src/payments/refund.ts (+127 -34)

Q1/5 [Logic · Medium] — Multiple choice
The processRefund() function throws when refund > original.
What exception type does it throw?
  A) ValidationError  B) RefundExceedError  C) TypeError  D) RangeError
> B
✓ Correct. +25 XP

Q2/5 [Impact · Medium] — Free text
Which other services are affected if this refund logic changes?
> the notification service and the ledger
✓ Good — you identified both affected services. +25 XP

Q3/5 [Flow · Hard] — File picker
Which file contains the middleware that runs BEFORE the auth check on /api/orders?
  1) src/middleware/rateLimiter.ts
  2) src/middleware/auth.ts
  3) src/routes/orders.ts
  4) src/middleware/logger.ts
> 1
✓ Correct — rateLimiter runs first. +50 XP

...

Score: 4/5 (80%) · +135 XP · 🔥 Streak: 3 days · Level 4 Apprentice
New badge unlocked: Module Master (src/payments)
```

After session: skill calls `node scripts/store.js record <json>` via Bash tool to persist result and update stats.

### `/quiz-status`

Calls `node scripts/store.js stats` via Bash. Displays:
- Current XP, level title, progress to next level (ASCII bar)
- Current streak and longest streak
- Last 5 quiz sessions (module, score, XP earned, date)
- Top 3 strongest modules and bottom 3 weakest modules

### `/quiz-achievements`

Calls `node scripts/store.js achievements` via Bash. Displays:
- Earned badges with date earned
- Next locked badges with progress toward them (e.g. "Module Master: 2/3 quizzes on src/auth")

---

## 4. Hooks

### `hooks/post-tool-use.js`

Fires after every Claude file write/edit. Logic:
- Triggers on: `Write`, `Edit`, `MultiEdit` tool use
- Filters: only tracks source files (`.js`, `.ts`, `.py`, `.go`, `.rs`, `.java`, `.rb`, `.cpp`, `.c`, `.cs`) — skips lock files (`*.lock`, `package-lock.json`), docs (`*.md`, `docs/**`), generated files (`*.generated.*`, `dist/**`, `build/**`), and test files (`*.test.*`, `*.spec.*`, `__tests__/**`)
- Appends edited file paths to `~/.codeprobe/queue.json` (deduplicates)
- Silent — no output during normal work

### `hooks/session-start.js`

Fires when a Claude Code session opens. Logic:
- Reads `~/.codeprobe/queue.json`
- If queue is non-empty: prints a single-line banner
  ```
  CodeProbe: Claude edited 3 files last session. Run /quiz to test your understanding.
  ```
- Does NOT auto-trigger quiz — user initiates explicitly
- Does NOT clear queue (cleared by `/quiz` skill after session completes)

---

## 5. `scripts/store.js`

Plain JavaScript, no dependencies. CLI interface called by skills via Bash tool:

```
node scripts/store.js record <json>      — append result to scores.jsonl, recalculate stats.json
node scripts/store.js stats              — print stats.json as formatted text
node scripts/store.js queue              — print current queue.json
node scripts/store.js queue-clear        — empty queue.json
node scripts/store.js achievements       — compute + print badge status from scores.jsonl
```

**Level calculation** (used by `record` command to update `stats.json`):
```
XP thresholds: [0, 500, 2000, 5000, 12000]
level = index of last threshold that xp >= threshold + 1
e.g. 1385 XP → >= 500, < 2000 → level 7 (within Apprentice tier 5–9)
Fine-grained level within tier: tier_start + floor((xp - tier_xp) / tier_xp * tier_levels)
```

**`stats.json` schema:**
```json
{
  "xp": 1385,
  "level": 7,
  "streak": 5,
  "longestStreak": 12,
  "lastQuizDate": "2026-04-14",
  "totalQuizzes": 34,
  "moduleStats": {
    "src/payments": { "quizzes": 8, "correct": 31, "total": 40 },
    "src/auth": { "quizzes": 5, "correct": 18, "total": 25 }
  }
}
```

**`scores.jsonl` schema** (one JSON object per line):
```json
{"id":"uuid","ts":"2026-04-14T10:30:00Z","module":"src/payments","score":0.8,"xp":135,"questions":5,"correct":4,"durationSeconds":142,"difficulty":"medium"}
```

**`queue.json` schema:**
```json
["src/payments/refund.ts", "src/payments/types.ts", "src/api/orders.ts"]
```

---

## 6. Gamification

### XP

| Event | XP |
|-------|----|
| Correct answer (Easy) | +10 |
| Correct answer (Medium) | +25 |
| Correct answer (Hard) | +50 |
| Perfect session (all correct) | +100 bonus |
| First quiz on new module | +50 bonus |
| Streak day bonus | +20 |

### Levels

| Range | Title | XP |
|-------|-------|----|
| 1–4 | Newcomer | 0–500 |
| 5–9 | Apprentice | 500–2000 |
| 10–14 | Specialist | 2000–5000 |
| 15–19 | Expert | 5000–12000 |
| 20+ | Architect | 12000+ |

### Achievements (MVP — 8 badges)

| Badge | Condition |
|-------|-----------|
| First Blood | Complete first quiz |
| Perfect Run | Score 100% on any quiz |
| Module Master | Score ≥ 80% on same module 3× |
| Streak Week | 7-day quiz streak |
| Deep Diver | Score 100% on a hard question |
| Explorer | Quiz on 5 different modules |
| Speed Demon | Perfect score in under 60s total |
| Centurion | Complete 100 quizzes |

**Streak rules:** one quiz per calendar day counts. Streak resets if you skip a day.

**Anti-gaming:** questions generated fresh from actual code each time. Free-text graded by Claude in-context — no memorizable answer bank.

---

## 7. Out of scope for v1

- Team features, leaderboards, bus factor tracking
- Web dashboard
- Slack / GitHub integrations
- Multiple LLM provider support (OpenAI, Ollama)
- `codeprobe challenge <user>` and `codeprobe review-prep`
- Gate mode (blocking push on fail)
- SQLite migration

---

## 8. Success criteria for v1

- Quizzes feel entertaining and non-trivial on a real codebase
- Questions are meaningfully about the actual changed code, not generic
- Free-text grading feels fair
- Gamification loop (XP → level → badges) is visible and motivating
- PostToolUse hook correctly detects Claude-generated changes and prompts appropriately
