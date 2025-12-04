# User Documentation Workflow Instructions

<critical>The workflow execution engine is governed by: {project-root}/bmad/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {installed_path}/workflow.yaml</critical>
<critical>Communicate all responses in {communication_language} and language MUST be tailored to {user_skill_level}</critical>
<critical>Generate all documents in {document_output_language}</critical>
<critical>This workflow creates END-USER documentation, not technical/developer docs</critical>
<critical>Focus on clarity, practical examples, and task-based organization</critical>

<workflow>

<step n="0" goal="Initialize documentation context">

<action>Check if {docs_output_folder} exists, create if not</action>
<action>Check for existing project documentation (PRD, architecture, epics)</action>

<check if="PRD exists">
  <action>Load and extract: product goals, features, user types, key workflows</action>
</check>

<check if="architecture exists">
  <action>Load and extract: API endpoints, configuration options, system capabilities</action>
</check>

<ask>What type of documentation do you need to create?

**Available types:**
1. **Getting Started** - Quick start for new users (recommended first)
2. **User Guide** - Comprehensive usage documentation
3. **API Reference** - Technical API documentation for developers
4. **FAQ** - Frequently asked questions
5. **Troubleshooting** - Problem resolution guide
6. **Release Notes** - Version changelog
7. **All** - Create full documentation suite

You can select multiple (e.g., "1, 2, 4")</ask>

<action>Store selected doc types for workflow</action>

<ask>Who is the primary audience for this documentation?

1. **Beginner** - No prior experience assumed, step-by-step guidance
2. **Intermediate** - Basic familiarity expected, focus on features
3. **Advanced** - Technical users, concise reference-style
4. **Mixed** - Tiered content serving all levels

</ask>

<action>Store audience level to adapt writing style</action>

</step>

<step n="1" goal="Gather product knowledge" tag="research">

<action>Scan codebase for README, existing docs, comments</action>
<action>Identify main entry points and user-facing features</action>
<action>List all configuration options and their defaults</action>
<action>Document any CLI commands, API endpoints, or UI screens</action>

<ask>Please describe or confirm:
1. What does this product do in one sentence?
2. What are the 3-5 main things users will want to accomplish?
3. Are there any prerequisites users need before starting?
4. Any common pitfalls or gotchas to warn users about?</ask>

<action>Build knowledge base from responses and code analysis</action>

</step>

<step n="2" goal="Create Getting Started guide" condition="getting-started in selected_types">

<action>Load template: {getting_started_template}</action>

**Getting Started Structure:**

1. **Introduction** (2-3 sentences)
   - What is this product?
   - Who is it for?

2. **Prerequisites**
   - Required software/accounts
   - System requirements

3. **Installation/Setup**
   - Step-by-step instructions
   - Verification steps ("You should see...")

4. **Quick Start Tutorial**
   - One complete workflow from start to finish
   - Takes user from zero to first success
   - Include expected outputs/screenshots if applicable

5. **Next Steps**
   - Links to detailed documentation
   - Common next actions

<critical>Every step must be testable. User should never wonder "did it work?"</critical>
<critical>Use numbered steps, code blocks, and expected outputs</critical>

<invoke-task halt="true">{project-root}/bmad/core/tasks/adv-elicit.xml</invoke-task>

<action>Write getting-started.md to {getting_started_output}</action>

</step>

<step n="3" goal="Create User Guide" condition="user-guide in selected_types">

<action>Load template: {user_guide_template}</action>

**User Guide Structure:**

1. **Overview**
   - Product purpose and capabilities
   - Key concepts and terminology

2. **Core Features** (one section per major feature)
   - What it does
   - How to use it (step-by-step)
   - Examples with real values
   - Tips and best practices

3. **Configuration**
   - All configurable options
   - Default values and recommendations
   - Example configurations

4. **Workflows** (task-based organization)
   - Common tasks users want to accomplish
   - End-to-end procedures

5. **Tips & Best Practices**
   - Power user features
   - Performance optimization
   - Security considerations

<audience-adaptation>
- Beginner: More context, screenshots, detailed steps
- Intermediate: Focus on features, fewer basics
- Advanced: Reference-style, technical details
</audience-adaptation>

<invoke-task halt="true">{project-root}/bmad/core/tasks/adv-elicit.xml</invoke-task>

<action>Write user-guide.md to {user_guide_output}</action>

</step>

<step n="4" goal="Create API Reference" condition="api-reference in selected_types">

