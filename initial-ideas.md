# CodeProbe — Codebase Knowledge Quiz & Team Gamification Tool

## Project specification v1.0

---

## 1. Vision & problem statement

### Problem

Developers increasingly use AI coding agents (Claude Code, Cursor, Copilot, Codex) to generate code changes. This creates a dangerous pattern called "vibe coding" — pushing code you don't understand. Over time this leads to:

- **Knowledge silos**: Only the AI "understands" the code, no human does.
- **Bus factor collapse**: When the person who prompted the AI leaves, nobody knows how the module works.
- **Review theater**: Code reviews become rubber-stamping because reviewers don't understand AI-generated changes either.
- **Fragile systems**: Developers can't debug or extend code they never truly learned.

Studies show developers already spend ~60% of their time reading and understanding code rather than writing it. AI agents make this worse by removing the learning-by-writing feedback loop.

### Solution

**CodeProbe** is an open-source CLI tool and git integration that:

1. Detects code changes (especially AI-generated ones).
2. Uses an LLM to generate contextual quiz questions about those specific changes.
3. Quizzes the developer interactively in the terminal before allowing a push.
4. Tracks scores, builds team leaderboards, and surfaces knowledge gaps.
5. Calculates a "Bus Factor Score" per module — alerting when only one person understands a critical part of the system.

### Target users

- Development teams (3-50 people) using AI coding tools.
- Team leads and engineering managers who want visibility into codebase knowledge distribution.
- Individual developers who want to deepen their understanding of codebases they work on.

---

## 2. Core concepts

### Quiz types

| Type | Description | Example question |
|------|-------------|------------------|
| **Logic** | Explain what changed code does | "What does the new `resolveConflict()` function return when both timestamps are equal?" |
| **Impact** | Identify side effects and dependencies | "Which 3 services will be affected if this schema migration fails halfway?" |
| **Flow** | Describe end-to-end data flow | "Trace the request path from the `/api/orders` endpoint to the database write. Which middleware runs?" |
| **Architecture** | Understand design decisions | "Why does this module use an event bus instead of direct function calls?" |
| **Debug** | Find the bug in a hypothetical scenario | "A user reports stale data after this change. Which cache invalidation step is missing?" |

### Answer formats

| Format | When to use |
|--------|-------------|
| **Multiple choice** (4 options) | Default for most questions. Quick, unambiguous scoring. |
| **Free text** (LLM-graded) | For "explain in your own words" questions. LLM evaluates correctness. |
| **File picker** | "Which file would you modify to fix X?" — dev selects from a list of changed/related files. |
| **Order/sequence** | "Put these execution steps in the correct order." |

### Difficulty levels

- **Easy**: What does this function do? (surface-level reading comprehension)
- **Medium**: What breaks if we change X? (requires understanding dependencies)
- **Hard**: Design an alternative approach and explain tradeoffs. (requires deep architectural understanding)

Difficulty should auto-calibrate based on:
- Size of the diff (larger diff = harder questions available).
- Developer's historical score on this module.
- Criticality of the changed module (core business logic vs. utility).

---

## 3. Architecture

### System overview

```
┌─────────────────────────────────────────────────────────┐
│                    Developer workflow                     │
│                                                          │
│  Claude Code / Cursor / manual edit                      │
│         │                                                │
│         ▼                                                │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────┐  │
│  │  git commit  │───▶│  git hook    │───▶│  CodeProbe │  │
│  │              │    │  (pre-push)  │    │  CLI       │  │
│  └─────────────┘    └──────────────┘    └─────┬──────┘  │
│                                                │         │
│                                    ┌───────────┼────┐    │
│                                    │           │    │    │
│                                    ▼           ▼    ▼    │
│                              ┌─────────┐ ┌────┐ ┌─────┐ │
│                              │ Quiz    │ │Score│ │Git  │ │
│                              │ Engine  │ │Store│ │Trail│ │
│                              └────┬────┘ └──┬─┘ └──┬──┘ │
│                                   │         │      │     │
│                                   ▼         ▼      ▼     │
│                              ┌──────────────────────┐    │
│                              │   Team Dashboard     │    │
│                              │   (web UI / Slack)   │    │
│                              └──────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Components

#### 3.1 Git hook layer (`codeprobe-hook`)

**Purpose**: Intercepts git push (or commit) and triggers the quiz flow.

**Implementation**:
- Installs as a `pre-push` git hook (default) or `pre-commit` (configurable).
- Reads the staged diff (`git diff --cached` or `git diff origin/main..HEAD`).
- Detects if changes were AI-generated (heuristics: presence of AI tool markers in git trailers, rapid large commits, configurable patterns).
- Passes the diff + context to the Quiz Engine.

**Configuration** (`.codeprobe.yml` in repo root):

```yaml
# .codeprobe.yml
hook: pre-push              # pre-push | pre-commit | manual-only
mode: badge                 # badge (non-blocking) | gate (blocks push on fail)
gate_threshold: 0.6         # minimum score to pass in gate mode (0.0-1.0)
gate_branches:              # only gate these branches (gate mode)
  - main
  - production
