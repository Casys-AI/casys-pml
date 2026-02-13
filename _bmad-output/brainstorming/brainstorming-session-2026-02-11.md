---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'Micro-SaaS de consulting IA — packager expertise de consultants en agents MCP louables'
session_goals: 'Explorer concept produit, modèle business, faisabilité technique, go-to-market, différenciation'
selected_approach: 'ai-recommended'
techniques_used: ['First Principles Thinking', 'Morphological Analysis', 'Reverse Brainstorming']
ideas_generated: [FP1, FP2, FP3, FP4, FP5, FP6, FP7, Morpho1, Morpho2, Morpho3, Morpho4, Morpho5, Morpho6, Morpho7, Morpho8, Morpho9, Morpho10, Reverse1, Reverse2, Reverse3, Reverse4, Reverse5, Reverse6, Reverse7, Reverse8]
context_file: ''
session_active: false
workflow_completed: true
---

# Brainstorming Session Results

**Facilitator:** Ubuntu
**Date:** 2026-02-11

## Session Overview

**Topic:** Micro-SaaS de consulting IA — agents spécialisés loués via MCP, expertise packagée, facturation au résultat
**Goals:** Explorer le concept produit, le modèle business, la faisabilité technique, le go-to-market, la différenciation

### Thèse centrale

> "Dans le consulting, ce qui est le plus chiant c'est le temps. On peut pas dupliquer sa personne. Louer son expertise via un agent IA, c'est se dupliquer."

### Session Setup

- **Direction stratégique** : D'abord prouver le modèle soi-même (propre cabinet KM) → ensuite plateforme pour consultants
- **Infrastructure existante** : PML multi-tenant, workflows, package, tracing, HIL — il manque "l'enrobage"
- **Avantage MCP** : Logique côté serveur, opaque pour le client. On loue le résultat, pas le code.
- **Pricing 3 modèles** : Forfait mission / Abonnement mensuel / Hybride setup+usage
- **3 segments cibles** : ETI industrielles, éditeurs SaaS, consultants indépendants/cabinets
- **Atouts PML déjà en place** : Tracing/observabilité, amélioration continue via traces, HIL avec escalation

## Technique Selection

**Approach:** AI-Recommended Techniques
**Analysis Context:** Business model hybride tech/consulting, utilisateur pragmatique et technique

**Recommended Techniques:**

- **First Principles Thinking:** Décomposer les invariants fondamentaux avant de construire
- **Morphological Analysis:** Croiser toutes les dimensions produit pour trouver les combinaisons non-évidentes
- **Reverse Brainstorming:** Stress-tester en cherchant comment faire échouer le produit

## Technique Execution Results

### First Principles Thinking — Les invariants du consulting IA

**Ce qu'un consultant vend VRAIMENT (5 briques) :**

1. **Diagnostic** — comprendre le problème mieux que le client
2. **Légitimité** — "un expert externe a dit que..."
3. **Analyse / Corporate hacking** — poser quelqu'un quelque part, il trouve 30 000 choses à améliorer
4. **Expertise pure** — savoir des choses que le client ne sait pas
5. **Regard neuf** — voir ce que les internes ne voient plus

**Capacité de l'agent par brique :**

| Brique | Agent IA seul ? | Pourquoi |
|---|---|---|
| Diagnostic | Oui, potentiellement mieux | Ingère 500 pages, croise des patterns, ne se fatigue pas |
| Analyse / Corporate hacking | Oui, terrain idéal | Scanner, détecter incohérences, doublons, trous — pattern matching à l'échelle |
| Expertise | Partiellement | Codifiable (frameworks, best practices) oui. Tacite (intuition, jugement) plus dur |
| Légitimité | Non, pas seul | Besoin d'un humain derrière pour porter la recommandation |
| Regard neuf | Oui par nature | Pas de biais interne, pas politique, ne protège personne |

