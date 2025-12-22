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

Cette corrélation entre **qualité du nommage** et **valeur économique** suggère un marché naturel pour les **noms** de capabilities, similaire aux noms de domaine DNS.

### Scope Clarifié : Noms Only, Pas Usage

**Ce qu'on veut résoudre :**
- Qui a le droit de publier sous `stripe.*` ?
- Comment gérer les conflits de noms ?
- Comment transférer/vendre un namespace ?

**Ce qu'on ne veut PAS faire :**
- Monétiser chaque appel de capability (pay-per-call)
- S'insérer dans le billing des MCP existants

Les publishers (Stripe, Vercel, etc.) gèrent déjà leur propre monétisation via API keys. PML n'a pas à s'insérer là-dedans.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Stripe MCP  →  Stripe gère ses API keys + billing                  │
│  Vercel MCP  →  Vercel gère ses API keys + billing                  │
│                                                                      │
│  PML gère quoi ?                                                     │
│  └── Les NOMS (comme DNS gère les domaines, pas le trafic)          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Parallèle avec l'Existant Web3

| Web3 | Capability DNS |
|------|----------------|
| ENS (`vitalik.eth`) | Namespace (`stripe.cap`) |
| Domain ownership | Namespace ownership |
| Transfer/sell | Transfer/sell namespace |
| Expiration + renewal | Expiration + renewal |
| Dispute (UDRP-like) | Dispute mechanism |

**Note:** Contrairement à certains modèles web3, on ne tokenize PAS l'usage. Juste l'ownership des noms.

---

## Architecture Proposée (Simplifiée)

### Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ON-CHAIN (Blockchain)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              CapabilityNameRegistry.sol                      │    │
│  │                                                              │    │
│  │  - register(namespace)    → Acheter un namespace            │    │
│  │  - renew(namespace)       → Renouveler                      │    │
│  │  - transfer(namespace)    → Transférer/vendre               │    │
│  │  - isOwner(namespace)     → Vérifier ownership              │    │
│  │                                                              │    │
│  │  Données: { owner: address, expiresAt: timestamp }          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            │ isOwner("stripe", 0x...) ?
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     OFF-CHAIN (PML Infrastructure)                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │  Gateway    │    │  Capability │    │  Execution  │             │
│  │  Server     │    │  Store      │    │  (Workers)  │             │
│  │             │    │             │    │             │             │
│  │ - Verify    │    │ - Code      │    │ - Sandbox   │             │
│  │   ownership │    │ - Metadata  │    │ - Run       │             │
│  │ - Route     │    │ - Stats     │    │             │             │
│  └─────────────┘    └─────────────┘    └─────────────┘             │
│                                                                      │
│  Pas de blockchain ici - ta DB PostgreSQL normale                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Séparation Claire

| Layer | Responsabilité | Tech |
|-------|----------------|------|
| **On-chain** | Ownership des noms uniquement | Smart contract |
| **Off-chain** | Code, exécution, stats, tout le reste | PML (PostgreSQL) |

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

## Smart Contract (Un Seul, Simple)

### CapabilityNameRegistry.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title CapabilityNameRegistry
 * @notice Simple registry for capability namespace ownership
 * @dev Like ENS but for capability namespaces. Does NOT handle:
 *      - Capability code storage (off-chain)
 *      - Usage payments (publishers handle their own billing)
 *      - Execution (off-chain PML infrastructure)
 */
