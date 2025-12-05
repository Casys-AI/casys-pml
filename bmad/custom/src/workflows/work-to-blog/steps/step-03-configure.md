---
name: 'step-03-configure'
description: 'Configure output format, language, and optionally refine the article angle'

# Path Definitions
workflow_path: '{project-root}/bmad/custom/src/workflows/work-to-blog'

# File References
thisStepFile: '{workflow_path}/steps/step-03-configure.md'
nextStepFile: '{workflow_path}/steps/step-04-generate.md'
workflowFile: '{workflow_path}/workflow.md'

# Task References
advancedElicitationTask: '{project-root}/bmad/core/tasks/advanced-elicitation.xml'
---

# Step 3: Configure Output

## STEP GOAL:

Configure the target format (LinkedIn or Article), language (FR or EN), and optionally use elicitation to refine the article's angle and key message.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- NEVER generate content without user input
- CRITICAL: Read the complete step file before taking any action
- YOU ARE A FACILITATOR, not a content generator

### Role Reinforcement:

- You are a content strategist helping optimize the article's impact
- Help user think about their audience and message
- Offer elicitation if user wants to refine their angle

## EXECUTION PROTOCOLS:

- Collect format and language choices
- Optionally engage in elicitation to sharpen the message
- Prepare all parameters for generation step

## SEQUENCE OF INSTRUCTIONS

### 1. Select Target Format

Display:
"**Configuration de l'article**

**Format de sortie:**
**[L] LinkedIn** - Post court, accrocheur, avec hook et CTA
**[A] Article detaille** - Structure complete, exemples de code, explications approfondies"

Wait for selection and store choice.

### 2. Select Target Language

Display:
"**Langue:**
**[FR] Francais**
**[EN] English**"

Wait for selection and store choice.

### 3. Offer Angle Refinement

Display:
"**Affiner l'angle ? (optionnel)**

Je peux t'aider a:
- Trouver le hook parfait pour accrocher ton audience
- Identifier le message cle a faire passer
- Structurer l'argumentation

**[E] Elicitation** - Quelques questions pour affiner
**[S] Skip** - Generer directement avec l'input actuel"

### 4. Handle Elicitation (if selected)

If E selected, engage in brief elicitation:
- "Quel est LE point que tu veux que les lecteurs retiennent ?"
- "Qui est ton audience cible ? (devs, managers, tous ?)"
- "Y a-t-il une action que tu veux qu'ils fassent apres lecture ?"

Incorporate answers into generation context.

### 5. Confirm Configuration

Display:
"**Configuration finale:**
- Format: [LinkedIn/Article]
- Langue: [FR/EN]
- Angle: [refined angle or 'based on input']

**[C] Generer l'article**"

### 6. Menu Handling Logic

- IF C: Store all configuration, load {nextStepFile}
- IF user wants to change something: Allow modification and re-confirm

## CRITICAL STEP COMPLETION NOTE

ONLY proceed when all configuration is confirmed. Pass format, language, and angle context to generation step.

---

## SYSTEM SUCCESS/FAILURE METRICS

### SUCCESS:

- Format selected (LinkedIn or Article)
- Language selected (FR or EN)
- Optional elicitation completed if requested
- All parameters ready for generation

### FAILURE:

- Proceeding without format/language selection
- Skipping elicitation when user selected it
- Not storing configuration for next step

**Master Rule:** Skipping steps, optimizing sequences, or not following exact instructions is FORBIDDEN and constitutes SYSTEM FAILURE.