<action>Load template: {api_reference_template}</action>
<action>Scan codebase for API endpoints, SDK methods, CLI commands</action>

**API Reference Structure:**

1. **Authentication**
   - How to authenticate
   - Token/key management

2. **Endpoints/Methods** (for each)
   - Method signature/URL
   - Parameters (required/optional)
   - Request/response examples
   - Error codes and handling

3. **Rate Limits & Quotas**
   - Limits and how to handle them

4. **SDKs & Libraries**
   - Available language bindings
   - Installation instructions

5. **Code Examples**
   - Common use cases
   - Copy-paste ready snippets

<critical>Every endpoint/method needs a working example</critical>
<critical>Show both request AND response</critical>

<action>Write api-reference.md to {api_reference_output}</action>

</step>

<step n="5" goal="Create FAQ" condition="faq in selected_types">

<action>Load template: {faq_template}</action>

**FAQ Structure:**

1. **General Questions**
   - What is X? How does Y work?

2. **Getting Started Questions**
   - Installation issues, setup problems

3. **Usage Questions**
   - How do I...? Can I...?

4. **Technical Questions**
   - Performance, compatibility, limits

5. **Billing/Account Questions** (if applicable)

<ask>What are the most common questions users ask about this product?
List any support tickets, GitHub issues, or user feedback that reveals common confusion points.</ask>

<action>Generate Q&A pairs with clear, actionable answers</action>
<action>Write faq.md to {faq_output}</action>

</step>

<step n="6" goal="Create Troubleshooting Guide" condition="troubleshooting in selected_types">

<action>Load template: {troubleshooting_template}</action>

**Troubleshooting Structure:**

1. **Quick Diagnostics**
   - How to check if things are working
   - Health check commands/endpoints

2. **Common Issues** (for each)
   - Symptom: What user sees
   - Cause: Why it happens
   - Solution: Step-by-step fix
   - Prevention: How to avoid it

3. **Error Messages**
   - List of error codes/messages
   - What each means
   - How to resolve

4. **Getting Help**
   - How to report issues
   - What information to include
   - Support channels

<ask>What are the most common problems users encounter?
Include any known bugs, edge cases, or environmental issues.</ask>

<action>Write troubleshooting.md to {troubleshooting_output}</action>

</step>

<step n="7" goal="Create Release Notes" condition="release-notes in selected_types">

<action>Load template: {release_notes_template}</action>
<action>Check git history for recent changes</action>

**Release Notes Structure:**

For each version:

1. **Version Header**
   - Version number and date
   - Headline summary

2. **New Features**
   - User-facing improvements
   - Brief description + link to docs

3. **Improvements**
   - Performance, UX, stability

4. **Bug Fixes**
   - Issues resolved
   - Reference to issue numbers if public

5. **Breaking Changes** (if any)
   - What changed
   - Migration steps

6. **Known Issues**
   - Current limitations
   - Workarounds

<action>Write release-notes.md to {release_notes_output}</action>

</step>

<step n="8" goal="Review and finalize">

<action>Review all generated documentation for consistency</action>

**Documentation Quality Checklist:**

- [ ] All code examples are tested and work
- [ ] No placeholder text remains
- [ ] Consistent terminology throughout
- [ ] Links between documents work
- [ ] Appropriate for target audience level
- [ ] No jargon without explanation (for beginners)
- [ ] All steps are numbered and actionable
- [ ] Expected outputs shown where applicable

<ask>Would you like me to:
1. Review a specific document
2. Generate an index/table of contents
3. Add more examples to a section
4. Adjust the tone for a different audience
5. Finalize and complete</ask>

</step>

<step n="9" goal="Generate documentation index">

<action>Create index.md in {docs_output_folder} linking all generated docs</action>

**Index Format:**

```markdown
# {project_name} Documentation

## Quick Links
- [Getting Started](./getting-started.md) - New here? Start here!
- [User Guide](./user-guide.md) - Complete usage documentation
- [FAQ](./faq.md) - Common questions answered

## Reference
- [API Reference](./api-reference.md) - Technical API documentation
- [Troubleshooting](./troubleshooting.md) - Problem resolution

## Updates
- [Release Notes](./release-notes.md) - What's new
```

<output>**User Documentation Complete!**

**Documents Created:**
{{list of created documents with paths}}

**Next Steps:**
- Review generated documentation
- Add screenshots/diagrams where helpful
- Test all code examples
- Publish to your documentation platform

Would you like to refine any section?</output>

</step>

</workflow>