skip_patterns:              # glob patterns to never quiz on
  - "*.lock"
  - "*.generated.*"
  - "docs/**"
  - "**/*.test.*"
min_diff_lines: 10          # don't quiz on trivial changes
ai_detection: auto          # auto | always | never — when to trigger quiz
questions_count: 5           # number of questions per quiz session
difficulty: auto             # auto | easy | medium | hard
time_limit: null             # optional: seconds per question (null = no limit)
llm_provider: anthropic      # anthropic | openai | ollama | custom
llm_model: claude-sonnet-4-20250514
llm_api_key_env: ANTHROPIC_API_KEY  # env var name holding the API key
```

#### 3.2 Diff analyzer (`codeprobe-analyze`)

**Purpose**: Parses the git diff and gathers context needed for intelligent question generation.

**Input**: Raw git diff + repository structure.

**Output**: Structured analysis object:

```typescript
interface DiffAnalysis {
  changed_files: ChangedFile[];
  total_additions: number;
  total_deletions: number;
  affected_modules: string[];        // detected module/package boundaries
  related_files: string[];           // files that import/depend on changed files
  detected_patterns: string[];       // e.g. "new API endpoint", "schema migration", "auth change"
  complexity_score: number;          // 0.0-1.0, drives question difficulty
  ai_generated_likelihood: number;   // 0.0-1.0, heuristic score
}

interface ChangedFile {
  path: string;
  language: string;
  additions: string;                 // added lines with context
  deletions: string;                 // removed lines with context
  full_context: string;              // surrounding code (imports, class definition, etc.)
  dependencies: string[];            // files that import this file
  dependents: string[];              // files this file imports
}
```

**How context is gathered**:
1. Parse the diff to extract changed files and hunks.
2. For each changed file, read the full file content (not just the diff) to provide context.
3. Use static analysis (tree-sitter or regex-based) to find imports/exports and build a dependency graph of affected files.
4. Read related files (importers of changed files) to understand impact surface.
5. Detect patterns: new function signatures, changed return types, new API routes, database schema changes, auth/security changes.

#### 3.3 Quiz engine (`codeprobe-quiz`)

**Purpose**: Generates questions using an LLM and manages the interactive quiz session.

**LLM prompt structure**:

```
System: You are a senior code reviewer generating quiz questions to verify that a developer understands code changes they are about to push. Generate questions that test genuine understanding, not trivia.

Context:
- Repository: {repo_name}
- Changed files: {changed_files_with_context}
- Related files (dependencies): {related_files}
- Detected patterns: {patterns}
- Developer's historical weak areas: {weak_modules}

Generate {n} questions following this JSON schema:
{
  "questions": [
    {
      "id": "q1",
      "type": "logic|impact|flow|architecture|debug",
      "difficulty": "easy|medium|hard",
      "format": "multiple_choice|free_text|file_picker|sequence",
      "question": "...",
      "options": ["A", "B", "C", "D"],     // for multiple_choice
      "correct_answer": "B",                // for multiple_choice
      "grading_rubric": "...",              // for free_text (what constitutes a correct answer)
      "explanation": "...",                 // shown after answering
      "related_file": "src/auth/login.ts",  // file this question is about
      "related_lines": [42, 67]             // specific lines referenced
    }
  ]
}

