---
title: "The Web of Capabilities: DNS for AI Skills"
slug: web-of-capabilities
date: 2025-12-23
category: vision
tags:
  - blockchain
  - dns
  - capabilities
  - web3
  - naming
snippet: "What if AI capabilities had addresses like websites? We're building a DNS for skills—where 'stripe.billing.create_invoice' is as discoverable as 'stripe.com'. Ownership on-chain, execution everywhere."
format: article
language: en
author: Erwan Lee Pesle
---

# The Web of Capabilities: DNS for AI Skills

> What DNS did for websites, we're doing for AI capabilities

## The Naming Problem

Today, when an AI agent discovers a useful capability, it gets an opaque ID:

```json
{
  "id": "abc123-def456",
  "code": "...",
  "score": 0.92
}
```

This is like the early internet before DNS—when you had to remember `142.250.80.46` instead of `google.com`.

**We need names.**

## Introducing Capability DNS

```
stripe.billing.api.create_invoice
  │       │     │        │
  org   project ns    action
```

Just like domain names, capability names are:
- **Hierarchical**: Organization → Project → Namespace → Action
- **Human-readable**: `stripe.billing` beats `abc123`
- **Unique**: No collisions, clear ownership
- **Tradeable**: Buy, sell, transfer namespaces

## Why Blockchain?

| Problem | Traditional DB | Blockchain |
|---------|---------------|------------|
| "Who owns 'stripe'?" | Trust us | Cryptographic proof |
| Transferring ownership | Manual process | Instant, self-service |
| Selling a namespace | Complex escrow | Native smart contracts |
| History | Modifiable | Immutable |
| Lock-in | Possible | Data is open |

The registry lives on **Base** (Coinbase's L2)—low fees, high credibility.

## The Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     ON-CHAIN (Base)                              │
│                                                                  │
│   CapabilityNameRegistry.sol                                     │
│   ├── register("stripe")  →  0xStripe... owns "stripe"          │
│   ├── transfer("stripe")  →  Sell to someone else               │
│   └── isOwner("stripe")   →  Verify ownership                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OFF-CHAIN (PML)                              │
│                                                                  │
│   Everything else:                                               │
│   ├── Capability code                                            │
│   ├── Execution (sandboxed)                                      │
│   ├── Stats, quality scores                                      │
│   └── The superhypergraph of relationships                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight**: Only names go on-chain. Everything else stays off-chain where it's fast and free.

## The Standard Library

PML ships with **200+ tools** ready to use under the `pml.*` namespace:

| Namespace | Examples |
|-----------|----------|
| `pml.json.*` | parse, query, merge, diff |
| `pml.crypto.*` | hash, encrypt, sign, verify |
| `pml.transform.*` | csv_to_json, xml_parse, yaml |
| `pml.datetime.*` | format, diff, timezone |
| `pml.geo.*` | distance, geocode, coordinates |
| `pml.faker.*` | users, companies, addresses |
| `pml.validation.*` | email, url, schema |

These are **free**—the foundation layer everyone builds on.

## Premium Namespaces

Companies can register their namespace and publish capabilities:

```
Stripe registers "stripe" → 0.05 ETH (~$150)
                    ↓
Stripe publishes:
├── stripe.billing.api.create_invoice
├── stripe.billing.api.list_invoices
├── stripe.payments.api.create_payment
└── stripe.connect.api.create_account
```

**Stripe controls their own billing**—API keys, subscriptions, whatever they want. PML just handles the names.

## The Superhypergraph

Capabilities don't live in isolation. They form a **web of relationships**:

```
stripe.billing.create_invoice
        │
        ├── depends_on → stripe.auth.verify_token
        ├── uses → pml.json.merge
        ├── similar_to → paypal.billing.create_invoice
        └── part_of → acme.deploy.full_pipeline
```

This graph enables:
- **Smart discovery**: "Find capabilities similar to X"
- **Dependency resolution**: "What else do I need?"
- **Quality signals**: "What do successful workflows use?"

## Pricing

| Action | Cost | Frequency |
|--------|------|-----------|
| Register 3-char namespace | 0.1 ETH | Once |
| Register 4-5 char | 0.05 ETH | Once |
| Register 6-8 char | 0.02 ETH | Once |
| Register 9+ char | 0.01 ETH | Once |
| Annual renewal | 0.005 ETH | Yearly |
| Transfer | Gas only (~$0.01) | Per transfer |

**Usage is free.** Publishers handle their own monetization.

## Why "Web of Capabilities"?

Because it's literally a web:
- **Nodes**: Capabilities (skills, tools, actions)
- **Edges**: Dependencies, compositions, similarities
- **Namespaces**: Ownership and trust boundaries
- **Discovery**: Like browsing, but for skills

Just as the web connected documents, the Web of Capabilities connects AI skills.

## What This Enables

### For Publishers
- **Own your namespace**: `yourcompany.*` is yours
- **Build reputation**: Quality scores, usage stats
- **Monetize directly**: Your API keys, your billing

### For Developers
- **Discover capabilities**: Search by name, not by ID
- **Trust signals**: Verified owner, success rates
- **Composability**: Build on top of existing capabilities

### For Agents
- **Callable names**: `stripe.billing.create_invoice` not `abc123`
- **Predictable structure**: Know what to expect from `*.api.*`
- **Cross-org discovery**: Find the best tool for the job

## Timeline

| Phase | Scope | Timeline |
|-------|-------|----------|
| **Phase 1** | Smart contract + testnet | 2 weeks |
| **Phase 2** | PML integration | 2 weeks |
| **Phase 3** | Frontend (register, manage) | 2 weeks |
| **Phase 4** | Production on Base mainnet | 1 week |

**7 weeks to the Web of Capabilities.**

## The Vision

```
Today:   AI agents use tools with opaque IDs
         └── "Call abc123 with these params"

Tomorrow: AI agents use named capabilities
         └── "Call stripe.billing.create_invoice"

Future:  AI agents discover and compose capabilities
         └── "Find the best way to process this payment"
              → Discovers stripe.*, compares with paypal.*
              → Checks quality scores, dependencies
              → Composes optimal workflow
```

**DNS made the internet navigable. Capability DNS makes AI skills navigable.**

---

*Building the Web of Capabilities at [PML](https://pml.cloud). Want to reserve your namespace? [Join the waitlist](#).*
