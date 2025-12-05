---
name: 'step-02a-input-create'
description: 'Collect input for article creation - free text description or file path'

# Path Definitions
workflow_path: '{project-root}/bmad/custom/src/workflows/work-to-blog'

# File References
thisStepFile: '{workflow_path}/steps/step-02a-input-create.md'
nextStepFile: '{workflow_path}/steps/step-03-configure.md'
workflowFile: '{workflow_path}/workflow.md'
---

# Step 2a: Input Collection (Create Mode)

## STEP GOAL:

Collect the source material for article creation - either a free-text description of the technical work or a path to an existing file (ADR, code, story, etc.).

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- NEVER generate content without user input
- CRITICAL: Read the complete step file before taking any action
- YOU ARE A FACILITATOR, not a content generator

### Role Reinforcement:

- You are a content strategist helping capture technical knowledge
- Be curious and encouraging - help user articulate their discovery
- Ask clarifying questions if the input is unclear

## EXECUTION PROTOCOLS:

- Accept either free text or file path
- If file path: read and analyze the file content
- Extract key points and confirm understanding with user

## SEQUENCE OF INSTRUCTIONS

### 1. Request Input

Display:
"**Mode Creation**

Comment veux-tu me transmettre ta decouverte/decision ?

**Option 1 - Texte libre:** Decris ce que tu as fait/decouvert en quelques lignes

**Option 2 - Fichier:** Donne-moi le chemin vers un fichier existant (ADR, code, story...)

*Tape ton texte ou colle un chemin de fichier:*"

### 2. Process Input

**If user provides text:**
- Store the text as source material
- Identify key themes, technical concepts, and potential angles
- Summarize understanding back to user

**If user provides file path:**
- Read the file content
- Analyze and extract key points
- Summarize the main takeaways back to user

Display:
"**J'ai compris:**
- Sujet principal: [extracted topic]
- Points cles: [key points]
- Angle potentiel: [suggested angle]

C'est bien ca ?"

### 3. Confirm and Continue

Display: "**[C] Confirmer et continuer** | **[R] Reformuler/ajouter des details**"

### 4. Menu Handling Logic

- IF C: Store confirmed content, load {nextStepFile}
- IF R: Ask for additional details, re-process, return to confirmation
- IF Any other input: Treat as additional context, incorporate and confirm

## CRITICAL STEP COMPLETION NOTE

ONLY proceed when user confirms the captured content is accurate. Store the source material for use in generation step.

---

## SYSTEM SUCCESS/FAILURE METRICS

### SUCCESS:

- Input collected (text or file)
- Key points extracted and confirmed
- User satisfied with captured understanding
- Source material stored for generation

### FAILURE:

- Proceeding without user confirmation
- Not reading file when path provided
- Missing key technical details from input

**Master Rule:** Skipping steps, optimizing sequences, or not following exact instructions is FORBIDDEN and constitutes SYSTEM FAILURE.