Rules:
- At least 1 question must be about side effects / impact on other files.
- At least 1 question must require understanding the data flow, not just the changed lines.
- Questions must be answerable from the provided context (don't ask about things not in the diff or related files).
- Wrong multiple-choice options must be plausible (not obviously wrong).
- Difficulty should match the complexity score: {complexity_score}.
```

**Quiz session flow**:

```
1. Display: "CodeProbe: You're pushing {n} changed files. Let's verify your understanding."
2. For each question:
   a. Display question with format-appropriate UI (choices, text input, file list).
   b. Accept answer.
   c. If multiple_choice: compare to correct_answer.
   d. If free_text: send answer + rubric to LLM for grading (returns score 0.0-1.0 + feedback).
   e. Display: correct/incorrect + explanation.
   f. Record result.
3. Display final score: "You scored 4/5 (80%). [PASS]"
4. If gate mode and score < threshold: block push, offer retry.
5. If badge mode: allow push regardless, record score.
```

#### 3.4 Score store (`codeprobe-store`)

**Purpose**: Persists quiz results locally and optionally syncs to a team server.

**Local storage** (default, zero-infrastructure):

```
~/.codeprobe/
├── config.yml              # user preferences
├── scores.jsonl            # append-only log of all quiz results
├── knowledge_map.json      # aggregated: which modules the user knows well
└── streaks.json            # current streak, longest streak, etc.
```

**Score record schema**:

```typescript
interface QuizResult {
  id: string;                    // uuid
  timestamp: string;             // ISO 8601
  repo: string;                  // repository name
  branch: string;
  commit_hash: string;
  developer: string;             // git user.name or configurable identity
  diff_summary: {
    files_changed: number;
    additions: number;
    deletions: number;
    modules: string[];
  };
  questions: QuestionResult[];
  score: number;                 // 0.0-1.0
  passed: boolean;               // score >= threshold
  xp_earned: number;             // gamification points
  duration_seconds: number;      // total time spent on quiz
  ai_generated: boolean;         // whether changes were detected as AI-generated
}

interface QuestionResult {
  question_id: string;
  type: string;
  difficulty: string;
  module: string;                // which module/directory this question was about
  correct: boolean;
  time_seconds: number;
}
```

**Git trailer** (appended to commit message on pass):

```
Quiz-Score: 4/5
Quiz-Verified-By: jan@team.com
Quiz-Modules: auth, payments
Quiz-Timestamp: 2026-04-14T10:30:00Z
```

Implementation: After quiz completion, `git commit --amend` to append trailers (only if pre-push hook, not pre-commit). Alternatively, write to a `.codeprobe-results.json` file in the repo (configurable).

#### 3.5 Team dashboard (`codeprobe-dashboard`)

**Purpose**: Web UI showing team-wide knowledge metrics, leaderboards, and alerts.

**Technology**: Lightweight standalone web server (Node.js/Express or Python/FastAPI). Reads from a shared score store (JSON files in a shared directory, SQLite database, or a simple REST API that aggregates local scores).

**Views**:

##### Leaderboard
- Ranked by XP (all time, this week, this month).
- Shows: developer name, XP, current streak, modules mastered, accuracy rate.
- Filter by team/module.

##### Knowledge heatmap
- Matrix: rows = developers, columns = modules/directories.
- Cell color = knowledge score (green = strong, yellow = moderate, red = weak, gray = never tested).
- Highlights "bus factor" danger zones: modules where only 1 person has a green score.

##### Bus Factor alerts
- List of modules sorted by bus factor (ascending).
- Each entry shows: module name, number of "knowledgeable" developers (score > 0.7), last quiz date, criticality level.
- Alert thresholds:
  - Bus factor = 1: RED alert — "Only {name} understands {module}. Recommend cross-training."
  - Bus factor = 2: YELLOW — "Low coverage on {module}."
  - Bus factor ≥ 3: GREEN — healthy.

##### Individual profile
- Module-by-module breakdown of knowledge scores.
- Score trends over time (improving/declining per module).
- Achievement badges earned.
- Weak areas with recommended quiz topics.

##### Team activity feed
- Recent quizzes: who quizzed, which modules, scores.
- Achievements unlocked.
- Streak milestones.

**Integrations** (optional, phase 2):
- **Slack bot**: Posts weekly knowledge report, alerts on bus factor changes, celebrates achievements.
- **GitHub/GitLab**: Adds quiz score as a status check on PRs. Shows a badge in the PR description.

---

## 4. Gamification system

### XP (Experience points)

| Action | XP |
|--------|----|
| Correct answer (easy) | +10 XP |
| Correct answer (medium) | +25 XP |
| Correct answer (hard) | +50 XP |
| Perfect score (all correct) | +100 XP bonus |
| First quiz on a new module | +50 XP bonus |
| Daily streak (consecutive days with quiz) | +20 XP bonus per day |
| Voluntary quiz (not triggered by hook) | +30 XP bonus |

### Levels

| Level | Title | XP required |
|-------|-------|-------------|
| 1-4 | Newcomer | 0-500 |
| 5-9 | Apprentice | 500-2000 |
| 10-14 | Specialist | 2000-5000 |
| 15-19 | Expert | 5000-12000 |
| 20+ | Architect | 12000+ |

### Achievements (badges)

| Badge | Condition |
|-------|-----------|
| First Blood | Complete your first quiz |
| Module Master: {name} | Score > 90% on 5 quizzes for the same module |
| Full Stack Explorer | Quiz on files in frontend, backend, and infra directories |
| Perfect Week | 7-day streak with 100% accuracy |
| Night Owl | Complete a quiz after midnight |
| Speed Demon | Answer all questions correctly in under 60 seconds total |
| Deep Diver | Score 100% on a hard-difficulty quiz |
| Cross-Trainer | Quiz on a module you've never touched (someone else's code) |
| Bus Factor Hero | Become the 2nd person to master a bus-factor-1 module |
| Review Ace | Quiz on someone else's PR before reviewing it |
| Centurion | Complete 100 quizzes |
| Knowledge Philanthropist | Improve bus factor on 5 different modules |

### Anti-gaming protections

- Questions are generated dynamically per diff — no memorizable question bank.
- Free-text answers are LLM-graded, preventing pattern matching.
- Rapid re-takes after a fail generate NEW questions (never the same set).
- Score is weighted by question difficulty (easy-only runs give less XP).
- Dashboard flags anomalies: perfect scores with very fast times, etc.

---

## 5. CLI interface

### Commands

```bash
# Core
codeprobe quiz                  # manually trigger a quiz on current staged changes
codeprobe quiz --module auth    # quiz on a specific module (no diff needed)
codeprobe quiz --pr 142         # quiz on a pull request's changes
codeprobe quiz --commit abc123  # quiz on a specific commit's changes

# Setup
codeprobe init                  # initialize in current repo (creates .codeprobe.yml, installs hook)
codeprobe hook install          # install git hook separately
codeprobe hook uninstall        # remove git hook
codeprobe config set key value  # update configuration

# Scores & progress
codeprobe status                # show current XP, level, streak, recent scores
codeprobe scores                # show detailed score history
codeprobe scores --module auth  # filter by module
codeprobe leaderboard           # show team leaderboard (if team sync enabled)
codeprobe achievements          # show earned and available badges
codeprobe knowledge-map         # show personal module knowledge heatmap (ASCII)

# Team
codeprobe team init             # set up team score syncing
codeprobe team dashboard        # start local web dashboard
codeprobe team bus-factor       # show bus factor report in terminal
codeprobe team export           # export team data as JSON/CSV

# Utilities
codeprobe explain <file>        # use LLM to explain a file (no quiz, just learning)
codeprobe challenge <user>      # challenge a teammate to a quiz on a specific module
codeprobe review-prep --pr 142  # quiz yourself on a PR before reviewing it
```

### Terminal UI example

```
╔══════════════════════════════════════════════════════════════╗
║  CodeProbe — Verifying your understanding before push       ║
║  Branch: feat/payment-refund → main                         ║
║  Changed: 4 files, +127 -34 lines                           ║
╠══════════════════════════════════════════════════════════════╣

  Question 1/5 [Logic · Medium]   ━━━━━░░░░░░░░░░░░░░░  20%

  The new `processRefund()` function in src/payments/refund.ts
  handles partial refunds. What happens when the refund amount
  exceeds the original transaction amount?

  ❯ A) It throws a RefundExceedError and rolls back
    B) It silently caps the refund at the original amount
    C) It processes the full amount and logs a warning
    D) It returns null without processing

  ⏱  23s elapsed

