# AgentCards Documentation Index

**Last Updated:** 2025-12-03

---

## Core Documentation

### Product & Strategy

- **[PRD.md](./PRD.md)** - Product Requirements Document with business goals and requirements
- **[PRD-playground.md](./PRD-playground.md)** - Playground PRD for educational demo environment
- **[product-brief-AgentCards-2025-11-03.md](./product-brief-AgentCards-2025-11-03.md)** - Initial
  product vision and strategy brief

### Architecture & Technical Design

- **[architecture.md](./architecture.md)** - Decision Architecture with tech stack and design
  patterns
- **[mcp-integration-model.md](./mcp-integration-model.md)** - MCP gateway transparent proxy
  integration model
- **[mcp-control-tools-guide.md](./mcp-control-tools-guide.md)** - MCP meta-tools API for adaptive
  workflow control
- **[resilient-workflows.md](./resilient-workflows.md)** - Safe-to-fail branches and partial success
  patterns

### Epics & Planning

- **[epics.md](./epics.md)** - Complete epic breakdown with stories and acceptance criteria
- **[epics-playground.md](./epics-playground.md)** - Playground epic breakdown for educational
  notebooks
- **[tech-spec-epic-2.5.md](./tech-spec-epic-2.5.md)** - Technical spec for adaptive DAG feedback
  loops
- **[tech-spec-epic-3.md](./tech-spec-epic-3.md)** - Technical spec for sandbox code execution

### Status & Tracking

- **[sprint-status.yaml](./sprint-status.yaml)** - Current sprint tracking with story statuses
- **[sprint-status-playground.yaml](./sprint-status-playground.yaml)** - Playground sprint tracking
- **[bmm-workflow-status.yaml](./bmm-workflow-status.yaml)** - BMM workflow status for main project
- **[bmm-workflow-status-playground.yaml](./bmm-workflow-status-playground.yaml)** - BMM workflow
  status for playground
- **[engineering-backlog.md](./engineering-backlog.md)** - Engineering backlog with prioritized bugs
  and tech debt

### Reports & Validation

- **[validation-report-architecture-2025-11-13.md](./validation-report-architecture-2025-11-13.md)** -
  Architecture validation report (89% score)
- **[implementation-readiness-report-playground-2025-12-01.md](./implementation-readiness-report-playground-2025-12-01.md)** -
  Playground readiness assessment
- **[sprint-change-proposal-2025-11-26.md](./sprint-change-proposal-2025-11-26.md)** - ADR-022
  hybrid search integration proposal

---

## Subdirectories

### adrs/

Architecture Decision Records documenting key technical decisions.

- **[ADR-008-episodic-memory-adaptive-thresholds.md](./adrs/ADR-008-episodic-memory-adaptive-thresholds.md)** -
  Episodic memory for meta-learning (Phase 1 done)
- **[ADR-017-gateway-exposure-modes.md](./adrs/ADR-017-gateway-exposure-modes.md)** - Gateway tool
  exposure modes design
- **[ADR-027-execute-code-graph-learning.md](./adrs/ADR-027-execute-code-graph-learning.md)** -
  Execute code GraphRAG learning integration

#### adrs/ (continued)

- **[ADR-007-dag-adaptive-feedback-loops.md](./adrs/ADR-007-dag-adaptive-feedback-loops.md)** -
  DAG adaptive feedback with AIL/HIL replanning
- **[ADR-009-json-config-format.md](./adrs/ADR-009-json-config-format.md)** - JSON
  configuration format decision
- **[ADR-010-hybrid-dag-architecture.md](./adrs/ADR-010-hybrid-dag-architecture.md)** -
  Hybrid DAG architecture design
- **[ADR-011-sentry-integration.md](./adrs/ADR-011-sentry-integration.md)** - Sentry error
  tracking integration
- **[ADR-012-mcp-stdio-logging.md](./adrs/ADR-012-mcp-stdio-logging.md)** - MCP stdio
  logging approach
- **[ADR-013-tools-list-semantic-filtering.md](./adrs/ADR-013-tools-list-semantic-filtering.md)** -
  Semantic filtering for tools list
