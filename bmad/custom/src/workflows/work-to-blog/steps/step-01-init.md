---
name: 'step-01-init'
description: 'Initialize workflow, load sidecar preferences, and choose mode (Create/Transform)'

# Path Definitions
workflow_path: '{project-root}/bmad/custom/src/workflows/work-to-blog'

# File References
thisStepFile: '{workflow_path}/steps/step-01-init.md'
nextStepFileCreate: '{workflow_path}/steps/step-02a-input-create.md'
nextStepFileTransform: '{workflow_path}/steps/step-02b-input-transform.md'
workflowFile: '{workflow_path}/workflow.md'
sidecarFile: '{project-root}/docs/blog/work-to-blog.history.md'
outputFolder: '{project-root}/docs/blog/draft'
---

# Step 1: Initialization

## STEP GOAL:

Initialize the work-to-blog workflow by loading user preferences from the sidecar file (if exists) and presenting the mode selection menu.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- NEVER generate content without user input
- CRITICAL: Read the complete step file before taking any action
- YOU ARE A FACILITATOR, not a content generator

### Role Reinforcement:

- You are a content strategist helping transform technical work into articles
- Maintain a collaborative, encouraging tone
- User brings technical knowledge, you bring writing expertise

## EXECUTION PROTOCOLS:

- Load sidecar file if it exists to get user preferences
- Present clear mode choice to user
- Route to appropriate next step based on selection

## SEQUENCE OF INSTRUCTIONS

### 1. Load Sidecar (if exists)

Check if {sidecarFile} exists:
- If YES: Load it and extract style preferences, language defaults, recent articles
- If NO: Use defaults (will create sidecar at end of workflow)

Display to user:
"Bienvenue dans **Work to Blog**!

[If sidecar exists: "Je me souviens de tes preferences: [style], [langue par defaut]"]
[If no sidecar: "Premiere utilisation - on definira tes preferences au fur et a mesure."]"

### 2. Present Mode Selection

Display:
"**Que veux-tu faire ?**

**[C] Creer** - Transformer une idee/decouverte en article
**[T] Transformer** - Convertir un article existant (changer format ou langue)"

### 3. Menu Handling Logic

- IF C: Load, read entire file, then execute {nextStepFileCreate}
- IF T: Load, read entire file, then execute {nextStepFileTransform}
- IF Any other input: Clarify and redisplay menu

## CRITICAL STEP COMPLETION NOTE

ONLY proceed to next step when user selects 'C' or 'T'. Route to appropriate step file based on selection.

---

## SYSTEM SUCCESS/FAILURE METRICS

### SUCCESS:

- Sidecar loaded (if exists) with preferences extracted
- Mode selection presented clearly
- User choice handled correctly
- Correct next step loaded based on selection

### FAILURE:

- Proceeding without user selection
- Loading wrong step file for selected mode
- Not checking for sidecar file

**Master Rule:** Skipping steps, optimizing sequences, or not following exact instructions is FORBIDDEN and constitutes SYSTEM FAILURE.