╚══════════════════════════════════════════════════════════════╝
```

```
╔══════════════════════════════════════════════════════════════╗
║  Results                                                     ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Score: 4/5 (80%)  ✓ PASSED                                 ║
║  +135 XP earned (streak bonus: +20)                          ║
║                                                              ║
║  ✓ Q1 [Logic]        Correct    +25 XP                       ║
║  ✓ Q2 [Impact]       Correct    +25 XP                       ║
║  ✗ Q3 [Flow]         Incorrect                               ║
║    → The request passes through rateLimiter middleware        ║
║      BEFORE the auth check, not after.                       ║
║  ✓ Q4 [Architecture] Correct    +50 XP                       ║
║  ✓ Q5 [Debug]        Correct    +25 XP                       ║
║                                                              ║
║  Level 7 Apprentice  ████████████░░░░░░  1,385 / 2,000 XP   ║
║  🔥 Streak: 5 days                                           ║
║                                                              ║
║  🏆 NEW: "Cross-Trainer" — quizzed on someone else's code!   ║
║                                                              ║
║  Git trailer added to commit.                                ║
║  Pushing to origin/main...                                   ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 6. Technology stack

### Core (MVP)

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| CLI tool | TypeScript + Node.js | Familiar to most developers, fast to build, good terminal UI libs |
| Terminal UI | `ink` (React for CLI) or `inquirer` + `chalk` | Rich interactive terminal experience |
| Git integration | `simple-git` npm package + shell commands | Reliable git operations |
| LLM integration | Anthropic SDK (primary), OpenAI SDK (secondary) | Best code understanding; user chooses provider |
| Local storage | SQLite via `better-sqlite3` | Zero-config, single file, fast queries |
| Configuration | YAML (`.codeprobe.yml`) | Human-readable, git-friendly |
| Static analysis | `tree-sitter` bindings | Language-agnostic AST parsing for dependency detection |

