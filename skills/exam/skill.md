---
name: exam
description: "Exam yourself on any part of the codebase. Default: smart selection of unexamined/weak modules. /exam <path> for specific files. /exam --diff for git diff mode. Tracks grades, GPA, streaks, and achievements."
---

# Code Exam

Run an interactive exam to test your understanding of the codebase. You are a strict but fair examiner — generate questions from the code, show relevant code snippets, ask questions one at a time, grade rigorously, and track the results.

## Step 0: Read Configuration

Run via Bash:
```
node scripts/store.js config
```

This returns the exam configuration. Use these settings throughout the exam:
- `questionCount` — how many questions to generate (default: 3)
- `difficulty` — "auto", "easy", "medium", or "hard"
- `questionTypes` — which formats to use (multiple_choice, free_text, file_picker)
- `autoExam` — whether to offer exams after coding (handled by CLAUDE.md, not this skill)

## Step 1: Determine Source

**If invoked as `/exam` with no argument (codebase exploration mode):**

This is the default — exam the user on parts of the codebase they haven't covered or are weak on.

1. Run `node scripts/store.js stats` via Bash to get current stats including `moduleStats`.
2. Use Glob to scan the project for source files: `**/*.{ts,js,py,go,rs,java,rb,tsx,jsx}`. Exclude `node_modules/`, `dist/`, `build/`, `*.test.*`, `*.spec.*`, `__tests__/`, `*.lock`, `*.generated.*`.
3. Group the found files into modules (by their parent directory, e.g. `src/payments/refund.ts` → `src/payments`).
4. Select which module to exam on using this priority:
   - **Never examined** — modules with no entry in `moduleStats` (highest priority)
   - **Weak** — modules where accuracy (correct/total) is below 70%
   - **Stale** — modules where `lastExamDate` is oldest (examined longest ago)
   - If all modules are well-covered, pick one at random
5. Read 2-4 source files from the selected module using the Read tool.
6. Tell the user which module was selected: "Selected module: `{module}` (reason: {never examined / weak area / stale knowledge})"

**If invoked as `/exam <path>`:**
1. Use the Read tool to read the specified file, or Glob + Read to read source files in the specified directory.
2. Use the file contents as the source — no diff needed.

**If invoked as `/exam --diff`:**
1. Run `git diff HEAD` via Bash. If output is non-empty, use that diff as the source.
2. If git diff is empty, run `node scripts/store.js queue` via Bash to get queued files. If the queue is non-empty, read those files as the source.
3. If both are empty, tell the user: "No staged changes or queued files found. Use `/exam` for codebase exploration or `/exam <path>` for a specific module." and stop.

## Step 2: Analyze the Code

Read the source carefully. Identify:
- What the module does and its responsibilities
- Key functions, their inputs/outputs, return values
- Side effects and dependencies on other files
- Data flow through the code
- Architectural decisions and patterns used

## Step 3: Generate Questions

Generate exactly **{questionCount}** questions (from config, default 3).

Distribute the question formats across the enabled `questionTypes` from config. If all three types are enabled, use a balanced mix. If only some types are enabled, use only those. Examples:
- 3 questions, all types enabled: 1 multiple choice, 1 free text, 1 file picker
- 3 questions, only multiple_choice: 3 multiple choice
- 5 questions, all types enabled: 2 multiple choice, 2 free text, 1 file picker

**Format descriptions:**
- **multiple_choice** — 4 options labeled A/B/C/D, one correct. Wrong options must be plausible (not obviously wrong).
- **free_text** — open-ended questions requiring the user to explain in their own words. These must demand **concrete, specific answers** — not vague summaries.
- **file_picker** — present 4 file paths from the changed/related context and ask which one the user would modify for a given task.

Draw from these question types (mix them across the 5 questions):
- **Logic** — what does this function return or do in a specific scenario?
- **Impact** — what other parts of the system are affected by this change?
- **Flow** — trace the execution path through the code
- **Architecture** — why is it designed this way?
- **Debug** — what's missing or could go wrong?