- **[ADR-014-http-sse-transport.md](./adrs/ADR-014-http-sse-transport.md)** - HTTP SSE
  transport layer decision
- **[ADR-015-dynamic-alpha-graph-density.md](./adrs/ADR-015-dynamic-alpha-graph-density.md)** -
  Dynamic alpha based on graph density
- **[ADR-016-repl-style-auto-return.md](./adrs/ADR-016-repl-style-auto-return.md)** -
  REPL-style auto-return for code execution
- **[ADR-018-command-handlers-minimalism.md](./adrs/ADR-018-command-handlers-minimalism.md)** -
  Minimalist command handlers design
- **[ADR-019-three-level-ail-architecture.md](./adrs/ADR-019-three-level-ail-architecture.md)** -
  Three-level AIL architecture (superseded by ADR-020)
- **[ADR-020-ail-control-protocol.md](./adrs/ADR-020-ail-control-protocol.md)** - AIL
  control protocol specification
- **[ADR-020-graceful-shutdown-timeout.md](./adrs/ADR-020-graceful-shutdown-timeout.md)** -
  Graceful shutdown timeout handling
- **[ADR-021-configurable-database-path.md](./adrs/ADR-021-configurable-database-path.md)** -
  Configurable database path support
- **[ADR-021-workflow-sync-missing-nodes.md](./adrs/ADR-021-workflow-sync-missing-nodes.md)** -
  Workflow sync missing nodes handling
- **[ADR-022-hybrid-search-integration.md](./adrs/ADR-022-hybrid-search-integration.md)** -
  Hybrid search integration in DAGSuggester
- **[ADR-023-dynamic-candidate-expansion.md](./adrs/ADR-023-dynamic-candidate-expansion.md)** -
  Dynamic candidate expansion algorithm
- **[ADR-024-adjacency-matrix-dependencies.md](./adrs/ADR-024-adjacency-matrix-dependencies.md)** -
  Adjacency matrix for dependency management
- **[ADR-025-mcp-streamable-http-transport.md](./adrs/ADR-025-mcp-streamable-http-transport.md)** -
  MCP streamable HTTP transport
- **[ADR-026-cold-start-confidence-formula.md](./adrs/ADR-026-cold-start-confidence-formula.md)** -
  Cold start confidence calculation formula

### api/

- **[events.md](./api/events.md)** - Real-time SSE events API for graph monitoring

### blog/

Blog articles and LinkedIn posts about AgentCards architecture.

- **[2024-12-03-claude-as-orchestrator.md](./blog/2024-12-03-claude-as-orchestrator.md)** - Part 4:
  Claude as strategic orchestrator
- **[blog-article-1-gateway-and-dag-en.md](./blog/blog-article-1-gateway-and-dag-en.md)** - Part 1:
  Semantic discovery and parallel execution
- **[linkedin-casys-adaptive-workflows.md](./blog/linkedin-casys-adaptive-workflows.md)** - Part 2:
  Adaptive workflows with AIL/HIL
- **[linkedin-casys-code-sandboxing.md](./blog/linkedin-casys-code-sandboxing.md)** - Part 3: Code
  sandboxing with MCP tools injection

#### blog/drafts/

- **[blog-article-2-sandbox-and-adaptive-loops-OLD.md](./blog/drafts/blog-article-2-sandbox-and-adaptive-loops-OLD.md)** -
  Draft: Sandbox and adaptive loops (archived)
- **[blog-article-2-sandbox-and-speculation-OLD.md](./blog/drafts/blog-article-2-sandbox-and-speculation-OLD.md)** -
  Draft: Sandbox and speculation (archived)
- **[blog-article-4-human-in-the-loop-DRAFT-ARCHIVED.md](./blog/drafts/blog-article-4-human-in-the-loop-DRAFT-ARCHIVED.md)** -
  Draft: Human-in-the-loop (archived)
- **[blog-article-4-self-improving-agent-DRAFT.md](./blog/drafts/blog-article-4-self-improving-agent-DRAFT.md)** -
  Draft: Self-improving agent

### concepts/