### Dashboard (phase 2)

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Web server | Express.js or Fastify | Lightweight, same language as CLI |
| Frontend | React + Tailwind CSS | Fast to build, good charting ecosystem |
| Charts | Recharts or Chart.js | Heatmaps, bar charts, line charts |
| Data sync | REST API + SQLite or flat file sync | Start simple, upgrade later |

### Optional integrations (phase 3)

| Integration | Technology |
|-------------|-----------|
| Slack notifications | Slack Web API / webhooks |
| GitHub PR status | GitHub Actions / Check Runs API |
| GitLab MR integration | GitLab CI / API |
| VS Code extension | VS Code Extension API |
| Claude Code plugin | Claude Code skills format (SKILL.md) |

---

## 7. Data models

### SQLite schema (local storage)

```sql
CREATE TABLE quiz_sessions (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,               -- ISO 8601
    repo TEXT NOT NULL,
    branch TEXT,
    commit_hash TEXT,
    developer TEXT NOT NULL,
    files_changed INTEGER,
    additions INTEGER,
    deletions INTEGER,
    modules TEXT,                           -- JSON array of module names
    score REAL NOT NULL,                   -- 0.0-1.0
    passed BOOLEAN NOT NULL,
    xp_earned INTEGER NOT NULL,
    duration_seconds INTEGER,
    ai_generated BOOLEAN DEFAULT FALSE,
    question_count INTEGER NOT NULL
);

CREATE TABLE question_results (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES quiz_sessions(id),
    question_type TEXT NOT NULL,            -- logic, impact, flow, architecture, debug
    difficulty TEXT NOT NULL,               -- easy, medium, hard
    module TEXT,
    correct BOOLEAN NOT NULL,
    time_seconds INTEGER,
    question_text TEXT,
    answer_given TEXT,
    correct_answer TEXT,
    explanation TEXT
);

CREATE TABLE achievements (
    id TEXT PRIMARY KEY,
    developer TEXT NOT NULL,
    badge_id TEXT NOT NULL,
    earned_at TEXT NOT NULL,
    repo TEXT
);

CREATE TABLE developer_stats (
    developer TEXT NOT NULL,
    repo TEXT NOT NULL,
    module TEXT NOT NULL,
    quiz_count INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    last_quiz_at TEXT,
    knowledge_score REAL DEFAULT 0.0,      -- weighted rolling average
    PRIMARY KEY (developer, repo, module)
);

CREATE TABLE streaks (
    developer TEXT PRIMARY KEY,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_quiz_date TEXT,
    total_xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1
);

-- Indexes
CREATE INDEX idx_sessions_developer ON quiz_sessions(developer);
CREATE INDEX idx_sessions_repo_module ON quiz_sessions(repo, modules);
CREATE INDEX idx_sessions_timestamp ON quiz_sessions(timestamp);
CREATE INDEX idx_questions_module ON question_results(module);
CREATE INDEX idx_stats_module ON developer_stats(module);
CREATE INDEX idx_stats_score ON developer_stats(knowledge_score);
```

