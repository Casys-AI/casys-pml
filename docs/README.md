# AgentsCards Documentation Index

**Last Updated:** 2025-11-11

---

## 📚 Table of Contents

- [Epic 3 Preparation Sprint](#epic-3-preparation-sprint)
  - [Architecture & Design](#architecture--design)
  - [Security & Sandboxing](#security--sandboxing)
  - [Research & Analysis](#research--analysis)
  - [Integration & Operations](#integration--operations)
- [Retrospectives](#retrospectives)
- [Project Status](#project-status)

---

## Epic 3 Preparation Sprint

### Architecture & Design

**[Architecture Spike - MCP Tools Injection](./spikes/architecture-spike-mcp-tools-injection.md)** ✅
- **Owner:** Winston (Architect)
- **Status:** Complete
- **Purpose:** Design how to inject MCP tools into isolated sandbox
- **Key Decisions:**
  - Option 2: API Bridge via Message Passing (recommended)
  - Worker isolation with zero permissions
  - Promise-based async API over postMessage
- **Deliverables:**
  - POC: `tests/poc/agentcards-bridge.ts`
  - Worker: `tests/poc/sandbox-worker.ts`
  - E2E Test: `tests/poc/sandbox-host-poc.test.ts`

**[Architecture Spike Summary](./spikes/architecture-spike-summary.md)** ✅
- Executive summary of architecture spike
- POC validation results
- Performance metrics: <1s total, message passing <10ms
- Ready for Story 3.2 implementation

**[MCP Integration Model](./mcp-integration-model.md)** ✅ **CRITICAL**
- **Owner:** Winston + Amelia
- **Status:** Complete
- **Purpose:** Document how AgentCards integrates with Claude Code
- **Key Content:**
  - Installation and configuration
  - MCP server management (add/remove)
  - Hot-reload support
  - User journey step-by-step

---

### Security & Sandboxing

**[Deno Sandbox POC Summary](./spikes/deno-sandbox-poc-summary.md)** ✅
- **Owner:** Amelia (Dev)
- **Status:** Complete
- **Purpose:** Proof-of-concept validation for secure code execution
- **Key Results:**
  - Basic execution: 30ms ✅
  - Async code: 100ms ✅
  - Permission isolation: 4/4 tests passing ✅
  - Performance targets met: <150ms ✅
- **POC Code:**
  - Executor: `tests/poc/deno-sandbox-executor.ts`
  - Tests: `tests/poc/deno-sandbox-poc.test.ts`
  - Simple tests: `tests/poc/deno-sandbox-simple-test.ts`

**[Deno Permissions Deep Dive](./spikes/deno-permissions-deep-dive.md)** ✅
- **Owner:** Amelia (Dev)
- **Status:** Complete
- **Purpose:** Comprehensive guide to Deno's permission system
- **Key Content:**
  - 7 permission types (read, write, net, env, run, ffi, hrtime)
  - Permission scoping and inheritance
  - Deny flags (explicit rejection)
  - Best practices for AgentCards sandbox
  - Security patterns and common pitfalls
  - Performance considerations
- **Relevance:** Story 3.1 (sandbox executor), Story 3.2 (workers)

**[Sandboxing Security Best Practices](./spikes/sandboxing-security-best-practices.md)** ✅
- **Owner:** Winston (Architect)
- **Status:** Complete
- **Purpose:** Security guidelines and threat model for code execution
- **Key Content:**
  - Threat model (10 attack scenarios)
  - Attack surface analysis
  - Defense-in-depth layers (6 layers)
  - Common vulnerabilities and mitigations
  - Security testing strategies
  - Incident response plan
- **Risk Level:** HIGH - Sandbox is highest-risk component
- **Relevance:** All Epic 3 stories, critical for Story 3.7 (security tests)

---

### Research & Analysis

**[PII Detection Research](./spikes/pii-detection-research.md)** ✅ **UPDATED**
- **Owner:** John (PM) + Winston (Architect)
- **Status:** Complete (Revised)
- **Purpose:** Evaluate PII detection approaches for Story 3.5
- **Original Recommendation:** Custom regex ❌
- **Final Recommendation:** **validator.js via npm** ✅
- **Rationale:**
  - Industry standard (93M weekly downloads)
  - Battle-tested, RFC5322 compliant, Luhn built-in
  - Zero maintenance burden
  - Deno 2 native npm support
- **Key Content:**
  - API examples and implementation guide
  - Comparative analysis (4 options evaluated)
  - Performance benchmarks (<10ms target)
  - UX strategy: Warn + Allow (default)
- **Scope (Priority 1 PII):**
  - Email: `validator.isEmail()`
  - Credit card: `validator.isCreditCard()`
  - Phone: `validator.isMobilePhone()`
  - IP address: `validator.isIP()`
  - SSN: `validator.matches()`

---

### Integration & Operations

**[MCP Integration Model](./mcp-integration-model.md)** ✅ **CRITICAL**
- Already listed above (critical blocker document)

**[Quick Start Guide](./guides/quick-start-guide.md)** ✅
- **Owners:** Sally (UX Designer) + Amelia (Dev)
- **Status:** Complete
- **Purpose:** Get AgentCards running in 10 minutes
- **Key Content:**
  - Installation (5 minutes)
  - Configuration (3 minutes)
  - First run (2 minutes)
  - First workflow example
  - Integration with Claude Code
  - Troubleshooting common issues
  - Use cases and examples
- **Target:** External users, onboarding

**[Test Infrastructure Extension Guide](./guides/test-infrastructure-extension-guide.md)** ✅
- **Owner:** Murat (TEA)
- **Status:** Complete
- **Purpose:** Guide for extending E2E test infrastructure
- **Key Content:**
  - Test patterns and templates
  - Sandbox-specific testing
  - Mocking vs real services
  - Debugging failed tests
  - Performance and load testing
  - CI/CD integration
- **Target:** Developers adding new tests

---

## Core Project Documents

**[Product Brief](./product-brief-AgentCards-2025-11-03.md)**
- Vision, problem statement, target users
- Value proposition and differentiation

**[Product Requirements Document (PRD)](./PRD.md)**
- Full product specification
- User journeys and acceptance criteria

**[Architecture](./architecture.md)**
- System architecture overview
- Component relationships

**[Epics](./epics.md)**
- Epic 1: MCP Gateway & Vector Search ✅
- Epic 2: DAG Execution & Production Readiness ✅
- Epic 3: Code Execution Sandbox ⏳

**[Market Research](./research-market-2025-11-11.md)**
- Market analysis (2025-11-11)
- Competitive landscape

**[Stories](./stories/)**
- Epic 1: story-1.1 to 1.8 ✅
- Epic 2: story-2.1 to 2.7 ✅
- Epic 3: story-3.1 to 3.8 ⏳

---

## Retrospectives

**[Epic 2 Retrospective - DAG Execution & Production Readiness](./retrospectives/epic-2-retro-2025-11-11.md)** ✅
- **Date:** 2025-11-11
- **Facilitator:** Bob (Scrum Master)
- **Epic Status:** 7/7 stories complete (100%)
- **Key Insights:**
  - Tests E2E robustes et maintenables ✅
  - Gap de validation utilisateur ⚠️
  - Gap de définition produit (modèle d'intégration MCP) ⚠️
  - Démoabilité non incluse comme critère de qualité ⚠️
- **Action Items:** 6 committed
- **Preparation Sprint:** 8 tasks, 6 completed (75%)
- **Next Steps:** Complete prep sprint → Start Epic 3

**[Epic 1 Retrospective](./retrospectives/epic-1-retro-2025-11-05.md)** ✅
- Epic 1: MCP Gateway & Vector Search retrospective

---

## Project Status

### Epic 3 Preparation Sprint Progress

**Status:** 8/8 items complete (100%) ✅ **SPRINT COMPLET!**

#### ✅ All Items Completed (5 days total)

1. ✅ Architecture spike - MCP tools injection (Winston, 1j)
2. ✅ Deno sandbox POC (Amelia, 1j)
3. ✅ PII detection research (John + Winston, 0.5j)
4. ✅ Deno permissions deep dive (Amelia, 0.5j)
5. ✅ Sandboxing security best practices (Winston, 0.5j)
6. ✅ Document modèle d'intégration MCP (Winston + Amelia, 1j) **CRITICAL**
7. ✅ Test infrastructure extension guide (Murat, 0.5j)
8. ✅ Quick Start Guide (Sally + Amelia, 0.5j)

**Technical readiness:** ✅ **READY FOR EPIC 3!**
**Documentation readiness:** ✅ **COMPLETE!**

**🎉 Preparation sprint terminé - Epic 3 peut commencer! 🚀**

---

## Document Organization

### Directory Structure

```
docs/
├── README.md                      # This index (start here!)
│
├── [Core project docs - Root Level]
│   ├── PRD.md                     # Product requirements
│   ├── architecture.md            # System architecture
│   ├── epics.md                   # Epic definitions
│   ├── mcp-integration-model.md   # MCP integration (CRITICAL)
│   ├── product-brief-AgentCards-2025-11-03.md
│   └── research-market-2025-11-11.md  # Market research (active)
│
├── blog/                          # Blog articles and thought pieces
│   ├── blog-article-1-gateway-and-dag-en.md
│   ├── blog-article-1-gateway-and-dag.md
│   ├── blog-article-2-sandbox-and-speculation-en.md
│   └── blog-article-2-sandbox-and-speculation.md
│
├── concepts/                      # Conceptual documents & explorations
│   ├── claude-ux-journey.md      # UX with GraphRAG + speculative execution
│   └── mcp-gateway-concepts.md   # Gateway concepts article
│
├── guides/                        # User and developer guides
│   ├── quick-start-guide.md      # 10-minute setup guide
│   └── test-infrastructure-extension-guide.md
│
├── research/                      # Initial research & planning
│   ├── brainstorming-session-results-2025-11-03.md
│   └── implementation-readiness-report-2025-11-03.md
│
├── spikes/                        # Technical spikes and POCs
│   ├── architecture-spike-mcp-tools-injection.md  # Epic 3
│   ├── architecture-spike-summary.md
│   ├── deno-permissions-deep-dive.md
│   ├── deno-sandbox-poc-summary.md
│   ├── graphrag-technical-implementation.md  # GraphRAG (implemented!)
│   ├── pii-detection-research.md
│   ├── sandboxing-security-best-practices.md
│   ├── tech-spec-epic-1.md       # Epic 1 tech spec
│   └── technical-analysis-dag-strategy.md  # DAG analysis
│
├── validation/                    # Validation reports
│   ├── validation-report-epic-1-final.md
│   ├── validation-report-epic-1-option1.md
│   └── validation-report-epic-1-option2.md
│
├── retrospectives/                # Sprint retrospectives
│   ├── epic-1-retro-2025-11-05.md
│   └── epic-2-retro-2025-11-11.md
│
├── stories/                       # User stories (Epic 1, 2, 3)
│   ├── story-1.1.md → story-1.8.md
│   ├── story-2.1.md → story-2.7.md
│   └── story-3.1.md → story-3.8.md
│
└── legacy/                        # Obsolete documents (archived)
    ├── claude-ux-journey-analysis-OBSOLETE.md
    └── option-d-graphrag-assisted-dag-OBSOLETE.md
```

### Document Categories

**📚 Core Docs (Root)**: Essential project documents - PRD, architecture, epics
**📝 Blog**: Published articles and thought pieces about AgentCards concepts
**💡 Concepts**: Exploratory documents and conceptual designs (may or may not be implemented)
**📖 Guides**: User and developer guides for using and extending AgentCards
**🔬 Research**: Initial brainstorming and planning documents
**🧪 Spikes**: Technical spikes, POCs, and deep-dive research
**✅ Validation**: Epic validation reports and decision documentation
**🔄 Retrospectives**: Sprint retrospectives with lessons learned
**📋 Stories**: User stories for each epic
**🗄️ Legacy**: Archived obsolete documents

---

### By Epic Phase

**Epic 3 - Code Execution Sandbox:**
- Architecture: [architecture-spike-mcp-tools-injection.md](./spikes/architecture-spike-mcp-tools-injection.md)
- Architecture: [architecture-spike-summary.md](./spikes/architecture-spike-summary.md)
- Security: [deno-permissions-deep-dive.md](./spikes/deno-permissions-deep-dive.md)
- Security: [sandboxing-security-best-practices.md](./spikes/sandboxing-security-best-practices.md)
- POC: [deno-sandbox-poc-summary.md](./spikes/deno-sandbox-poc-summary.md)
- Research: [pii-detection-research.md](./spikes/pii-detection-research.md)
- Integration: [mcp-integration-model.md](./mcp-integration-model.md)
- Guides: [quick-start-guide.md](./guides/quick-start-guide.md)
- Guides: [test-infrastructure-extension-guide.md](./guides/test-infrastructure-extension-guide.md)

**Epic 2 - DAG Execution:**
- Retrospective: [retrospectives/epic-2-retro-2025-11-11.md](./retrospectives/epic-2-retro-2025-11-11.md)

---

## Quick Links by Story

### Story 3.1 - Deno Sandbox Executor Foundation
- [Deno Sandbox POC Summary](./spikes/deno-sandbox-poc-summary.md)
- [Deno Permissions Deep Dive](./spikes/deno-permissions-deep-dive.md)
- [Sandboxing Security Best Practices](./spikes/sandboxing-security-best-practices.md)

### Story 3.2 - MCP Tools Injection
- [Architecture Spike - MCP Tools Injection](./spikes/architecture-spike-mcp-tools-injection.md)
- [Architecture Spike Summary](./spikes/architecture-spike-summary.md)
- [Deno Permissions Deep Dive](./spikes/deno-permissions-deep-dive.md) (Worker permissions)

### Story 3.3 - Result Serialization & Error Handling
- [Deno Sandbox POC Summary](./spikes/deno-sandbox-poc-summary.md) (Error handling patterns)
- [Sandboxing Security Best Practices](./spikes/sandboxing-security-best-practices.md) (Output sanitization)

### Story 3.4 - Execute Code Tool Gateway Integration
- [MCP Integration Model](./mcp-integration-model.md) **CRITICAL BLOCKER**
- [Architecture Spike Summary](./spikes/architecture-spike-summary.md)

### Story 3.5 - PII Detection & Tokenization
- [PII Detection Research](./spikes/pii-detection-research.md)
- [Sandboxing Security Best Practices](./spikes/sandboxing-security-best-practices.md) (Logging security)

### Story 3.6 - Execution Result Caching
- [Deno Sandbox POC Summary](./spikes/deno-sandbox-poc-summary.md) (Performance metrics)

### Story 3.7 - Integration Tests & Production Hardening
- [Sandboxing Security Best Practices](./spikes/sandboxing-security-best-practices.md) (Security testing)
- [Deno Permissions Deep Dive](./spikes/deno-permissions-deep-dive.md) (Testing permissions)
- [Test Infrastructure Extension Guide](./guides/test-infrastructure-extension-guide.md) (How to add tests)

---

## Contribution Guidelines

### Adding New Documentation

1. Create document in appropriate location (`docs/` or `docs/retrospectives/`)
2. Use consistent frontmatter:
   ```markdown
   # Document Title

   **Date:** YYYY-MM-DD
   **Owner:** Name (Role)
   **Status:** Draft | In Progress | Complete
   ```
3. Update this index with link and description
4. Add relevant tags/links in "Quick Links by Story" section

### Document Naming Convention

- Use kebab-case: `my-document-name.md`
- Be descriptive: `architecture-spike-mcp-tools-injection.md` not `arch-spike.md`
- Include type prefix for clarity: `poc-`, `retro-`, `research-`

---

## Archive

*(Documents moved to archive as they become obsolete will be listed here)*

---

**Document Status:** ✅ ACTIVE
**Maintained By:** Team
**Last Review:** 2025-11-11
