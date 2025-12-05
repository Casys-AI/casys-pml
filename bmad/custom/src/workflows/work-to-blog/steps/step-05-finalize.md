---
name: 'step-05-finalize'
description: 'Review draft, make revisions, and save to draft folder with sidecar update'

# Path Definitions
workflow_path: '{project-root}/bmad/custom/src/workflows/work-to-blog'

# File References
thisStepFile: '{workflow_path}/steps/step-05-finalize.md'
workflowFile: '{workflow_path}/workflow.md'
sidecarFile: '{project-root}/docs/blog/work-to-blog.history.md'
outputFolder: '{project-root}/docs/blog/draft'
---

# Step 5: Finalize and Save

## STEP GOAL:

Review the generated draft, allow revisions, save to the draft folder with proper naming, and update the sidecar file with article history and style preferences.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- NEVER save without user confirmation
- CRITICAL: Read the complete step file before taking any action
- YOU ARE A FACILITATOR helping polish the final output

### Role Reinforcement:

- You are a content editor helping finalize the article
- Support revisions with constructive suggestions
- Celebrate completion - this is the payoff!

## EXECUTION PROTOCOLS:

- Present draft for final review
- Handle revision requests
- Save with proper filename convention
- Update sidecar with article metadata

## SEQUENCE OF INSTRUCTIONS

### 1. Present Final Review Menu

Display:
"**Finalisation**

L'article est pret. Que veux-tu faire ?

**[S] Sauvegarder** - Enregistrer dans docs/blog/draft/
**[R] Reviser** - Demander des modifications
**[A] Autre format** - Generer aussi en [LinkedIn/Article]
**[X] Annuler** - Ne pas sauvegarder"

### 2. Handle User Choice

**IF S (Save):**
- Generate filename: `YYYY-MM-DD-[slug].md` or `YYYY-MM-DD-[slug].linkedin.md`
- Ask user for slug suggestion or generate from title
- Save file to {outputFolder}
- Proceed to sidecar update

**IF R (Revise):**
- Ask what to change
- Apply revisions
- Re-present the draft
- Return to this menu

**IF A (Another format):**
- Generate the alternate format
- Present both versions
- Allow saving one or both
- Return to this menu

**IF X (Cancel):**
- Confirm cancellation
- End workflow without saving

### 3. Save Article

Generate filename based on:
- Date: current date in YYYY-MM-DD format
- Slug: kebab-case from title or user input
- Extension: `.md` for Article, `.linkedin.md` for LinkedIn

Save to {outputFolder}

Display:
"**Article sauvegarde:**
`docs/blog/draft/[filename]`"

### 4. Update Sidecar

Update or create {sidecarFile} with:
- Last used date
- Article count increment
- New article entry in history
- Any style preferences learned

```markdown
---
lastUsed: [today's date]
totalArticles: [count + 1]
preferredLanguage: [most used]
---

## Style Preferences
[Updated based on this session if user expressed preferences]

## Article History
- [date]: [title] ([format], [language])
[previous entries...]
```

### 5. Completion Message

Display:
"**Workflow termine!**

Article sauvegarde: `[filepath]`
Historique mis a jour: `docs/blog/work-to-blog.history.md`

Bon courage pour la publication!

---
*Pour lancer a nouveau: `/work-to-blog`*"

## CRITICAL STEP COMPLETION NOTE

This is the final step. Ensure the article is saved correctly and sidecar is updated before ending the workflow.

---

## SYSTEM SUCCESS/FAILURE METRICS

### SUCCESS:

- Article saved with correct filename convention
- User confirmed save before writing
- Sidecar updated with new entry
- Completion message displayed
- Workflow ends gracefully

### FAILURE:

- Saving without user confirmation
- Wrong filename format
- Not updating sidecar
- Losing draft content

**Master Rule:** Skipping steps, optimizing sequences, or not following exact instructions is FORBIDDEN and constitutes SYSTEM FAILURE.