### Knowledge score calculation

```
knowledge_score(developer, module) =
    weighted_average(last_10_quiz_scores_for_module)
    × recency_factor(days_since_last_quiz)
    × difficulty_multiplier(avg_difficulty_of_questions)

where:
    recency_factor(days) = max(0.3, 1.0 - (days / 90))
        // score decays to 30% floor after 90 days without quiz
    difficulty_multiplier = { easy: 0.7, medium: 1.0, hard: 1.3 }
```

### Bus factor calculation

```
bus_factor(module) = count(
    developers WHERE knowledge_score(developer, module) >= 0.7
    AND last_quiz_date within 90 days
)
```

---

## 8. Development phases

### Phase 1 — MVP (2-3 weeks)

**Goal**: Working CLI tool that quizzes a single developer on their git diff.

Deliverables:
- [ ] `codeprobe init` — creates `.codeprobe.yml`, installs pre-push hook.
- [ ] `codeprobe quiz` — manually trigger quiz on staged/committed changes.
- [ ] Diff analyzer: parse git diff, extract changed files with context.
- [ ] LLM integration: send diff + context to Anthropic API, receive generated questions.
- [ ] Terminal quiz UI: multiple choice questions with colored output.
- [ ] Score recording: save results to local SQLite.
- [ ] `codeprobe status` — show XP, level, recent scores.
- [ ] Git trailer: append `Quiz-Score` to commit message.
- [ ] Basic configuration via `.codeprobe.yml`.

### Phase 2 — Gamification & team features (2-3 weeks)

**Goal**: Full gamification system and team dashboard.

Deliverables:
- [ ] XP system with level progression.
- [ ] Achievement/badge system (detect and award badges).
- [ ] `codeprobe achievements` — display earned badges.
- [ ] `codeprobe leaderboard` — terminal-based team leaderboard.
- [ ] Free-text answer support with LLM grading.
- [ ] Knowledge heatmap calculation and ASCII display.
- [ ] Bus factor calculation and `codeprobe team bus-factor` command.
- [ ] Gate mode: block push when score < threshold.
- [ ] Web dashboard (basic): leaderboard + heatmap + bus factor alerts.
- [ ] Team score syncing (shared SQLite file or simple REST API).

### Phase 3 — Integrations & polish (2-3 weeks)

**Goal**: Ecosystem integrations and production hardening.

Deliverables:
- [ ] Slack integration: weekly reports, achievement notifications, bus factor alerts.
- [ ] GitHub Actions integration: quiz score as PR status check.
- [ ] `codeprobe quiz --pr <number>` — quiz on a pull request.
- [ ] `codeprobe challenge <user>` — challenge a teammate.
- [ ] `codeprobe review-prep` — quiz before code review.
- [ ] Multiple LLM provider support (OpenAI, Ollama for local/offline).
- [ ] Claude Code plugin format (SKILL.md).
- [ ] VS Code extension (sidebar with status, trigger quiz from editor).
- [ ] Performance optimization: caching, diff batching, parallel question generation.
- [ ] Comprehensive test suite.

---

## 9. Project structure

