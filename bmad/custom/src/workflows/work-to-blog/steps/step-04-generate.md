---
name: 'step-04-generate'
description: 'Generate the article using tech-blogger agent with web enrichment'

# Path Definitions
workflow_path: '{project-root}/bmad/custom/src/workflows/work-to-blog'

# File References
thisStepFile: '{workflow_path}/steps/step-04-generate.md'
nextStepFile: '{workflow_path}/steps/step-05-finalize.md'
workflowFile: '{workflow_path}/workflow.md'

# Template References
articleTemplate: '{workflow_path}/templates/article-template.md'
linkedinTemplate: '{workflow_path}/templates/linkedin-template.md'
styleGuide: '{workflow_path}/data/style-guide.md'
---

# Step 4: Generate Article

## STEP GOAL:

Generate the article draft using the tech-blogger persona, incorporating web search for enrichment if relevant sources exist.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- CRITICAL: Read the complete step file before taking any action
- Generate content based on collected input and configuration
- Use web search to enrich with external references when appropriate

### Role Reinforcement:

- ACTIVATE tech-blogger persona for generation
- Write in the configured language (FR or EN)
- Follow the appropriate template (LinkedIn or Article)

## EXECUTION PROTOCOLS:

- Load appropriate template based on format selection
- Load style guide for tone and structure
- Generate article with tech-blogger voice
- Optionally enrich with web references

## SEQUENCE OF INSTRUCTIONS

### 1. Load Generation Context

Gather from previous steps:
- Source material (text or file content)
- Target format (LinkedIn or Article)
- Target language (FR or EN)
- Refined angle (if elicitation was done)
- Style preferences (from sidecar if available)

### 2. Load Appropriate Template

- If LinkedIn: Load {linkedinTemplate}
- If Article: Load {articleTemplate}
- Load {styleGuide} for tone guidance

### 3. Optional Web Enrichment

If the topic could benefit from external references:
- Search for relevant recent articles, documentation, or discussions
- Extract 1-3 credible sources to reference
- DO NOT overdo - only if genuinely adds value

### 4. Generate Article

**Activate tech-blogger persona:**

Generate the article following the template structure:

**For LinkedIn:**
- Strong hook (first line that grabs attention)
- Story/discovery narrative (2-3 short paragraphs)
- Key takeaway (what reader should remember)
- Call to action (engage, comment, share)
- Relevant hashtags (3-5)

**For Article:**
- Engaging title
- Introduction with context
- Problem/challenge section
- Solution/discovery explanation
- Code examples if relevant
- Lessons learned
- Conclusion with next steps

### 5. Present Draft

Display the generated article in full:
"**Draft genere:**

---
[Full article content]
---

Qu'en penses-tu ?"

### 6. Auto-proceed to Finalize

Display: "**[C] Continuer vers finalisation**"

### 7. Menu Handling Logic

- IF C: Store generated draft, load {nextStepFile}
- IF user provides feedback: Incorporate and regenerate, then re-present

## CRITICAL STEP COMPLETION NOTE

Article generation is the core value of this workflow. Ensure quality output that matches the tech-blogger voice and selected format.

---

## SYSTEM SUCCESS/FAILURE METRICS

### SUCCESS:

- Article generated in correct format
- Correct language used throughout
- Template structure followed
- Tech-blogger voice maintained
- Web enrichment added if valuable

### FAILURE:

- Wrong format or language
- Generic AI voice instead of tech-blogger
- Missing key elements from template
- Over-reliance on web sources

**Master Rule:** Skipping steps, optimizing sequences, or not following exact instructions is FORBIDDEN and constitutes SYSTEM FAILURE.
