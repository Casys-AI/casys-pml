# Spike: Capability Chain - Blockchain DNS for Capabilities

**Date:** 2025-12-22
**Status:** exploration
**Author:** Erwan + Claude
**Related:** tech-spec-capability-naming-curation.md

---

## Contexte

Suite à l'élaboration de la tech spec sur le Capability Naming & Curation System (DNS-like), une idée émerge : pourquoi ne pas utiliser une vraie blockchain pour implémenter ce système ?

### Observation Clé

> "Plus le nom est explicite, plus la capability est bien faite, mieux ça devrait valoir cher"

Cette corrélation entre **qualité du nommage** et **valeur économique** suggère un marché naturel pour les capabilities, similaire aux noms de domaine DNS.

---

## Parallèle avec l'Existant Web3

| Web3 | Capability DNS |
|------|----------------|
| ENS (`vitalik.eth`) | Namespace (`stripe.cap`) |
| NFT | Capability ownership |
| Smart Contract | Licensing & revenue split |
| IPFS / Arweave | Code storage (immutable) |
| Token ($ETH, $ENS) | $CAP pour transactions |

---

## Architecture Proposée

### Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Capability Chain                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │  Registry   │    │  Licensing  │    │  Revenue    │             │
│  │  Contract   │    │  Contract   │    │  Splitter   │             │
│  │             │    │             │    │             │             │
│  │ - register  │    │ - grant     │    │ - auto-pay  │             │
│  │ - transfer  │    │ - revoke    │    │ - royalties │             │
│  │ - resolve   │    │ - terms     │    │ - deps      │             │
│  └─────────────┘    └─────────────┘    └─────────────┘             │
│         │                  │                  │                     │
│         └──────────────────┼──────────────────┘                     │
│                            │                                        │
│                    ┌───────▼───────┐                                │
│                    │  $CAP Token   │                                │
│                    │               │                                │
│                    │ - Pay calls   │                                │
│                    │ - Stake rep   │                                │
│                    │ - Governance  │                                │
│                    └───────────────┘                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │   IPFS / Arweave    │
                 │                     │
                 │  Code blobs         │
                 │  (immutable)        │
                 └─────────────────────┘
```

### Hiérarchie des Namespaces

```
                    ┌─────────────────────────────┐
                    │   PML Capability Registry    │
                    │   (on-chain)                 │
                    └─────────────────────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            │                    │                    │
            ▼                    ▼                    ▼
    ┌───────────────┐    ┌───────────────┐    ┌───────────────┐
    │ stripe.cap    │    │ vercel.cap    │    │ acme.cap      │
    │ (owned)       │    │ (owned)       │    │ (owned)       │
    └───────────────┘    └───────────────┘    └───────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
    billing.api.*        deploy.api.*         webapp.fs.*
    payments.api.*       edge.api.*           mobile.api.*
