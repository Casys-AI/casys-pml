---
description: retrospective
auto_execution_mode: 1
---

# Retrospective - Epic Completion Review Workflow

name: "retrospective" description: "Run after epic completion to review overall success, extract
lessons learned, and explore if new information emerged that might impact the next epic" author:
"BMad"

config_source: "{project-root}/_bmad/bmm/config.yaml" output_folder: "{config_source}:output_folder"
user_name: "{config_source}:user_name" communication_language:
"{config_source}:communication_language" user_skill_level: "{config_source}:user_skill_level"
document_output_language: "{config_source}:document_output_language" date: system-generated
sprint_artifacts: "{config_source}:sprint_artifacts"

installed_path: "{project-root}/_bmad/bmm/workflows/4-implementation/retrospective" template: false
instructions: "{installed_path}/instructions.md"

required_inputs:

- agent_manifest: "{project-root}/_bmad/_config/agent-manifest.csv"

# Smart input file references - handles both whole docs and sharded docs

# Priority: Whole document first, then sharded version

# Strategy: SELECTIVE LOAD - only load the completed epic and relevant retrospectives

input_file_patterns: epics: description: "The completed epic for retrospective" whole:
"{output_folder}/_epic_.md" sharded_index: "{output_folder}/_epic_/index.md" sharded_single:
"{output_folder}/_epic_/epic-{{epic_num}}.md" load_strategy: "SELECTIVE_LOAD"
previous_retrospective: description: "Previous epic's retrospective (optional)" pattern:
"{sprint_artifacts}/**/epic-{{prev_epic_num}}-retro-_.md" load_strategy: "SELECTIVE_LOAD"
architecture: description: "System architecture for context" whole:
"{output_folder}/_architecture_.md" sharded: "{output_folder}/_architecture_/_.md" load_strategy:
"FULL_LOAD" prd: description: "Product requirements for context" whole: "{output_folder}/_prd_.md"
sharded: "{output_folder}/_prd_/_.md" load_strategy: "FULL_LOAD" document_project: description:
"Brownfield project documentation (optional)" sharded: "{output_folder}/_.md" load_strategy:
"INDEX_GUIDED"

# Required files

sprint_status_file: "{sprint_artifacts}/sprint-status.yaml || {output_folder}/sprint-status.yaml"
story_directory: "{sprint_artifacts}" retrospectives_folder: "{sprint_artifacts}"

standalone: true