contract CapabilityNameRegistry {

    struct Namespace {
        address owner;
        uint256 registeredAt;
        uint256 expiresAt;
    }

    mapping(string => Namespace) public namespaces;

    // Events
    event NamespaceRegistered(string indexed ns, address indexed owner, uint256 price);
    event NamespaceRenewed(string indexed ns, uint256 newExpiry);
    event NamespaceTransferred(string indexed ns, address indexed from, address indexed to);

    // === Core Functions ===

    /**
     * @notice Register a new namespace
     * @param ns The namespace to register (e.g., "stripe", "vercel")
     */
    function register(string calldata ns) external payable {
        require(
            namespaces[ns].owner == address(0) ||
            namespaces[ns].expiresAt < block.timestamp,
            "Namespace taken"
        );
        require(msg.value >= price(ns), "Insufficient payment");

        namespaces[ns] = Namespace({
            owner: msg.sender,
            registeredAt: block.timestamp,
            expiresAt: block.timestamp + 365 days
        });

        emit NamespaceRegistered(ns, msg.sender, msg.value);
    }

    /**
     * @notice Renew namespace for another year
     * @param ns The namespace to renew
     */
    function renew(string calldata ns) external payable {
        require(namespaces[ns].owner == msg.sender, "Not owner");
        require(msg.value >= renewalPrice(), "Insufficient payment");

        namespaces[ns].expiresAt += 365 days;

        emit NamespaceRenewed(ns, namespaces[ns].expiresAt);
    }

    /**
     * @notice Transfer namespace to new owner (for sales, use escrow)
     * @param ns The namespace to transfer
     * @param to The new owner address
     */
    function transfer(string calldata ns, address to) external {
        require(namespaces[ns].owner == msg.sender, "Not owner");
        require(to != address(0), "Invalid address");

        address from = namespaces[ns].owner;
        namespaces[ns].owner = to;

        emit NamespaceTransferred(ns, from, to);
    }

    // === View Functions (called by PML Gateway) ===

    /**
     * @notice Check if address owns a namespace
     * @param ns The namespace to check
     * @param addr The address to verify
     * @return True if addr owns ns and it's not expired
     */
    function isOwner(string calldata ns, address addr) external view returns (bool) {
        Namespace memory n = namespaces[ns];
        return n.owner == addr && n.expiresAt > block.timestamp;
    }

    /**
     * @notice Get namespace owner
     * @param ns The namespace to query
     * @return owner The owner address (0x0 if not registered)
     * @return expiresAt Expiration timestamp
     */
    function getOwner(string calldata ns) external view returns (address owner, uint256 expiresAt) {
        Namespace memory n = namespaces[ns];
        return (n.owner, n.expiresAt);
    }

    /**
     * @notice Check if namespace is available
     * @param ns The namespace to check
     * @return True if available for registration
     */
    function isAvailable(string calldata ns) external view returns (bool) {
        Namespace memory n = namespaces[ns];
        return n.owner == address(0) || n.expiresAt < block.timestamp;
    }

    // === Pricing ===

    /**
     * @notice Get registration price based on length (shorter = more expensive)
     * @param ns The namespace to price
     * @return Price in wei
     */
    function price(string calldata ns) public pure returns (uint256) {
        uint256 len = bytes(ns).length;

        // Premium pricing for short names (like ENS)
        if (len <= 3) return 0.1 ether;    // "aws", "gcp", "ibm"
        if (len <= 5) return 0.05 ether;   // "stripe", "vercel"
        if (len <= 8) return 0.02 ether;   // "acme-corp"
        return 0.01 ether;                  // "my-random-startup"
    }

    /**
     * @notice Get renewal price (flat fee)
     * @return Price in wei
     */
    function renewalPrice() public pure returns (uint256) {
        return 0.005 ether;  // ~$15/year at current ETH prices
    }

    // === Admin (optional, for upgrades) ===

    /**
     * @notice Withdraw collected fees
     * @dev Could be DAO-controlled in the future
     */
    function withdraw(address to) external {
        // TODO: Add access control (owner, multisig, or DAO)
        payable(to).transfer(address(this).balance);
    }
}
```

### C'est Tout !

Pas besoin de :
- ~~RevenueSplitter.sol~~ → Les publishers gèrent leur billing
- ~~QualityOracle.sol~~ → PML calcule ça off-chain
- ~~$CAP Token~~ → On utilise ETH directement

---

## Économie Simplifiée

### Pas de Token Custom

On utilise ETH (ou le native token du L2 choisi) directement. Pas besoin de créer un token.

### Ce qui est Payant

| Action | Prix | Fréquence |
|--------|------|-----------|
| Enregistrer namespace 3 chars | 0.1 ETH | Une fois |
| Enregistrer namespace 4-5 chars | 0.05 ETH | Une fois |
| Enregistrer namespace 6-8 chars | 0.02 ETH | Une fois |
| Enregistrer namespace 9+ chars | 0.01 ETH | Une fois |
| Renouvellement annuel | 0.005 ETH | /an |
| Transfer (gas only) | ~$0.10 | Par transfer |

### Ce qui est Gratuit

| Action | Pourquoi gratuit |
|--------|------------------|
| Publier capability sous son namespace | Pas de friction |
| Utiliser une capability | Publishers gèrent leur billing |
| Discovery / resolution | Service de base |
| Vérifier ownership (isOwner) | View function = free |

### Revenue Model pour PML

```
Fees collectés par le smart contract
          │
          ▼
    PML Treasury
          │
          ├── Couvrir infra (servers, etc.)
          ├── Développement
          └── Future: DAO governance
```

---

## Flow d'Utilisation

### 1. Publisher Flow (Stripe veut publier)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ON-CHAIN (une seule fois)                                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Stripe achète namespace "stripe"                                 │
│     └── register("stripe") + 0.05 ETH                               │
│     └── Transaction confirmée                                        │
│     └── "stripe" owned by 0xStripe...                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  OFF-CHAIN (illimité, gratuit)                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  2. Stripe publie capabilities via PML API                           │
│     └── PML Gateway appelle isOwner("stripe", 0xStripe...) ✓        │
│     └── Autorisé à publier stripe.billing.api.*                     │
│     └── Code stocké dans PML (pas blockchain)                       │
│                                                                      │
│  3. Stripe gère son propre billing                                   │
│     └── API keys pour ses clients                                   │
│     └── Stripe Billing pour facturer                                │
│     └── PML n'intervient pas                                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2. Consumer Flow (Agent utilise capability)

```
1. Agent découvre "stripe.billing.api.create_invoice"
   └── Via pml_discover ou tools/list
   └── Metadata: owner verified, quality score, etc.

2. Agent appelle
   └── mcp.call("cap:stripe.billing.api.create_invoice", args)
   └── PML Gateway route vers Stripe MCP
   └── Stripe MCP vérifie API key (son billing à lui)
   └── Exécution + résultat

