---
name: quiz
description: "Quiz yourself on any part of the codebase. Default: smart selection of unquizzed/weak modules. /quiz <path> for specific files. /quiz --diff for git diff mode. Tracks XP, streaks, and achievements."
---

# CodeProbe Quiz

Run an interactive quiz to test your understanding of the codebase. You are the quiz master — generate questions from the code, ask them one at a time, grade answers, and track the results.

## Step 1: Determine Source

**If invoked as `/quiz` with no argument (codebase exploration mode):**

This is the default — quiz the user on parts of the codebase they haven't covered or are weak on.

1. Run `node scripts/store.js stats` via Bash to get current stats including `moduleStats`.
2. Use Glob to scan the project for source files: `**/*.{ts,js,py,go,rs,java,rb,tsx,jsx}`. Exclude `node_modules/`, `dist/`, `build/`, `*.test.*`, `*.spec.*`, `__tests__/`, `*.lock`, `*.generated.*`.
3. Group the found files into modules (by their parent directory, e.g. `src/payments/refund.ts` → `src/payments`).
4. Select which module to quiz on using this priority:
   - **Never quizzed** — modules with no entry in `moduleStats` (highest priority)
   - **Weak** — modules where accuracy (correct/total) is below 70%
   - **Stale** — modules where `lastQuizDate` is oldest (quizzed longest ago)
   - If all modules are well-covered, pick one at random
5. Read 2-4 source files from the selected module using the Read tool.
6. Tell the user which module was selected: "Selected module: `{module}` (reason: {never quizzed / weak area / stale knowledge})"

**If invoked as `/quiz <path>`:**
1. Use the Read tool to read the specified file, or Glob + Read to read source files in the specified directory.
2. Use the file contents as the source — no diff needed.

**If invoked as `/quiz --diff`:**
1. Run `git diff HEAD` via Bash. If output is non-empty, use that diff as the source.
2. If git diff is empty, run `node scripts/store.js queue` via Bash to get queued files. If the queue is non-empty, read those files as the source.
3. If both are empty, tell the user: "No staged changes or queued files found. Use `/quiz` for codebase exploration or `/quiz <path>` for a specific module." and stop.

## Step 2: Analyze the Code

Read the source carefully. Identify:
- What changed or what the module does
- Key functions, their inputs/outputs, return values
- Side effects and dependencies on other files
- Data flow through the code
- Any architectural decisions

## Step 3: Generate 5 Questions

Create exactly **5 questions** with this format mix:
- **2 multiple choice** — 4 options labeled A/B/C/D, one correct. Wrong options must be plausible (not obviously wrong).
- **2 free text** — open-ended questions requiring the user to explain in their own words.
- **1 file picker** — present 4 file paths from the changed/related context and ask which one the user would modify for a given task.

Draw from these question types (mix them across the 5 questions):
- **Logic** — what does this function return or do in a specific scenario?
- **Impact** — what other parts of the system are affected by this change?
- **Flow** — trace the execution path through the code
- **Architecture** — why is it designed this way?
- **Debug** — what's missing or could go wrong?

Assign each question a difficulty: **Easy** / **Medium** / **Hard** based on reasoning required.

**Requirements:**
- At least 1 question must be about side effects or impact on other files
- At least 1 question must require understanding data flow, not just reading changed lines
- Questions must be answerable from the provided code context

## Step 4: Start the Quiz

Display this header:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CodeProbe: 5 questions on <brief description of source>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Step 5: Ask Questions One at a Time

For each question, display a **code snippet** followed by the question. The snippet gives the user context to reason about the answer.

```
Q{n}/5 [{Type} · {Difficulty}]

📄 {file_path}:{start_line}-{end_line}
┌─────────────────────────────────────
│ {relevant code snippet, 5-20 lines}
│ ...
└─────────────────────────────────────

{question text}

{options if multiple choice or file picker, labeled A/B/C/D or 1/2/3/4}
```

**Code snippet guidelines:**
- Show the most relevant 5-20 lines of code that the question is about
- Include the file path and line numbers so the user can locate the code
- For Logic/Debug questions: show the specific function or block being asked about
- For Impact/Flow questions: show the entry point or the connection between modules
- For Architecture questions: show the structural code (imports, class definition, interface)
- For file picker questions: you may omit the snippet since the question is about file locations
- Do NOT show the answer in the snippet — e.g. if asking "what does this return?", show the function body but make sure the answer requires understanding, not just reading the return statement

Wait for the user's answer before proceeding.

**Grading:**
- **Multiple choice**: Compare to the correct answer. Show ✓ or ✗ + explanation of the correct answer.
- **Free text**: Read the answer carefully. Grade based on whether the user demonstrates genuine understanding of the concept. Show ✓ or ✗ + what they got right or missed.
- **File picker**: Compare to the correct file. Show ✓ or ✗ + why that file is correct.

Show XP earned after each correct answer (Easy: +10, Medium: +25, Hard: +50).

## Step 6: Show Results and Save

After all 5 questions, display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Score: {correct}/5 ({pct}%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Build the result object and save it by running via Bash:
```
node scripts/store.js record '<json>'
```

Where `<json>` is:
```json
{
  "module": "<path or description of source>",
  "score": <correct/5 as decimal>,
  "correct": <number correct>,
  "durationSeconds": <approximate seconds elapsed>,
  "questions": [
    {"difficulty": "<easy|medium|hard>", "correct": <true|false>},
    ...one entry per question...
  ]
}
```

The store.js record command outputs JSON like:
```json
{"xpEarned":135,"xp":1385,"level":7,"levelTitle":"Apprentice","streak":5,"longestStreak":12,"totalQuizzes":34,"moduleStats":{...}}
```

Parse that output. Compare `level` in the output to your pre-quiz estimate of the old level to detect a level-up. Display:
```
+{xpEarned} XP  ·  🔥 Streak: {streak} days  ·  Level {level} {levelTitle}
```

If the level changed from before (new level > old level in the output), add:
```
🎉 LEVEL UP! You are now Level {level} {levelTitle}!
```

Finally, clear the queue:
```
node scripts/store.js queue-clear
```