```
codeprobe/
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE                          # MIT
├── .codeprobe.yml.example           # example config
│
├── src/
│   ├── index.ts                     # CLI entry point
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── init.ts              # codeprobe init
│   │   │   ├── quiz.ts              # codeprobe quiz
│   │   │   ├── status.ts            # codeprobe status
│   │   │   ├── scores.ts            # codeprobe scores
│   │   │   ├── achievements.ts      # codeprobe achievements
│   │   │   ├── leaderboard.ts       # codeprobe leaderboard
│   │   │   ├── knowledge-map.ts     # codeprobe knowledge-map
│   │   │   ├── team.ts              # codeprobe team *
│   │   │   ├── challenge.ts         # codeprobe challenge
│   │   │   ├── explain.ts           # codeprobe explain
│   │   │   ├── review-prep.ts       # codeprobe review-prep
│   │   │   └── config.ts            # codeprobe config
│   │   └── ui/
│   │       ├── quiz-renderer.ts     # terminal quiz UI
│   │       ├── results-renderer.ts  # score display
│   │       ├── progress-bar.ts      # XP bar, streaks
│   │       └── heatmap-renderer.ts  # ASCII heatmap
│   │
│   ├── core/
│   │   ├── analyzer/
│   │   │   ├── diff-parser.ts       # git diff parsing
│   │   │   ├── context-gatherer.ts  # reads related files, builds dependency graph
│   │   │   ├── pattern-detector.ts  # detects change patterns (new API, schema, etc.)
│   │   │   └── ai-detector.ts       # heuristics for AI-generated code detection
│   │   │
│   │   ├── quiz/
│   │   │   ├── question-generator.ts  # LLM prompt construction + response parsing
│   │   │   ├── quiz-session.ts        # manages quiz flow (ask, answer, score)
│   │   │   ├── answer-grader.ts       # grades free-text answers via LLM
│   │   │   └── difficulty-calibrator.ts # adjusts difficulty based on history
│   │   │
│   │   ├── scoring/
│   │   │   ├── xp-calculator.ts     # XP calculation with bonuses
│   │   │   ├── level-system.ts      # level thresholds and titles
│   │   │   ├── streak-tracker.ts    # daily streak logic
│   │   │   ├── achievement-engine.ts # badge detection and awarding
│   │   │   └── knowledge-scorer.ts  # per-module knowledge score calculation
│   │   │
│   │   ├── team/
│   │   │   ├── bus-factor.ts        # bus factor calculation per module
│   │   │   ├── knowledge-heatmap.ts # team-wide knowledge matrix
│   │   │   ├── leaderboard.ts       # XP rankings
│   │   │   └── sync.ts              # team score synchronization
│   │   │
│   │   └── git/
│   │       ├── hook-manager.ts      # install/uninstall git hooks
│   │       ├── trailer-writer.ts    # append quiz score to commit message
│   │       └── diff-reader.ts       # read git diff for various scenarios
│   │
│   ├── llm/
│   │   ├── provider.ts              # abstract LLM provider interface
│   │   ├── anthropic.ts             # Anthropic Claude integration
│   │   ├── openai.ts                # OpenAI integration
│   │   ├── ollama.ts                # Ollama (local) integration
│   │   └── prompts/
│   │       ├── question-generation.ts  # prompt templates for generating questions
│   │       ├── answer-grading.ts       # prompt templates for grading free-text
│   │       └── explanation.ts          # prompt templates for code explanation
│   │
│   ├── storage/
│   │   ├── database.ts              # SQLite setup and migrations
│   │   ├── score-store.ts           # CRUD for quiz results
│   │   ├── stats-store.ts           # aggregated statistics
│   │   └── achievement-store.ts     # badge persistence
│   │
│   ├── config/
│   │   ├── loader.ts                # load and validate .codeprobe.yml
│   │   ├── defaults.ts              # default configuration values
│   │   └── schema.ts                # config validation schema
│   │
│   └── types/
│       ├── quiz.ts                  # QuizSession, Question, QuestionResult types
│       ├── scoring.ts               # XP, Level, Achievement types
│       ├── analysis.ts              # DiffAnalysis, ChangedFile types
│       └── config.ts                # Configuration types
│
├── dashboard/                        # phase 2: web dashboard
│   ├── package.json
│   ├── server/
│   │   ├── index.ts                 # Express/Fastify server
│   │   ├── routes/
│   │   │   ├── leaderboard.ts
│   │   │   ├── heatmap.ts
│   │   │   ├── bus-factor.ts
│   │   │   ├── profile.ts
│   │   │   └── activity.ts
│   │   └── data/
│   │       └── aggregator.ts        # reads from SQLite, computes views
│   └── client/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── pages/
│       │   │   ├── Leaderboard.tsx
│       │   │   ├── Heatmap.tsx
│       │   │   ├── BusFactorAlerts.tsx
│       │   │   ├── Profile.tsx
│       │   │   └── ActivityFeed.tsx
│       │   └── components/
│       │       ├── KnowledgeHeatmap.tsx
│       │       ├── XPBar.tsx
│       │       ├── BadgeGrid.tsx
│       │       └── BusFactorCard.tsx
│       └── package.json
│
├── integrations/                     # phase 3
│   ├── slack/
│   │   └── bot.ts
│   ├── github/
│   │   └── action.yml
│   ├── claude-code/
│   │   └── SKILL.md
│   └── vscode/
│       └── extension.ts
│
├── hooks/                            # git hook scripts
│   └── pre-push.sh                  # shell script installed by `codeprobe init`
│
└── tests/
    ├── unit/
    │   ├── diff-parser.test.ts
    │   ├── question-generator.test.ts
    │   ├── xp-calculator.test.ts
    │   ├── knowledge-scorer.test.ts
    │   └── bus-factor.test.ts
    ├── integration/
    │   ├── quiz-flow.test.ts
    │   ├── git-hook.test.ts
    │   └── llm-integration.test.ts
    └── fixtures/
        ├── sample-diffs/
        ├── sample-repos/
        └── expected-questions/
```

