# Story 3.6: PII Detection & Tokenization

**Epic:** 3 - Agent Code Execution & Local Processing
**Story ID:** 3.6
**Status:** drafted
**Estimated Effort:** 5-7 heures

---

## User Story

**As a** security-conscious user,
**I want** personally identifiable information (PII) automatically detected and tokenized,
**So that** sensitive data never reaches the LLM context.

---

## Acceptance Criteria

1. ✅ PII detection module créé (`src/sandbox/pii-detector.ts`)
2. ✅ Patterns detected: emails, phone numbers, credit cards, SSNs, API keys
3. ✅ Tokenization strategy: Replace PII with `[EMAIL_1]`, `[PHONE_1]`, etc.
4. ✅ Reverse mapping stored securely (in-memory only, never persisted)
5. ✅ Agent receives tokenized data, can reference tokens in code
6. ✅ De-tokenization happens only for final output (if needed)
7. ✅ Opt-out flag: `--no-pii-protection` for trusted environments
8. ✅ Unit tests: Validate detection accuracy (>95% for common PII types)
9. ✅ Integration test: Email in dataset → tokenized → agent never sees raw email

---

## Tasks / Subtasks

### Phase 1: PII Detection Module (2-3h)

- [ ] **Task 1: Create PII detector** (AC: #1)
  - [ ] Créer `src/sandbox/pii-detector.ts` module
  - [ ] Créer classe `PIIDetector` avec detection logic
  - [ ] Créer interface `PIIMatch` avec type + position + value
  - [ ] Exporter module dans `mod.ts`

- [ ] **Task 2: Implement pattern detection** (AC: #2)
  - [ ] Email regex: `/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g`
  - [ ] Phone regex (US/CA): `/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g`
  - [ ] Credit card regex: `/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g`
  - [ ] SSN regex (US): `/\b\d{3}-\d{2}-\d{4}\b/g`
  - [ ] API key patterns: `/\b(sk|pk)_[a-zA-Z0-9]{32,}\b/g` (generic pattern)
  - [ ] Supporter custom patterns (configurable)

### Phase 2: Tokenization Strategy (2h)

- [ ] **Task 3: Implement tokenization** (AC: #3, #4)
  - [ ] Créer `TokenizationManager` classe
  - [ ] Replace detected PII avec tokens: `[EMAIL_1]`, `[PHONE_2]`, etc.
  - [ ] Maintenir reverse mapping: `{ "EMAIL_1": "alice@example.com" }`
  - [ ] Store mapping in-memory uniquement (no persistence to disk)
  - [ ] Générer unique token IDs (sequential counter par type)

- [ ] **Task 4: Agent code support** (AC: #5)
  - [ ] Agent reçoit données tokenizées
  - [ ] Agent peut référencer tokens dans code: `if (email === "[EMAIL_1]")`
  - [ ] Tokens survivent processing (remain in output)
  - [ ] Agent n'a jamais accès aux valeurs originales

### Phase 3: De-tokenization & Opt-Out (1-2h)

- [ ] **Task 5: De-tokenization for final output** (AC: #6)
  - [ ] Optionnel: de-tokenize result avant envoi au LLM
  - [ ] User peut décider: keep tokens OR restore original values
  - [ ] Default: keep tokens (plus sûr)
  - [ ] Flag: `detokenize: true` pour restoration

- [ ] **Task 6: Opt-out mechanism** (AC: #7)
  - [ ] CLI flag: `--no-pii-protection`
  - [ ] Config option: `pii_protection: false` dans config.yaml
  - [ ] Environment variable: `AGENTCARDS_NO_PII_PROTECTION=1`
  - [ ] Warning message si opt-out activé

### Phase 4: Testing & Validation (1-2h)

- [ ] **Task 7: Unit tests for detection accuracy** (AC: #8)
  - [ ] Test: Email detection >95% accuracy (true positives + false negatives)
  - [ ] Test: Phone number detection >95% accuracy
  - [ ] Test: Credit card detection >95% accuracy
  - [ ] Test: SSN detection >95% accuracy
  - [ ] Test: API key detection >90% accuracy (plus variabilité)
  - [ ] Test: False positives <5% (e.g., pas "test@test" comme email valide)

- [ ] **Task 8: Integration test** (AC: #9)
  - [ ] Test E2E: Dataset avec emails → tokenization → agent execution → verification
  - [ ] Valider: Agent code ne voit jamais email original
  - [ ] Valider: Tokens présents dans résultat final
  - [ ] Valider: De-tokenization fonctionne si demandée

---

## Dev Notes

### PII Detection Patterns

**Supported PII Types:**
| Type | Pattern | Example | Token Format |
|------|---------|---------|--------------|
| Email | `[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}` | alice@example.com | `[EMAIL_1]` |
| Phone (US) | `\d{3}[-.]?\d{3}[-.]?\d{4}` | 555-123-4567 | `[PHONE_1]` |
| Credit Card | `\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}` | 1234-5678-9012-3456 | `[CARD_1]` |
| SSN (US) | `\d{3}-\d{2}-\d{4}` | 123-45-6789 | `[SSN_1]` |
| API Key | `(sk|pk)_[a-zA-Z0-9]{32,}` | sk_test_abc123... | `[APIKEY_1]` |

**Regex Design Principles:**
- High precision (minimize false positives)
- Good recall (catch real PII)
- Performance: compiled regexes, cached

### Tokenization Architecture

**Flow:**
```
1. Data Source (MCP tool) → Raw Data (with PII)
2. PIIDetector.scan(data) → Identify PII locations
3. TokenizationManager.tokenize(data, matches) → Replace with tokens
4. Tokenized Data → Agent code execution
5. Agent output (with tokens)
6. [Optional] De-tokenize → Restore original values
7. Final output
```

**Security Model:**
- Original PII never persisted to disk
- Reverse mapping stored in-memory only
- Mapping cleared after execution completes
- No logs contain raw PII

### Example: Email Tokenization

**Input:**
```json
{
  "users": [
    { "name": "Alice", "email": "alice@example.com" },
    { "name": "Bob", "email": "bob@company.org" }
  ]
}
```

**After Tokenization:**
```json
{
  "users": [
    { "name": "Alice", "email": "[EMAIL_1]" },
    { "name": "Bob", "email": "[EMAIL_2]" }
  ]
}
```

**Reverse Mapping (in-memory):**
```typescript
{
  "EMAIL_1": "alice@example.com",
  "EMAIL_2": "bob@company.org"
}
```

**Agent Code (sees tokenized data):**
```typescript
const users = context.users;
const aliceEmail = users.find(u => u.name === "Alice").email;
// aliceEmail === "[EMAIL_1]" (agent never sees raw email)

return {
  emailDomain: "[EMAIL_1]".split('@')[1] // Fails gracefully, returns undefined
};
```

**De-tokenization (optional):**
```typescript
// Before: { emailDomain: undefined }
// After de-tokenization: { emailDomain: "example.com" }
```

### Project Structure Alignment

**New Module: `src/sandbox/pii-detector.ts`**
```
src/sandbox/
├── executor.ts           # Story 3.1
├── context-builder.ts    # Story 3.2
├── data-pipeline.ts      # Story 3.3
├── pii-detector.ts       # Story 3.5 (NEW)
└── types.ts              # Shared types
```

**Integration Points:**
- `src/sandbox/executor.ts`: Call PII detector before/after code execution
- `src/mcp/gateway-server.ts`: Enable/disable PII protection per request
- `src/config/loader.ts`: Load `pii_protection` config flag

### Testing Strategy

**Test Organization:**
```
tests/unit/sandbox/
├── pii_detector_test.ts        # Detection accuracy tests
├── tokenization_test.ts        # Tokenization logic tests
└── pii_integration_test.ts     # E2E PII flow tests

tests/fixtures/
└── pii-test-data.json          # Test datasets with known PII
```

**Accuracy Metrics:**
- **Precision**: `TP / (TP + FP)` >95%
- **Recall**: `TP / (TP + FN)` >95%
- **F1 Score**: `2 * (Precision * Recall) / (Precision + Recall)` >95%

**Test Data:**
```typescript
const testEmails = [
  { value: "alice@example.com", valid: true },
  { value: "bob.smith@company.co.uk", valid: true },
  { value: "not-an-email", valid: false },
  { value: "test@", valid: false },
  { value: "@test.com", valid: false }
];
```

### Learnings from Previous Stories

**From Story 3.1 (Sandbox):**
- Sandbox execution isolée
- Return value serialization (JSON-only)
[Source: stories/story-3.1.md]

**From Story 3.2 (Tools Injection):**
- Tool wrappers génèrent données brutes
- Data flows through sandbox
[Source: stories/story-3.2.md]

**From Story 3.3 (Data Pipeline):**
- Large datasets processed locally
- Metrics logging (input/output sizes)
[Source: stories/story-3.3.md]

**From Story 3.4 (execute_code Tool):**
- Gateway integration patterns
- MCP tool schema design
[Source: stories/story-3.4.md]

### Configuration Example

**config.yaml:**
```yaml
pii_protection:
  enabled: true
  types:
    - email
    - phone
    - credit_card
    - ssn
    - api_key
  detokenize_output: false  # Keep tokens in final output (safer)
```

**CLI Usage:**
```bash
# Enable PII protection (default)
./agentcards serve

# Disable PII protection (opt-out)
./agentcards serve --no-pii-protection

# Environment variable
AGENTCARDS_NO_PII_PROTECTION=1 ./agentcards serve
```

### Performance Considerations

**Regex Performance:**
- Pre-compile all regex patterns (once at startup)
- Use `exec()` in loop for multiple matches
- Target: <10ms overhead for 1MB dataset

**Memory Overhead:**
- Reverse mapping: ~100 bytes per token
- 1000 PII items → ~100KB memory (acceptable)

### Security Considerations

**Threat Model:**
1. **PII leakage to LLM**: Prevented by tokenization
2. **PII in logs**: Prevented by never logging raw values
3. **PII in telemetry**: Metrics exclude PII (only counts)

**Compliance:**
- GDPR-friendly (PII never leaves local machine)
- HIPAA consideration (medical PII not detected by default)
- Extensible for custom PII types

### Limitations & Future Work

**Current Scope:**
- Regex-based detection (fast but not ML-based)
- English-language PII patterns
- Common PII types only

**Future Enhancements (out of scope):**
- ML-based PII detection (higher accuracy)
- Multi-language support
- Medical PII (HIPAA compliance)
- Financial PII (IBAN, routing numbers)

### Out of Scope (Story 3.5)

- Result caching (Story 3.6)
- E2E documentation (Story 3.7)
- ML-based detection
- Multi-language support

### References

- [Epic 3 Overview](../epics.md#Epic-3-Agent-Code-Execution--Local-Processing)
- [Story 3.1 - Sandbox](./story-3.1.md)
- [Story 3.2 - Tools Injection](./story-3.2.md)
- [Story 3.3 - Data Pipeline](./story-3.3.md)
- [Story 3.4 - execute_code Tool](./story-3.4.md)

---

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

_To be filled by Dev Agent_

### Debug Log References

_Dev implementation notes, challenges, and solutions go here_

### Completion Notes List

_Key completion notes for next story (patterns, services, deviations) go here_

### File List

**Files to be Created (NEW):**
- `src/sandbox/pii-detector.ts`
- `tests/unit/sandbox/pii_detector_test.ts`
- `tests/unit/sandbox/tokenization_test.ts`
- `tests/unit/sandbox/pii_integration_test.ts`
- `tests/fixtures/pii-test-data.json`

**Files to be Modified (MODIFIED):**
- `src/sandbox/executor.ts` (integrate PII detection)
- `src/sandbox/types.ts` (add PII types)
- `src/mcp/gateway-server.ts` (add --no-pii-protection flag)
- `src/config/loader.ts` (load pii_protection config)
- `mod.ts` (export PII detector)

**Files to be Deleted (DELETED):**
- None

---

## Change Log

- **2025-11-09**: Story drafted by BMM workflow, based on Epic 3 requirements