- **[mcp-gateway-concepts.md](./concepts/mcp-gateway-concepts.md)** - MCP gateway scalability
  challenges and solutions

### user-docs/

- **[getting-started.md](./user-docs/getting-started.md)** - Quick start guide for AgentCards

### legacy/

Archived and obsolete documentation.

- **[claude-ux-journey.md](./legacy/claude-ux-journey.md)** - GraphRAG UX journey with speculative
  execution
- **[claude-ux-journey-analysis-OBSOLETE.md](./legacy/claude-ux-journey-analysis-OBSOLETE.md)** -
  Obsolete UX journey analysis
- **[option-d-graphrag-assisted-dag-OBSOLETE.md](./legacy/option-d-graphrag-assisted-dag-OBSOLETE.md)** -
  Obsolete GraphRAG-assisted DAG option
- **[validation-report-epic-1-final.md](./legacy/validation-report-epic-1-final.md)** - Epic 1 final
  validation report
- **[validation-report-epic-1-option1.md](./legacy/validation-report-epic-1-option1.md)** - Epic 1
  option 1 validation
- **[validation-report-epic-1-option2.md](./legacy/validation-report-epic-1-option2.md)** - Epic 1
  option 2 validation

### research/

- **[brainstorming-session-results-2025-11-03.md](./research/brainstorming-session-results-2025-11-03.md)** -
  Initial brainstorming session with 50+ concepts
- **[implementation-readiness-report-2025-11-03.md](./research/implementation-readiness-report-2025-11-03.md)** -
  Phase 3 to 4 transition readiness assessment
- **[mcp-servers-playground-analysis.md](./research/mcp-servers-playground-analysis.md)** - MCP
  servers analysis for playground (no API key)
- **[research-market-2025-11-11.md](./research/research-market-2025-11-11.md)** - Market research:
  MCP gateway opportunity analysis
- **[research-technical-2025-11-13.md](./research/research-technical-2025-11-13.md)** - Technical
  research template

### retrospectives/

- **[epic-1-retro-2025-11-05.md](./retrospectives/epic-1-retro-2025-11-05.md)** - Epic 1
  retrospective (8/8 stories completed)
- **[epic-2-retro-2025-11-11.md](./retrospectives/epic-2-retro-2025-11-11.md)** - Epic 2
  retrospective
- **[epic-2.5-retro-2025-11-17.md](./retrospectives/epic-2.5-retro-2025-11-17.md)** - Epic 2.5
  retrospective
- **[epic-3-retrospective.md](./retrospectives/epic-3-retrospective.md)** - Epic 3 retrospective

### security/

- **[sandbox-security-audit.md](./security/sandbox-security-audit.md)** - Deno sandbox security
  audit report

### spikes/

Technical research spikes and proof-of-concepts.

- **[2025-11-26-dag-suggester-dependency-analysis.md](./spikes/2025-11-26-dag-suggester-dependency-analysis.md)** -
  DAGSuggester dependency ordering analysis
- **[2025-12-03-dynamic-mcp-composition.md](./spikes/2025-12-03-dynamic-mcp-composition.md)** -
  Dynamic MCP server composition spike
- **[architecture-spike-mcp-tools-injection.md](./spikes/architecture-spike-mcp-tools-injection.md)** -
  MCP tools injection into Deno sandbox
- **[architecture-spike-summary.md](./spikes/architecture-spike-summary.md)** - Architecture spike
  executive summary
- **[audit-complet-2025-11-24.md](./spikes/audit-complet-2025-11-24.md)** - Complete audit findings
- **[deno-permissions-deep-dive.md](./spikes/deno-permissions-deep-dive.md)** - Deno permissions
  model deep dive
- **[deno-sandbox-poc-summary.md](./spikes/deno-sandbox-poc-summary.md)** - Deno sandbox POC
  validation summary
- **[graphrag-technical-implementation.md](./spikes/graphrag-technical-implementation.md)** -
  GraphRAG with Graphology implementation guide
- **[pii-detection-research.md](./spikes/pii-detection-research.md)** - PII detection research
- **[sandboxing-security-best-practices.md](./spikes/sandboxing-security-best-practices.md)** -
  Sandboxing security best practices