---

## 10. API key & LLM cost management

### Cost estimation

- Average quiz session: ~5 questions.
- Prompt size: ~3000-5000 tokens (diff + context + instructions).
- Response size: ~1500 tokens (5 structured questions).
- Free-text grading: ~500 tokens per graded answer.
- Estimated cost per quiz: ~$0.01-0.03 (Claude Sonnet).
- Team of 10, 5 quizzes/day each: ~$1.50-4.50/day.

### Cost optimization strategies

- Cache question templates for identical diffs (same commit = same questions on retry).
- Batch multiple small diffs into one LLM call.
- Use cheaper models (Haiku) for easy questions, Sonnet for hard ones.
- Support Ollama for teams that want zero API cost (local LLM).
- Set a configurable monthly cost cap with warnings.

---

## 11. Privacy & security considerations

- **Code never leaves the developer's machine** unless explicitly configured for team sync.
- LLM API calls send only the diff + surrounding context, not the full repository.
- Sensitive files can be excluded via `skip_patterns` in config.
- Team sync can use local network only (no cloud dependency).
- API keys are read from environment variables, never stored in config files.
- Dashboard authentication is recommended for team deployments.
- All quiz data can be exported and deleted by the developer (`codeprobe data export`, `codeprobe data purge`).

---

## 12. Success metrics

| Metric | Target | How to measure |
|--------|--------|----------------|
| Adoption | >80% of team completing quizzes weekly | Dashboard activity metrics |
| Knowledge distribution | Bus factor ≥ 2 on all critical modules | Bus factor report |
| Quiz quality | >85% of developers rate questions as "fair and relevant" | Post-quiz optional feedback |
| Speed | Quiz generation < 10 seconds, full session < 3 minutes | Timing instrumentation |
| Knowledge retention | Score improvement over time per module per developer | Trend analysis |

---

## 13. Open questions for future consideration

1. **Multiplayer quiz mode**: Two developers quizzed on the same diff, competing in real time?
2. **Code review integration**: Should the reviewer also be quizzed on the PR they're reviewing?
3. **Spaced repetition**: Should the tool resurface questions on modules you haven't touched in a while?
4. **Custom question banks**: Should team leads be able to add their own questions about specific modules?
5. **Offline mode**: Queue quizzes when offline, sync when connected?
6. **IDE integration depth**: Should the quiz highlight specific lines in the editor as you answer?
7. **AI agent feedback loop**: Should quiz results feed back into AI agent prompts ("the developer doesn't understand auth module well, add extra comments")?