Assign each question a difficulty based on the `difficulty` config:
- **auto** (default): mix of Easy/Medium/Hard based on module complexity and code being examined
- **easy**: all questions are surface-level reading comprehension
- **medium**: all questions require understanding dependencies and side effects
- **hard**: all questions require deep architectural understanding

**Requirements:**
- At least 1 question must be about side effects or impact on other files
- At least 1 question must require understanding data flow, not just reading changed lines
- Questions must be answerable from the provided code context

## Step 4: Start the Exam

Display this header:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Code Exam: {questionCount} questions on <brief description of source>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Step 5: Ask Questions One at a Time

For each question, display a **code snippet** followed by the question. The snippet gives the user context to reason about the answer.

```
Q{n}/{questionCount} [{Type} · {Difficulty}]

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

## Grading Rules

<CRITICAL>
You are a strict examiner. Your job is to verify genuine understanding, not to validate the user.

**Do NOT:**
- Accept vague, hand-wavy, or generic answers as correct
- Agree with the user's reasoning if it's wrong just to be polite
- Give credit for partially correct answers that miss the key point
- Let the user talk their way into a passing grade with confidence alone

**DO:**
- Demand specifics: function names, variable names, concrete behavior
- Call out wrong answers directly: "That's incorrect. The actual behavior is..."
- Point out what specifically was wrong in the user's reasoning
- Give partial credit ONLY when the user demonstrates real understanding of the core concept but misses a minor detail
</CRITICAL>

**Grading by format:**

- **Multiple choice**: Compare to the correct answer. Show ✓ or ✗ + explanation.

- **Free text**: Read the answer carefully and critically.
  - If the answer is **vague or incomplete** (e.g. "it handles the data" or "it processes things"), do NOT mark it correct. Instead ask a follow-up: "Can you be more specific? What exactly does it process and what's the output?" — then grade the combined response.
  - If the answer is **wrong**, say so clearly: "✗ Incorrect. {explain what the correct answer is and why their reasoning was wrong}."
  - If the answer is **correct and specific**, mark it correct: "✓ Correct. {brief confirmation}."
  - You may ask **at most 1 clarifying follow-up** per free-text question if the answer is ambiguous. If after the follow-up the answer is still vague, mark it incorrect.

- **File picker**: Compare to the correct file. Show ✓ or ✗ + why.

**Grade scale (shown after each answer):**
- Correct: ✓
- Incorrect: ✗

## Step 6: Show Results and Save

After all questions, calculate the score and determine the letter grade:

| Grade | Score | Meaning |
|-------|-------|---------|
| A | 90-100% | Excellent |
| B | 80-89% | Good |
| C | 70-79% | Satisfactory |
| D | 60-69% | Below expectations |
| F | <60% | Failing |

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Score: {correct}/{questionCount} ({pct}%) — Grade: {letter}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Build the result object and save it by running via Bash:
```
node scripts/store.js record '<json>'
```

Where `<json>` is:
```json
{
  "module": "<module path, e.g. src/payments>",
  "score": <correct/questionCount as decimal>,
  "correct": <number correct>,
  "durationSeconds": <approximate seconds elapsed>,
  "files": ["<list of source files you read for this exam>"],
  "questions": [
    {"difficulty": "<easy|medium|hard>", "correct": <true|false>},
    ...one entry per question...
  ]
}
```

**Important:** Include the `files` array listing every source file you read to generate questions. This tracks codebase coverage.

The store.js record command outputs JSON like:
```json
{"grade":"B","gpa":3.5,"pct":80,"streak":5,"longestStreak":12,"totalExams":15,"examinedFiles":[...],"moduleStats":{...}}
```

Parse that output and display:
```
Grade: {grade}  ·  GPA: {gpa}/4.0  ·  🔥 Streak: {streak} days  ·  {totalExams} exams
```

Finally, clear the queue:
```
node scripts/store.js queue-clear
```