- **[spike-agent-human-dag-feedback-loop.md](./spikes/spike-agent-human-dag-feedback-loop.md)** -
  Agent-human DAG feedback loop patterns
- **[spike-binary-distribution.md](./spikes/spike-binary-distribution.md)** - Binary distribution
  strategy research
- **[spike-coala-comparison-adaptive-feedback.md](./spikes/spike-coala-comparison-adaptive-feedback.md)** -
  CoALA comparison for adaptive feedback
- **[spike-episodic-memory-adaptive-thresholds.md](./spikes/spike-episodic-memory-adaptive-thresholds.md)** -
  Episodic memory adaptive thresholds design
- **[spike-hybrid-dag-agent-delegation.md](./spikes/spike-hybrid-dag-agent-delegation.md)** - Hybrid
  DAG agent delegation patterns
- **[spike-mcp-workflow-state-persistence.md](./spikes/spike-mcp-workflow-state-persistence.md)** -
  MCP workflow state persistence design
- **[spike-search-tools-graph-traversal.md](./spikes/spike-search-tools-graph-traversal.md)** -
  Search tools graph traversal algorithms
- **[spike-smithery-integration.md](./spikes/spike-smithery-integration.md)** - Smithery Registry
  integration research
- **[tech-spec-epic-1.md](./spikes/tech-spec-epic-1.md)** - Epic 1 technical specification
- **[technical-analysis-dag-strategy.md](./spikes/technical-analysis-dag-strategy.md)** - DAG
  strategy technical analysis

### stories/

User stories with acceptance criteria and context files.

#### Epic 1 Stories

- **[story-1.1.md](./stories/story-1.1.md)** - Project setup and repository structure
- **[story-1.2.md](./stories/story-1.2.md)** - MCP servers configuration
- **[1-2-mcp-servers-configuration.md](./stories/1-2-mcp-servers-configuration.md)** - MCP servers
  configuration (alternate)
- **[story-1.3.md](./stories/story-1.3.md)** - Workflow templates configuration
- **[1-3-workflow-templates-configuration.md](./stories/1-3-workflow-templates-configuration.md)** -
  Workflow templates configuration (alternate)
- **[story-1.4.md](./stories/story-1.4.md)** - LLM API key setup script
- **[1-4-llm-api-key-setup-script.md](./stories/1-4-llm-api-key-setup-script.md)** - LLM API key
  setup (alternate)
- **[story-1.5.md](./stories/story-1.5.md)** - Semantic vector search implementation
- **[story-1.6.md](./stories/story-1.6.md)** - On-demand schema loading optimization
- **[story-1.7.md](./stories/story-1.7.md)** - Migration tool agentcards init
- **[story-1.8.md](./stories/story-1.8.md)** - Basic logging and telemetry backend

#### Epic 2 Stories

- **[story-2.1.md](./stories/story-2.1.md)** - Dependency graph construction (DAG builder)
- **[story-2.2.md](./stories/story-2.2.md)** - Parallel execution engine
- **[story-2.3.md](./stories/story-2.3.md)** - SSE streaming for progressive results
- **[story-2.4.md](./stories/story-2.4.md)** - MCP gateway integration with Claude Code
- **[story-2.5.md](./stories/story-2.5.md)** - Health checks and MCP server monitoring
- **[story-2.6.md](./stories/story-2.6.md)** - Error handling and resilience
- **[story-2.7.md](./stories/story-2.7.md)** - End-to-end tests and production hardening

#### Epic 2.5 Stories

- **[story-2.5-1.md](./stories/story-2.5-1.md)** - ControlledExecutor foundation
- **[story-2.5-2.md](./stories/story-2.5-2.md)** - Checkpoint and resume infrastructure
- **[story-2.5-3.md](./stories/story-2.5-3.md)** - AIL/HIL integration with DAG replanning
- **[story-2.5-4.md](./stories/story-2.5-4.md)** - GraphRAG meta-learning integration

#### Epic 3 Stories