3. Pas de paiement PML
   └── PML a déjà été payé via le namespace registration
   └── L'usage est gratuit côté PML
```

### 3. Dispute Flow (Trademark claim)

```
Scenario: Quelqu'un a squatté "google" namespace

Option A: Off-chain (simple)
└── Google contacte PML support
└── Proof of trademark
└── PML force transfer via admin function
└── Squatter perd namespace (pas de refund)

Option B: On-chain DAO (future)
└── Dispute contract avec voting
└── Token holders votent
└── Plus complexe, pour plus tard
```

Pour le MVP, Option A suffit. La plupart des registrars DNS fonctionnent comme ça (UDRP process).

---

## Avantages vs Centralisé

| Aspect | Centralisé (DB only) | Blockchain (Namespace Registry) |
|--------|----------------------|--------------------------------|
| **Propriété** | "Trust us" | Cryptographique, vérifiable |
| **Transferts** | Manual process | Self-service, instant |
| **Ventes** | Escrow complexe | Smart contract escrow natif |
| **Historique** | DB modifiable | Immuable, auditable |
| **Confiance** | Réputation PML | Trustless (code = law) |
| **Disputes** | PML décide seul | Transparent, auditable |
| **Portabilité** | Lock-in possible | Données on-chain = ouvertes |

---

## Risques & Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Gas fees élevés | UX dégradée pour registration | L2 (Base, Arbitrum) - fees < $0.10 |
| Volatilité ETH | Prix namespace imprévisible | Prix en USD, ajusté dynamiquement |
| Smart contract bugs | Perte de namespaces | Audit, bug bounty, proxy upgradeable |
| Squatting massif | Noms premium pris | Trademark priority period + disputes |
| Low adoption | Overhead vs centralisé | Commencer hybride (optionnel) |
| Complexité UX | Wallet requis | Custodial option pour onboarding |

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

## MVP Scope (Simplifié)

### Phase 1: Smart Contract (2 semaines)

- [ ] `CapabilityNameRegistry.sol` (register, renew, transfer, isOwner)
- [ ] Deploy sur testnet (Base Sepolia ou Arbitrum Sepolia)
- [ ] Tests unitaires (Foundry ou Hardhat)
- [ ] Audit léger / review

### Phase 2: PML Integration (2 semaines)

- [ ] Ethers.js client dans PML Gateway
- [ ] `isOwner()` check avant publication
- [ ] Cache ownership (TTL 5 min, pas query à chaque call)
- [ ] Wallet linking (user PML → wallet address)

### Phase 3: Frontend (2 semaines)

- [ ] Page "Register Namespace" (connect wallet, pay, register)
- [ ] Page "My Namespaces" (list, renew, transfer)
- [ ] Integration dans dashboard PML existant

### Phase 4: Production (1 semaine)

- [ ] Deploy mainnet (Base ou Arbitrum)
- [ ] Monitoring (events, balances)
- [ ] Documentation

**Total MVP: ~7 semaines**

---

## Questions Ouvertes

1. **Quelle L2 ?**
   - Base (Coinbase ecosystem, growing fast)
   - Arbitrum (plus mature, plus de TVL)
   - Les deux ? (multi-chain à terme)

2. **Subdomain support ?**
   - `stripe` owns → peut créer `billing.stripe`, `payments.stripe` ?
   - Ou flat namespace only ?

3. **Grace period expiration ?**
   - Namespace expire → immédiatement available ?
   - Ou 30 jours grace period pour renewal ?

4. **Custodial onboarding ?**
   - Permettre registration sans wallet (PML custody) ?
   - Claim later avec son propre wallet ?

5. **Trademark priority period ?**
   - Période initiale où seuls les trademark holders peuvent register ?
   - Comme les sunrise periods des TLDs

---

## Next Steps

1. **Décider la L2** - Base vs Arbitrum (ou les deux)
2. **POC smart contract** - Deploy sur testnet, tester les flows
3. **Design UX** - Mockups registration flow avec wallet connect
4. **Estimer gas costs** - Vérifier que les fees sont acceptables
5. **Legal check** - Pas de token custom = moins de risque, mais vérifier quand même

---

## Références

- [ENS (Ethereum Name Service)](https://ens.domains/) - Le modèle à suivre
- [Base](https://base.org/) - L2 Coinbase, low fees
- [Arbitrum](https://arbitrum.io/) - L2 mature
- [OpenZeppelin Contracts](https://www.openzeppelin.com/contracts) - Pour les patterns secure
- tech-spec-capability-naming-curation.md (this repo)

---

## Conclusion

Ce spike propose une approche **minimaliste** de blockchain pour les capabilities :

- **On-chain** : Juste l'ownership des namespaces (comme ENS)
- **Off-chain** : Tout le reste (code, exécution, billing)

Pas de token custom, pas de pay-per-call, pas de revenue splitting automatique.

Les publishers gèrent leur propre monétisation. PML gère les noms.

C'est simple, c'est clean, c'est faisable en ~7 semaines.