**[FP #1]** : L'agent en usage quotidien comprend mieux que le consultant
- Le consultant vient 2 semaines, repart. L'agent est là tous les jours, capte les usages réels.
- Sur l'axe "compréhension contextuelle dans la durée", l'agent est SUPÉRIEUR.

**[FP #2]** : Le connecteur universel
- Le consultant apprenait chaque outil client. L'agent s'y connecte nativement via MCP.
- Power BI, bases de données, outils internes — avec MCP + Playwright/computer-use, l'agent opère sur N'IMPORTE QUEL outil.

**[FP #3]** : Le proxy intelligent chez le client
- L'agent est un proxy déployé chez le client. Self-hosted, données locales, LLM local si besoin.
- On ne "vend pas un SaaS IA" — on "installe un consultant permanent dans l'infra du client".

**[FP #4]** : Le spectre d'autonomie
- L'agent peut être autonome (escalade rare), assisté (l'employé pilote), ou copilote (50/50).
- Ce n'est pas binaire humain/IA — c'est un curseur réglable par mission.

**[FP #5]** : Le tueur de tâches à faible valeur
- Réunions, notes, comptes-rendus, rapports = 60% du temps consultant, 0% de valeur ajoutée.
- L'agent élimine cette couche entière. Le consultant se concentre sur la partie noble.

**[FP #6]** : Le livrable McKinsey automatisé
- Le bon consultant produit des rapports massifs, trouve des patterns invisibles (émergence), traduit en recommandations actionnables.
- Les 3 premières étapes sont du pur traitement d'information — terrain de l'IA.

**[FP #7]** : Le facteur écoute
- Le consultant est écouté parce qu'il a l'expertise ET la crédibilité.
- Division inversée : l'agent produit la substance, l'humain porte le message.

**Formule fondamentale :**
```
AGENT = volume × pattern detection × disponibilité 24/7 × connecteurs universels
CONSULTANT = légitimité × écoute × jugement politique × signature
PRODUIT = AGENT (fait 90% du travail) + CONSULTANT (porte 100% de la crédibilité)
```

### Morphological Analysis — Les combinaisons produit

**Matrice des axes :**

| Axe | Options |
|---|---|
| A. Client | ETI industrielle / Éditeur SaaS / Consultant indépendant / Cabinet conseil |
| B. Domaine | KM / IT / Finance / RH / Ops / Juridique / ouvert |
| C. Hébergement | Cloud managé (MVP) / Self-hosted / Hybride |
| D. Surface d'opération | Computer-use (prend le contrôle) / Chat agent / IDE / MCP headless (API) |
| E. HIL | Configurable : auto-approve / validation consultant / validation client / escalade multi-niveau |
| F. Rôle consultant | Superviseur / Formateur agent / Garant légitimité |

**10 combinaisons explorées :**

**[Morpho #1] Corporate Hacker as a Service** ⭐ TOP
- ETI industrielle × KM × Cloud managé × Computer-use × validation consultant
- L'agent se connecte aux outils du client, scanne tout, produit un rapport d'audit. Le consultant valide et priorise.

**[Morpho #2] SaaS Plugin White-Label**
- Éditeur SaaS × domaine variable × MCP headless × auto-approve × garant légitimité
- L'éditeur intègre l'agent via MCP dans son produit, invisible pour l'utilisateur final. B2B2B.
- Verdict: à creuser, pas clair pour le fondateur.

**[Morpho #3] Clone de Consultant** ⭐ TOP
- Consultant indépendant × son domaine × Cloud managé × Chat agent × escalade multi-niveau
- Le consultant paie pour créer son "double IA" accessible par chat. Ses clients discutent avec l'agent.

**[Morpho #4] Agent IDE**
- Éditeur SaaS ou ETI × IT × Self-hosted × IDE × validation consultant
- Verdict: déjà fait par Claude Code.

**[Morpho #5] Meeting Ghost**
- Cabinet conseil × tout domaine × Cloud managé × Chat agent × auto-approve
- Verdict: problème hardware (micro, intégration Teams).

**[Morpho #6] Auditeur Permanent**
- ETI industrielle × Ops/Qualité × Self-hosted × MCP headless × escalade multi-niveau
- Verdict: bon concept mais pas le use case du fondateur.

**[Morpho #7] Corporate Hacker en mode "audit flash"** ⭐ MVP IDÉAL
- Mission ponctuelle 48-72h, forfait fixe, livrable en 1 semaine.
- Le produit le plus simple à vendre — livrable clair, prix fixe, résultat mesurable.

**[Morpho #8] Clone-as-a-Platform** ⭐ VISION LONG TERME
- Plateforme multi-consultants. Chaque consultant crée son clone IA.
- Passe de "un consultant avec un agent" à "la plateforme qui clone les consultants".

**[Morpho #9] Agent embarqué**
- Verdict: prestation de service classique, pas différenciant.

**[Morpho #10] L'orchestration experte avec preuves**
- DAG de 15-40 étapes, chaque étape tracée, auditable, reproductible.
- Différence vs ChatGPT (one-shot) et n8n (linéaire) : orchestration non-linéaire avec preuves.

### Reverse Brainstorming — Les scénarios d'échec

**[Reverse #1] Le moat c'est le "managed"**
- N'importe qui peut prompter ChatGPT. Personne sait orchestrer 40 étapes, connecter les outils, optimiser les workflows. On vend du managed expertise.

**[Reverse #2] Le piège de la démo**
- Sur UNE question, ChatGPT fait pareil. La différence se voit sur un workflow complet. La première démo doit montrer le workflow complet.

**[Reverse #3] L'amortissement multi-clients**
- Le consultant amortit Opus + infra + config sur 10-50 clients. Business à marge croissante.

**[Reverse #4] GPT Store / Gemini menace**
- Le moat durable = expertise domaine + relation client + track record. Pas la tech.

**[Reverse #5] Risque légal provider**
- On ne revend PAS un accès API — on vend un résultat de consulting. Vérifier ToS.

**[Reverse #6] Credentials client**
- Service accounts + tokens scoped. Le client ne donne jamais ses mots de passe.
- PML gère déjà l'installation de tokens via .env. Interface locale possible.

**[Reverse #7] Escalation DOIT être async**
- L'agent soumet une demande, continue sur le reste, revient quand c'est validé.
- PML fait déjà ça — approval_required est non-bloquant.

**[Reverse #8] Le moat c'est la connectivité universelle**
- Gemini/Copilot sont prisonniers de leur écosystème. MCP est agnostique.
- "J'ai SAP, SharePoint, une base Oracle legacy ET un outil métier bizarre" → seul MCP connecte tout.

## Idea Organization and Prioritization

### Thème 1 : La nature du produit — "Le multiplicateur de consultant"
FP #5, FP #6, FP #7, Reverse #1 — Le produit est un consultant augmenté en continu.

### Thème 2 : La proposition de valeur unique (moat)
FP #1, FP #2, Morpho #10, Reverse #8 — Connectivité universelle + orchestration intelligente + expertise domaine.

### Thème 3 : Les modèles produit concrets
Morpho #1 (Corporate Hacker) + Morpho #3 (Clone) + Morpho #7 (Audit flash) + Morpho #8 (Platform).
Séquence : MVP audit flash → récurrent → plateforme.

### Thème 4 : Les garde-fous
Reverse #2 (démo workflow), #5 (ToS), #6 (credentials), #7 (async escalation), #8 (connectivité moat).

### Le pitch
> "C'est 10x moins cher que moi. Tu peux poser tes questions. Tu connectes tes outils. Je suis derrière pour configurer. Et t'as accès à Opus 4.6 que tu pourrais jamais te payer tout seul."

Note: l'argument Opus 4.6 ne marche PAS pour les grandes entreprises qui ont déjà les budgets. Il marche pour les PME et consultants indépendants.

### Priorités retenues
1. **Prototype technique** — prouver que PML peut orchestrer un workflow KM complet bout en bout
2. **MVP audit flash** — un premier client, un premier livrable, prouver le concept
3. ~~Pitch deck~~ — abandonné, le produit va trop évoluer

### Question architecturale critique (NON RÉSOLUE)
> "Si c'est mon agent qui va sur LEUR ordinateur en mode computer-use, PML sert à quoi ? PML fournit des MCP tools via gateway. Si l'agent est chez eux en computer-use, il n'a pas besoin de la gateway."

→ Nécessite un panel d'experts technique + business pour trancher.

## Session Summary

**25 idées/insights** générés via 3 techniques en session interactive.
**3 modèles produit prioritaires** identifiés (audit flash, corporate hacker, clone consultant).
**8 risques** identifiés et transformés en features/décisions.
**1 question architecturale critique** à résoudre : le rôle exact de PML dans le delivery.

**Prochaine étape : panel d'experts sévères (business + technique) pour stress-tester le concept.**