- **[story-3.1.md](./stories/story-3.1.md)** - Deno sandbox executor foundation
- **[story-3.2.md](./stories/story-3.2.md)** - MCP tools injection into code context
- **[story-3.3.md](./stories/story-3.3.md)** - Virtual filesystem for sandbox
- **[story-3.4.md](./stories/story-3.4.md)** - agentcards:execute_code MCP tool
- **[story-3.5.md](./stories/story-3.5.md)** - Safe-to-fail branches and resilience
- **[story-3.6.md](./stories/story-3.6.md)** - Sandbox metrics and telemetry
- **[story-3.7.md](./stories/story-3.7.md)** - Code execution timeout handling
- **[story-3.8.md](./stories/story-3.8.md)** - Memory limits enforcement
- **[story-3.9.md](./stories/story-3.9.md)** - Sandbox security hardening

#### Epic 3.5 Stories (Speculation)

- **[3.5-1-dag-suggester-speculative-execution.md](./stories/3.5-1-dag-suggester-speculative-execution.md)** -
  DAG suggester speculative execution
- **[3.5-2-confidence-based-speculation-rollback.md](./stories/3.5-2-confidence-based-speculation-rollback.md)** -
  Confidence-based speculation and rollback

#### Epic 4 Stories

- **[4-1d-controlledexecutor-integration.md](./stories/4-1d-controlledexecutor-integration.md)** -
  ControlledExecutor episodic events integration
- **[4-1e-dagsugggester-integration.md](./stories/4-1e-dagsugggester-integration.md)** -
  DAGSuggester episodic memory integration
- **[story-4.2.md](./stories/story-4.2.md)** - Adaptive learning integration

#### Epic 5 Stories (Ecosystem)

- **[story-5.1.md](./stories/story-5.1.md)** - Hybrid search (semantic + graph)
- **[story-5.2.md](./stories/story-5.2.md)** - Graph-based tool recommendations

#### Epic 6 Stories (Dashboard)

- **[6-1-real-time-events-stream-sse.md](./stories/6-1-real-time-events-stream-sse.md)** - Real-time
  SSE events stream
- **[6-2-interactive-graph-visualization-dashboard.md](./stories/6-2-interactive-graph-visualization-dashboard.md)** -
  Interactive graph visualization
- **[6-3-live-metrics-analytics-panel.md](./stories/6-3-live-metrics-analytics-panel.md)** - Live
  metrics and analytics panel
- **[6-4-graph-explorer-search-interface.md](./stories/6-4-graph-explorer-search-interface.md)** -
  Graph explorer search interface

#### Other Stories

- **[tech-rename-to-mcp-gateway.md](./stories/tech-rename-to-mcp-gateway.md)** - Technical story:
  rename to MCP Gateway

#### stories/drafts/epic-2.5-old/

Archived Epic 2.5 story drafts.

- **[README.md](./stories/drafts/epic-2.5-old/README.md)** - Archive readme
- **[story-2.5-1.md](./stories/drafts/epic-2.5-old/story-2.5-1.md)** - Old story 2.5-1 draft
- **[story-2.5-2.md](./stories/drafts/epic-2.5-old/story-2.5-2.md)** - Old story 2.5-2 draft
- **[story-2.5-3.md](./stories/drafts/epic-2.5-old/story-2.5-3.md)** - Old story 2.5-3 draft
- **[story-2.5-4.md](./stories/drafts/epic-2.5-old/story-2.5-4.md)** - Old story 2.5-4 draft
- **[story-2.5-5.md](./stories/drafts/epic-2.5-old/story-2.5-5.md)** - Old story 2.5-5 draft
- **[story-2.5-6.md](./stories/drafts/epic-2.5-old/story-2.5-6.md)** - Old story 2.5-6 draft

### validation/

Empty directory for validation artifacts.

---

## Quick Links

- **Get Started**: [Getting Started](./user-docs/getting-started.md)
- **Architecture**: [Decision Architecture](./architecture.md)
- **Current Sprint**: [Sprint Status](./sprint-status.yaml)
- **Backlog**: [Engineering Backlog](./engineering-backlog.md)