```

---

## Smart Contracts

### 1. CapabilityRegistry.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract CapabilityRegistry {

    struct Capability {
        string fqdn;              // "stripe.billing.api.create_invoice"
        address owner;
        string codeHash;          // IPFS CID (Qm...)
        uint256 pricePerCall;     // en $CAP (wei)
        uint8 qualityScore;       // 0-100
        address[] dependencies;   // Pour revenue split
        uint256 totalCalls;
        uint256 successfulCalls;
        uint256 stakedAmount;     // Skin in the game
        bool verified;
        uint256 createdAt;
        uint256 updatedAt;
    }

    struct Namespace {
        address owner;
        uint256 registeredAt;
        uint256 expiresAt;        // Renewal required
        bool verified;            // KYC/verified publisher
    }

    mapping(string => Capability) public capabilities;
    mapping(string => Namespace) public namespaces;
    mapping(string => string[]) public namespaceCapabilities;  // ns => fqdns

    // Events
    event NamespaceRegistered(string ns, address owner, uint256 price);
    event CapabilityPublished(string fqdn, address owner, string codeHash);
    event CapabilityUpdated(string fqdn, string newCodeHash, uint256 version);
    event CapabilityCalled(string fqdn, address caller, bool success);

    // === Namespace Management ===

    function registerNamespace(string memory ns) external payable {
        require(namespaces[ns].owner == address(0), "Already taken");
        require(msg.value >= namespacePrice(ns), "Insufficient payment");

        namespaces[ns] = Namespace({
            owner: msg.sender,
            registeredAt: block.timestamp,
            expiresAt: block.timestamp + 365 days,
            verified: false
        });

        emit NamespaceRegistered(ns, msg.sender, msg.value);
    }

    function namespacePrice(string memory ns) public pure returns (uint256) {
        uint256 len = bytes(ns).length;

        // Plus c'est court, plus c'est cher (comme ENS)
        if (len <= 3) return 1000 ether;    // "aws", "gcp", "ibm"
        if (len <= 5) return 100 ether;     // "stripe", "vercel"
        if (len <= 8) return 10 ether;      // "acme-corp"
        return 1 ether;                      // Longer names
    }

    function renewNamespace(string memory ns) external payable {
        require(namespaces[ns].owner == msg.sender, "Not owner");
        require(msg.value >= 1 ether, "Renewal fee required");

        namespaces[ns].expiresAt += 365 days;
    }

    function transferNamespace(string memory ns, address newOwner) external {
        require(namespaces[ns].owner == msg.sender, "Not owner");
        namespaces[ns].owner = newOwner;
    }

    // === Capability Management ===

    function publish(
        string memory fqdn,
        string memory codeHash,
        uint256 pricePerCall,
        address[] memory dependencies
    ) external payable {
        string memory ns = extractNamespace(fqdn);
        require(namespaces[ns].owner == msg.sender, "Not namespace owner");
        require(namespaces[ns].expiresAt > block.timestamp, "Namespace expired");
        require(msg.value >= 1 ether, "Minimum stake required");

        capabilities[fqdn] = Capability({
            fqdn: fqdn,
            owner: msg.sender,
            codeHash: codeHash,
            pricePerCall: pricePerCall,
            qualityScore: 50,  // Start neutral
            dependencies: dependencies,
            totalCalls: 0,
            successfulCalls: 0,
            stakedAmount: msg.value,
            verified: false,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        namespaceCapabilities[ns].push(fqdn);

        emit CapabilityPublished(fqdn, msg.sender, codeHash);
    }

    function updateCapability(
        string memory fqdn,
        string memory newCodeHash
    ) external {
        require(capabilities[fqdn].owner == msg.sender, "Not owner");

        capabilities[fqdn].codeHash = newCodeHash;
        capabilities[fqdn].updatedAt = block.timestamp;

        emit CapabilityUpdated(fqdn, newCodeHash, capabilities[fqdn].updatedAt);
    }

    // === Resolution (DNS Lookup) ===

    function resolve(string memory fqdn) external view returns (
        address owner,
        string memory codeHash,
        uint256 price,
        uint8 qualityScore,
        bool verified
    ) {
        Capability memory cap = capabilities[fqdn];
        require(cap.owner != address(0), "Capability not found");

        return (
            cap.owner,
            cap.codeHash,
            cap.pricePerCall,
            cap.qualityScore,
            cap.verified
        );
    }

    function resolveWithDeps(string memory fqdn) external view returns (
        Capability memory cap,
        address[] memory depOwners
    ) {
        cap = capabilities[fqdn];
        depOwners = new address[](cap.dependencies.length);

        for (uint i = 0; i < cap.dependencies.length; i++) {
            depOwners[i] = capabilities[string(abi.encodePacked(cap.dependencies[i]))].owner;
        }

        return (cap, depOwners);
    }

    // === Helpers ===

    function extractNamespace(string memory fqdn) internal pure returns (string memory) {
        bytes memory fqdnBytes = bytes(fqdn);
        uint256 dotIndex = 0;

        for (uint i = 0; i < fqdnBytes.length; i++) {
            if (fqdnBytes[i] == '.') {
                dotIndex = i;
                break;
            }
        }

        bytes memory ns = new bytes(dotIndex);
        for (uint i = 0; i < dotIndex; i++) {
            ns[i] = fqdnBytes[i];
        }

        return string(ns);
    }
}
```

### 2. RevenueSplitter.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./CapabilityRegistry.sol";

