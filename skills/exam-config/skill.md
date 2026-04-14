---
name: exam-config
description: "Configure your Code Exam preferences — number of questions, difficulty, question types, auto-exam behavior. Run /exam-config to customize."
---

# Code Exam — Configuration

Help the user configure their exam preferences through an interactive menu.

## Step 1: Read Current Config

Run via Bash:
```
node scripts/store.js config
```

This returns the current configuration:
```json
{
  "questionCount": 3,
  "difficulty": "auto",
  "questionTypes": ["multiple_choice", "free_text", "file_picker"],
  "autoExam": true
}
```

## Step 2: Present the Configuration Menu

Display the current settings and options:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Code Exam — Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current settings:

1. Questions per exam: {questionCount}
   Options: 1-10

2. Difficulty: {difficulty}
   Options: auto / easy / medium / hard

3. Question types: {questionTypes as comma-separated}
   Options: multiple_choice, free_text, file_picker
   (at least one must be selected)

4. Auto-exam after coding: {autoExam ? "on" : "off"}
   When on, Claude offers an exam after finishing coding tasks

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Which setting would you like to change? (1-4, or "done" to exit)
```

## Step 3: Handle User Choice

Wait for the user's response. For each setting:

**1. Questions per exam:**
Ask: "How many questions per exam? (1-10, currently {questionCount})"
Validate: must be integer 1-10. Save via:
```
node scripts/store.js config-set questionCount {value}
```

**2. Difficulty:**
Ask: "Which difficulty? (auto / easy / medium / hard, currently {difficulty})"
- **auto**: difficulty adapts based on module complexity and your past scores
- **easy**: surface-level reading comprehension questions
- **medium**: requires understanding dependencies and side effects
- **hard**: requires deep architectural understanding and tradeoff analysis
Save via:
```
node scripts/store.js config-set difficulty {value}
```

**3. Question types:**
Ask: "Which question types? List the ones you want, comma-separated. (currently: {types})"
- **multiple_choice**: 4 options, instant feedback
- **free_text**: explain in your own words, strictly graded
- **file_picker**: identify the correct file for a task
At least one must be selected. Save by updating the config:
```
node scripts/store.js config-set questionTypes {value}
```
Note: for array values, pass as comma-separated and the skill should write the full config object.

**4. Auto-exam:**
Ask: "Auto-exam after coding tasks? (on / off, currently {autoExam})"
Save via:
```
node scripts/store.js config-set autoExam {true|false}
```

## Step 4: Loop or Exit

After saving a setting, show the updated menu again and ask "Anything else to change? (1-4, or 'done')". When the user says "done", confirm:

```
Configuration saved. Your next exam will use these settings.
```
