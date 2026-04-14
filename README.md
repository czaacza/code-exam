# Code Exam

A Claude Code plugin that tests your understanding of codebases through graded exams. Get quizzed on code you're working with, track your GPA, build streaks, and earn achievements.

**Why?** AI coding tools let you push code you don't fully understand. Code Exam fights that by examining you on the code — whether it's code Claude just wrote, code you're reviewing, or parts of the codebase you've never explored.

## How it works

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Code Exam: 3 questions on src/payments
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Q1/3 [Logic · Medium]

📄 src/payments/refund.ts:42-58
┌─────────────────────────────────────
│ async function processRefund(order, amount) {
│   if (amount > order.total) {
│     throw new RefundExceedError(amount, order.total);
│   }
│   const transaction = await ledger.createEntry({
│     type: 'refund',
│     amount,
│     orderId: order.id,
│   });
│   await notifications.send(order.userId, 'refund_processed');
│   return transaction;
│ }
└─────────────────────────────────────

What happens when processRefund() is called with an amount
greater than the original order total?

  A) It silently caps the refund at the original amount
  B) It throws a RefundExceedError
  C) It returns null without processing
  D) It processes the full amount and logs a warning
```

After the exam:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Score: 3/3 (100%) — Grade: A
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Grade: A  ·  GPA: 3.75/4.0  ·  🔥 Streak: 4 days  ·  12 exams
```

## Features

- **Smart module selection** — `/exam` automatically picks parts of the codebase you haven't covered, are weak on, or haven't reviewed recently
- **Auto-exam** — Claude offers an exam after finishing coding tasks, so you understand what was just built
- **Strict grading** — Claude won't accept vague answers. It asks follow-up questions and calls out wrong reasoning
- **Code snippets** — every question shows the relevant code with file path and line numbers
- **3 question formats** — multiple choice, free text (explain in your own words), and file picker
- **GPA tracking** — American grading scale (A-F) with cumulative 4.0 GPA
- **Codebase coverage** — tracks which files you've been examined on and shows coverage gaps
- **Achievements** — 8 badges to earn (Enrolled, Straight A, Honors Student, Explorer, and more)
- **Streaks** — daily exam streaks to keep you consistent
- **Configurable** — adjust question count, difficulty, question types, and auto-exam behavior

## Installation

### From the marketplace

```bash
claude plugin marketplace add czaacza/code-exam
claude plugin install code-exam@code-exam
```

### From local directory

```bash
claude --plugin-dir /path/to/code-exam
```

### Requirements

- Claude Code CLI
- Node.js >= 18.0.0

## Commands

| Command | Description |
|---------|-------------|
| `/exam` | Take an exam on an auto-selected module (unexamined, weak, or stale) |
| `/exam <path>` | Take an exam on a specific file or directory |
| `/exam --diff` | Take an exam on your current git diff or recent Claude changes |
| `/exam-status` | View your transcript: GPA, streak, per-module grades, codebase coverage |
| `/exam-achievements` | View earned and locked achievement badges |
| `/exam-config` | Configure exam settings interactively |

## Grading

| Grade | Score | GPA |
|-------|-------|-----|
| A | 90-100% | 4.0 |
| B | 80-89% | 3.0 |
| C | 70-79% | 2.0 |
| D | 60-69% | 1.0 |
| F | <60% | 0.0 |

Your cumulative GPA is a running average across all exams. Per-module GPAs show where you're strong and where you need work.

## Configuration

Run `/exam-config` to customize:

| Setting | Default | Options |
|---------|---------|---------|
| Questions per exam | 3 | 1-10 |
| Difficulty | auto | auto, easy, medium, hard |
| Question types | all | multiple_choice, free_text, file_picker |
| Auto-exam | on | on, off |

Settings are saved at `~/.code-exam/config.json`.

## Achievements

| Badge | How to earn |
|-------|-------------|
| Enrolled | Complete your first exam |
| Straight A | Score an A (90%+) on any exam |
| Honors Student | Score A on the same module 3 times |
| Study Streak | 7-day exam streak |
| Deep Diver | Score 100% on an exam with a hard question |
| Explorer | Take exams on 5 different modules |
| Speed Demon | Score 100% in under 60 seconds |
| Centurion | Complete 100 exams |

## How auto-exam works

When the plugin is installed, Claude automatically offers an exam after completing coding tasks:

> "I've finished editing 4 files. Want to take a quick exam on these changes? (Type /exam --diff to start, or keep working)"

This is powered by the plugin's `CLAUDE.md` — no configuration needed. Turn it off with `/exam-config` if you prefer to trigger exams manually.

## Project structure

```
code-exam/
├── CLAUDE.md                       ← auto-loaded instructions for Claude
├── package.json                    ← plugin metadata and skill/hook registration
├── .claude-plugin/                 ← marketplace manifest
│
├── skills/
│   ├── exam/skill.md               ← /exam: main exam skill
│   ├── exam-status/skill.md        ← /exam-status: transcript display
│   ├── exam-achievements/skill.md  ← /exam-achievements: badges
│   └── exam-config/skill.md        ← /exam-config: settings
│
├── hooks/
│   ├── post-tool-use.js            ← tracks files Claude edits
│   └── session-start.js            ← prompts pending exam on session start
│
├── scripts/
│   └── store.js                    ← all persistence (JSON files, zero deps)
│
└── tests/
    └── store.test.js               ← 32 tests using node:test
```

## Data storage

All data is stored locally at `~/.code-exam/`:

| File | Purpose |
|------|---------|
| `scores.jsonl` | Append-only log of every exam result |
| `stats.json` | Aggregated stats: GPA, streak, per-module grades, examined files |
| `queue.json` | Files Claude edited (pending exam) |
| `config.json` | User preferences |

No external API calls. No server. No accounts. Everything runs locally inside Claude Code.

## License

MIT