contract RevenueSplitter {
    CapabilityRegistry public registry;
    address public platformTreasury;

    // Revenue split percentages (basis points, 10000 = 100%)
    uint256 public constant OWNER_SHARE = 7000;      // 70%
    uint256 public constant PLATFORM_SHARE = 2500;   // 25%
    uint256 public constant DEPS_SHARE = 500;        // 5%

    event CallPaid(
        string fqdn,
        address caller,
        uint256 amount,
        uint256 ownerPaid,
        uint256 platformPaid,
        uint256 depsPaid
    );

    constructor(address _registry, address _treasury) {
        registry = CapabilityRegistry(_registry);
        platformTreasury = _treasury;
    }

    function payForCall(
        string memory fqdn,
        bool success
    ) external payable {
        (
            address owner,
            ,
            uint256 price,
            ,
        ) = registry.resolve(fqdn);

        require(msg.value >= price, "Insufficient payment");

        // Calculate shares
        uint256 ownerAmount = (msg.value * OWNER_SHARE) / 10000;
        uint256 platformAmount = (msg.value * PLATFORM_SHARE) / 10000;
        uint256 depsAmount = msg.value - ownerAmount - platformAmount;

        // Pay owner
        payable(owner).transfer(ownerAmount);

        // Pay platform
        payable(platformTreasury).transfer(platformAmount);

        // Pay dependencies (if any)
        // TODO: Implement dependency payment distribution

        // Update stats in registry
        registry.recordCall(fqdn, success);

        emit CallPaid(fqdn, msg.sender, msg.value, ownerAmount, platformAmount, depsAmount);
    }
}
```

### 3. QualityOracle.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract QualityOracle {
    CapabilityRegistry public registry;

    // Quality factors weights (basis points)
    uint256 public constant NAME_WEIGHT = 2500;      // 25%
    uint256 public constant USAGE_WEIGHT = 2500;     // 25%
    uint256 public constant SUCCESS_WEIGHT = 2500;   // 25%
    uint256 public constant STAKE_WEIGHT = 2500;     // 25%

    function calculateQualityScore(string memory fqdn) external view returns (uint8) {
        (
            ,
            ,
            ,
            ,
            ,
            ,
            uint256 totalCalls,
            uint256 successfulCalls,
            uint256 stakedAmount,
            ,
            ,
        ) = registry.capabilities(fqdn);

        uint256 score = 0;

        // Name explicitness (simplified - would need oracle for full analysis)
        uint256 nameScore = calculateNameScore(fqdn);
        score += (nameScore * NAME_WEIGHT) / 10000;

        // Usage score (log scale)
        uint256 usageScore = totalCalls > 0 ? min(log2(totalCalls) * 10, 100) : 0;
        score += (usageScore * USAGE_WEIGHT) / 10000;

        // Success rate
        uint256 successScore = totalCalls > 0
            ? (successfulCalls * 100) / totalCalls
            : 50;
        score += (successScore * SUCCESS_WEIGHT) / 10000;

        // Stake score (more stake = more skin in game)
        uint256 stakeScore = min(stakedAmount / 1 ether * 10, 100);
        score += (stakeScore * STAKE_WEIGHT) / 10000;

        return uint8(min(score, 100));
    }

    function calculateNameScore(string memory fqdn) internal pure returns (uint256) {
        bytes memory fqdnBytes = bytes(fqdn);
        uint256 dots = 0;
        uint256 underscores = 0;

        for (uint i = 0; i < fqdnBytes.length; i++) {
            if (fqdnBytes[i] == '.') dots++;
            if (fqdnBytes[i] == '_') underscores++;
        }

        // More structure = better name
        // stripe.billing.api.create_invoice_with_tax = excellent
        // util.x = poor

        uint256 score = 0;
        score += min(dots * 20, 40);           // Max 40 for hierarchy depth
        score += min(underscores * 10, 30);    // Max 30 for action clarity
        score += min(fqdnBytes.length, 30);    // Max 30 for descriptiveness

        return min(score, 100);
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function log2(uint256 x) internal pure returns (uint256) {
        uint256 result = 0;
        while (x > 1) {
            x >>= 1;
            result++;
        }
        return result;
    }
}
```

---

## Token Economics ($CAP)

### Utility

```
┌─────────────────────────────────────────────────────────────────────┐
│                        $CAP Token Utility                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. PAYMENT                                                          │
│     └── Payer les appels de capabilities                            │
│     └── Micro-transactions natives (pas de fees Stripe)             │
│                                                                      │
│  2. STAKING                                                          │
│     └── Stake requis pour publier (minimum 1 $CAP)                  │
│     └── Plus de stake = plus de trust visible                       │
│     └── Slashable si capability malveillante/buggy                  │
│                                                                      │
│  3. GOVERNANCE                                                       │
│     └── Vote sur quality score algorithm                            │
│     └── Vote sur platform fees (25% adjustable?)                    │
│     └── Dispute resolution pour noms contestés                      │
│                                                                      │
│  4. REPUTATION                                                       │
│     └── Stake history = track record                                │
│     └── Never-slashed bonus sur quality score                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Distribution Initiale (Exemple)

| Allocation | % | Vesting |
|------------|---|---------|
| Team & Advisors | 20% | 4 ans linear |
| Early Publishers | 15% | Airdrop aux premiers |
| Community Treasury | 30% | DAO controlled |
| Public Sale | 25% | Immediate |
| Ecosystem Fund | 10% | Grants, partnerships |

### Pricing Examples

| Capability | Quality | Tier | Prix/call |
|------------|---------|------|-----------|
| `stripe.billing.api.create_invoice_with_tax` | 95 | Premium | 0.003 $CAP |
| `vercel.deploy.api.preview_with_env` | 88 | Premium | 0.002 $CAP |
| `community.fs.read_json` | 45 | Free | 0 $CAP |
| `acme.util.misc.do_thing` | 23 | Free | 0 $CAP |

---

## Flow d'Utilisation

### 1. Publisher Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. Stripe veut publier des capabilities                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  a) Acheter namespace "stripe"                                       │
│     └── namespacePrice("stripe") = 100 $CAP (5 chars)               │
│     └── Transaction on-chain                                         │
│     └── stripe.cap owned by 0xStripe...                             │
│                                                                      │
│  b) Publier capability                                               │
│     └── Upload code to IPFS → CID: QmXyz...                         │
│     └── publish("stripe.billing.api.create_invoice", QmXyz, 0.003)  │
│     └── Stake: 10 $CAP (slashable)                                  │
│                                                                      │
│  c) Recevoir revenus                                                 │
│     └── Chaque appel: 70% de 0.003 $CAP = 0.0021 $CAP               │
│     └── Auto-paid par smart contract                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2. Consumer Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  2. Agent veut utiliser une capability                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  a) Discovery                                                        │
│     └── Browse registry ou search by tags                           │
│     └── Check quality score, usage stats, verified status           │
│                                                                      │
│  b) Resolution                                                       │
│     └── Gateway.resolve("stripe.billing.api.create_invoice")        │
│     └── Returns: owner, codeHash (IPFS CID), price, quality         │
│                                                                      │
│  c) Fetch & Execute                                                  │
│     └── Fetch code from IPFS                                        │
│     └── Execute in local sandbox                                    │
│     └── Report success/failure                                      │
│                                                                      │
│  d) Payment                                                          │
│     └── RevenueSplitter.payForCall(fqdn, success)                   │
│     └── 0.003 $CAP débité                                           │
│     └── Auto-split: 70% owner, 25% platform, 5% deps                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3. Governance Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  3. Dispute sur un nom                                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Scenario: Quelqu'un a squatté "google" namespace                   │
│                                                                      │
│  a) Google (real) dépose dispute                                     │
│     └── Stake 100 $CAP pour ouvrir dispute                          │
│     └── Provide proof (trademark, domain ownership)                 │
│                                                                      │
│  b) DAO vote                                                         │
│     └── Token holders votent                                        │
│     └── Quorum: 10% of circulating supply                           │
│     └── Duration: 7 days                                            │
│                                                                      │
│  c) Resolution                                                       │
│     └── If Google wins: namespace transferred, squatter loses stake │
│     └── If squatter wins: keeps namespace, Google loses dispute fee │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Avantages vs Centralisé

| Aspect | Centralisé (PML Cloud) | Blockchain (Capability Chain) |
|--------|------------------------|-------------------------------|
| **Propriété** | "Trust us" | Cryptographique, vérifiable |
| **Paiements** | Stripe fees (~3%) | Micro-payments natifs (<0.1%) |
| **Revenue split** | Manual, monthly | Automatique, instant |
| **Historique** | DB modifiable | Immuable, auditable |
| **Censorship** | Possible (ToS) | Résistant |
| **Disputes** | Support ticket | DAO governance |
| **Downtime** | Single point of failure | Décentralisé |
| **Lock-in** | Data portability? | Open, forkable |

---

## Risques & Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Gas fees élevés | UX dégradée | L2 (Arbitrum, Optimism, Base) |
| Volatilité $CAP | Prix imprévisibles | Stablecoin option (USDC) |
| Smart contract bugs | Perte de funds | Audits, bug bounty, upgradeable |
| Low adoption | Network effect faible | Incentives early publishers |
| Regulatory | Securities law | Utility token design, legal review |
| Squatting | Namesquatting massif | Dispute mechanism, trademark priority |

---

## Choix de Blockchain

| Option | Pros | Cons |
|--------|------|------|
| **Ethereum L1** | Sécurité max, adoption | Gas fees élevés |
| **Arbitrum** | Low fees, EVM compatible | Moins décentralisé |
| **Base** | Coinbase ecosystem, low fees | Nouveau, moins battle-tested |
| **Solana** | Ultra low fees, fast | Différent tooling, outages history |
| **Custom L2/Appchain** | Full control | Effort de dev, bootstrap |

**Recommendation:** Commencer sur **Base** ou **Arbitrum** pour les low fees + EVM compatibility, avec bridge vers L1 pour high-value namespaces.

---

## MVP Scope

### Phase 1: Core Registry (4-6 semaines)

- [ ] CapabilityRegistry.sol (namespace + capability management)
- [ ] Basic resolution (resolve by FQDN)
- [ ] IPFS integration pour code storage
- [ ] Simple frontend pour register/publish/browse

### Phase 2: Payments (2-3 semaines)

- [ ] RevenueSplitter.sol
- [ ] $CAP token (ERC-20)
- [ ] Pay-per-call flow
- [ ] Publisher dashboard (earnings)

### Phase 3: Quality & Trust (3-4 semaines)

- [ ] QualityOracle.sol
- [ ] Success/failure reporting
- [ ] Staking mechanism
- [ ] Verified publisher badges

### Phase 4: Governance (4-6 semaines)

- [ ] Dispute mechanism
- [ ] DAO voting
- [ ] Parameter governance (fees, etc.)

---

## Questions Ouvertes

1. **Code execution**: Local sandbox (download + execute) ou remote FaaS ?
   - Local: Plus rapide, privacy, mais trust issues
   - Remote: Controlled, metered, mais latence + centralisation

2. **Versioning on-chain**: Stocker toutes les versions ou juste latest ?
   - All versions: Immutabilité totale, mais storage cost
   - Latest only: Cheaper, mais perd historique

3. **L1 vs L2**: High-value namespaces sur L1, rest sur L2 ?

4. **Hybrid model**: Registry on-chain, code execution off-chain (comme ENS + websites) ?

5. **Interop**: Bridge avec autres chains ? Multi-chain deployment ?

---

## Next Steps

1. **Validate demand**: Survey potential publishers (Stripe, Vercel, etc.)
2. **Legal review**: Token classification, securities law
3. **Technical POC**: Deploy contracts on testnet
4. **Tokenomics modeling**: Simulation of supply/demand dynamics
5. **Community building**: Discord, early adopter program

---

## Références

- [ENS (Ethereum Name Service)](https://ens.domains/)
- [Arweave](https://www.arweave.org/) - Permanent storage
- [The Graph](https://thegraph.com/) - Indexing protocol
- [Uniswap Governance](https://gov.uniswap.org/) - DAO model
- tech-spec-capability-naming-curation.md (this repo)
