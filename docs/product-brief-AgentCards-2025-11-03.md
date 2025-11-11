# Product Brief: AgentsCards

**Date:** 2025-11-03
**Author:** BMad
**Status:** Draft for PM Review
**Project Name:** AgentsCards

---

## Initial Context

**Origin Story:**
Le projet AgentsCards émerge d'une triple motivation:
- Frustration personnelle avec Claude Code utilisant de nombreux MCP servers (explosion du contexte)
- Observation que tous les compétiteurs actuels (AIRIS, Smithery, Unla) ont raté l'opportunité du vrai lazy loading
- Inspiration de LLMCompiler pour apporter la parallélisation intelligente au monde MCP

**Core Problems Identified:**
1. **Explosion du contexte** - Les MCP servers actuels envoient tous les tools d'un coup, saturant la context window
2. **Lenteur des appels séquentiels** - Pas de parallélisation = latence cumulative (5 tools = 5x le temps)

**Target Users:**
- Développeurs utilisant Claude Code avec 10+ MCP servers
- Teams construisant des agents AI complexes nécessitant coordination multi-tools

**Input Sources:**
- Session de brainstorming intensive (2025-11-03) avec 50+ concepts générés
- Analyse compétitive approfondie (AIRIS, Smithery, Unla, LLMCompiler)
- First Principles thinking, Morphological Analysis, SCAMPER method

**Collaboration Mode:** Interactive (section par section)

---

## Executive Summary

**AgentCards** est une gateway MCP intelligente qui résout les deux problèmes critiques bloquant l'adoption à l'échelle de l'écosystème Model Context Protocol: **l'explosion du contexte** (30-50% de la context window consommée par les tool schemas) et **la latence cumulative** des appels séquentiels (5 tools = 5x le temps d'attente).

En appliquant **vector search sémantique** pour le chargement on-demand des tools et **DAG execution** pour la parallélisation intelligente, AgentCards permet aux développeurs d'activer 15+ MCP servers simultanément (vs 7-8 actuellement) tout en réduisant le contexte à <5% et en accélérant les workflows multi-tools de 5x. La plateforme se différencie des solutions existantes (AIRIS, Smithery, Unla) par une architecture **SQLite-first** zero-infrastructure et un **focus DX non-négociable** (NPS >75 target).

**MVP 8 Semaines (Q1 2025):** Context Optimization Engine + DAG Execution + Zero-Config Auto-Discovery, déployé local-first via Deno runtime. Target 200-500 power users ultra-satisfaits qui deviendront les évangélistes naturels du produit. Succès mesuré par **3 KPIs critiques**: NPS >75, Context <5%, Retention 30-jours >70%. Projet open-source avec optionality future pour monétisation (managed service, enterprise features, consulting) si product-market fit validé.

---

## Problem Statement

### L'Écosystème MCP Souffre d'un Problème d'Échelle Critique

L'écosystème Model Context Protocol (MCP) connaît une adoption explosive avec des centaines de servers disponibles. Cependant, les développeurs et teams construisant des agents AI complexes se heurtent à **deux goulots d'étranglement majeurs** qui limitent drastiquement l'utilisation réelle de MCP:

#### 1. Explosion du Contexte - La "Taxe Invisible" sur Chaque Interaction

**Impact Quantifié:**
- **30-50% du contexte LLM** est consommé uniquement par les schemas des tools MCP avant même toute interaction utile
- Avec seulement **8 MCP servers** (configuration modeste), les schemas peuvent occuper 60K-100K tokens sur les ~200K disponibles
- Certains MCP servers particulièrement riches en fonctionnalités consomment individuellement des dizaines de milliers de tokens

**Conséquence Directe:**
- Les développeurs n'ont **"plus rien pour leur chat"** - la fenêtre conversationnelle utile est réduite de moitié
- Les réponses de Claude sont tronquées ou refusées faute d'espace contextuel
- **Auto-limitation forcée**: les développeurs évitent volontairement de tester ou activer certains MCP servers pourtant utiles

**Pourquoi les Solutions Actuelles Échouent:**
- **AIRIS, Smithery, Unla**: Tous utilisent l'approche "all-at-once" - renvoient TOUS les tools d'un MCP server simultanément
- Aucune solution de lazy loading réelle sur le marché
- AIRIS a promis du lazy loading mais l'implémentation est défaillante

#### 2. Latence Cumulative - L'Inefficacité des Appels Séquentiels

**Impact Quotidien:**
- Les workflows multi-tools s'exécutent **séquentiellement** sans parallélisation
- Pour une tâche typique nécessitant 5 outils MCP: attente cumulative de 5x la latence unitaire
- **Friction rencontrée très fréquemment** - plusieurs fois par session de travail
- Workflows simples (lecture → parsing → validation → écriture) deviennent péniblement lents

**Coût en Productivité:**
- Temps d'attente "relou" qui brise le flow de développement
- Impossible d'orchestrer efficacement des workflows complexes cross-MCP
- Les agents AI complexes ne peuvent pas coordonner intelligemment de multiples sources de données

#### 3. Le Coût d'Opportunité - Innovation Bridée

**Ce Que le Problème Empêche:**
- **Impossibilité d'utiliser 10+ MCP servers simultanément** (limite pratique actuelle: ~8 servers)
- Les teams doivent **choisir entre MCP A et MCP B** au lieu de les combiner
- Cas d'usage avancés bloqués: coordination cross-domaines (GitHub + Slack + Database + Filesystem + ...)
- L'écosystème MCP grandit mais l'utilisation réelle stagne

#### 4. Urgence - La Fenêtre d'Opportunité Se Referme

**Pourquoi Maintenant:**
- Anthropic pousse massivement MCP avec Claude Code (adoption en croissance exponentielle)
- Tous les compétiteurs ont raté cette opportunité (solutions buggées ou incomplètes)
- Les early adopters expriment la frustration mais continuent d'espérer une solution
- Premier entrant avec une vraie solution de context optimization + parallélisation capture le marché

**Validation du Problème:**
- AIRIS a échoué sur l'exécution malgré la bonne vision (config bugs, lazy loading raté)
- LLMCompiler a prouvé la faisabilité de la parallélisation intelligente (mais limité à Python)
- Aucune solution edge-deployable avec zero-config disponible

Le marché attend une gateway MCP qui résout **simultanément** l'échelle, le contexte et l'orchestration.

---

## Proposed Solution

### AgentCards: Gateway MCP Intelligente avec Context Optimization et Prédiction Adaptive

**Vision en Une Phrase:**
AgentCards est une gateway MCP qui charge les tools on-demand via vector search sémantique, exécute les workflows en parallèle via DAG, et apprend à prédire les outils suivants pour des performances quasi-instantanées.

#### Architecture Fondée sur 3 Piliers Interconnectés

**1. Context Optimization - Fin de l'Explosion du Contexte**

**Approche:**
- **Vector Search Sémantique:** Recherche intelligente des tools pertinents plutôt que chargement massif
- **On-Demand Loading:** Schemas chargés uniquement au besoin, tool par tool (granularité maximale)
- **SQLite Vector Store:** Embeddings des tools pour découverte sémantique ultra-rapide

**Résultat Concret:**
- Passage de **30-50% → <5% de contexte** consommé par les tool schemas
- Support **illimité de MCP servers** sans saturation du contexte
- Les développeurs récupèrent 90% de leur fenêtre conversationnelle

**2. Orchestration Parallèle - Élimination de la Latence Cumulative**

**Approche:**
- **DAG Execution:** Construction automatique d'un graphe de dépendances entre tools (inspiration LLMCompiler)
- **Parallélisation Intelligente:** Exécution simultanée des tools indépendants
- **SSE Streaming:** Résultats streamés dès leur disponibilité pour feedback progressif

**Résultat Concret:**
- Workflows 5-outils passent de **5x latence → 1x latence** (5x plus rapide)
- Coordination cross-MCP fluide (GitHub + Slack + Database en parallèle)
- Flow de développement préservé (pas de "temps mort relou")

**3. Échelle Illimitée - L'Écosystème MCP Sans Limites**

**Approche:**
- **Zero-Config Auto-Discovery:** Détection automatique des MCP servers disponibles
- **Edge-First Architecture:** Déployable sur Deno Deploy / Cloudflare Workers
- **SQLite Everything:** Un seul fichier .db portable (vector store + usage stats + cache)

**Résultat Concret:**
- Support de **dizaines, centaines de MCP servers** sans dégradation
- Déploiement trivial (pas de Redis/Postgres/Qdrant requis)
- Latence ultra-faible grâce au edge deployment

#### Le "Secret Sauce" - Tool Prediction Adaptive

**Innovation Clé qui Différencie AgentCards:**

AgentCards intègre un **système de prédiction des tools** basé sur les patterns d'utilisation réels:

**Comment Ça Marche:**
- **Usage Stats Learning:** Table SQLite trackant les séquences tool_A → tool_B avec fréquences
- **Speculative Execution:** Lancement anticipé des tools "probables" en arrière-plan
- **Smart Caching:** Résultats pré-calculés disponibles instantanément si demandés
- **Suggestion Engine:** Propositions de tools suivants probables envoyées à Claude

**Résultat Magique:**
- **Capacités quasi-instantanées** - Résultats déjà prêts quand Claude les demande
- **S'améliore avec l'usage** - Plus vous utilisez AgentCards, plus il devient rapide
- Exemple: "Après read_file → 80% parse_json" → parse_json déjà pré-exécuté

**Impact UX:**
- Pattern "branch prediction" des CPUs modernes appliqué aux workflows MCP
- Zero overhead pour l'utilisateur (tout transparent)
- Performance qui s'améliore organiquement au fil du temps

#### Pourquoi AgentCards Réussira Là Où AIRIS a Échoué

| Dimension | AIRIS / Smithery / Unla | **AgentCards** |
|-----------|-------------------------|----------------|
| **Lazy Loading** | Promis mais raté (all-at-once) | ✅ Vraie implémentation granulaire (per-tool) |
| **Configuration** | Bugs constants, config manuelle | ✅ Zero-config auto-discovery |
| **Parallélisation** | Aucune ou partielle | ✅ DAG + Speculative execution |
| **Context Optimization** | Aucune (saturation) | ✅ Vector search + on-demand (<5% contexte) |
| **Performance** | Latence cumulative (5x pour 5 tools) | ✅ Latence constante + prédiction (quasi-instant) |
| **Déploiement** | Cloud traditionnel, complexe | ✅ Edge-first, un fichier SQLite portable |
| **Intelligence** | Statique | ✅ Adaptive (apprend des patterns d'utilisation) |

#### L'Expérience Utilisateur Transformée

**Avant AgentCards (État Actuel):**
- Configuration de 8 MCP servers → 50% du contexte consommé
- Workflow 5-tools → 30 secondes d'attente cumulative
- Décision douloureuse: "Je désactive ce MCP server pourtant utile"

**Avec AgentCards:**
1. **Installation:** `npx agentcards` - auto-discovery automatique, zero config
2. **Premier Usage:** 15-20 MCP servers activés, contexte <5%, workflows parallélisés
3. **Après Une Semaine:** Tool prediction apprend vos patterns → résultats quasi-instantanés
4. **Moment "Wow":** "J'ai oublié qu'il y avait une latence avant... c'est juste fluide maintenant"

#### Proposition de Valeur Unique

**Pour les Développeurs Claude Code:**
- Libération du contexte (90% récupéré pour conversations utiles)
- Performance 5-10x meilleure sur workflows multi-tools
- Accès à TOUT l'écosystème MCP sans compromis

**Pour les Teams Agents AI:**
- Orchestration cross-MCP sophistiquée enfin possible
- Coordination GitHub + Slack + Database + Custom APIs en parallèle
- Base pour agents AI vraiment multi-domaines

**Pour l'Écosystème MCP:**
- Débloque l'adoption réelle (pas juste 2-3 MCP servers par user)
- Prouve que MCP scale (100+ servers supportés)
- Accélère la création de nouveaux MCP servers (confiance dans l'infrastructure)

---

## Target Users

### Primary User Segment

**Persona: "Alex - Le Power User AI-Native Developer"**

**Profil Démographique:**
- **Rôle:** Full-stack Developer / AI Engineer / Tech Lead dans startup/scale-up tech
- **Expérience:** Senior (5-10 ans), early adopter de technologies AI
- **Contexte:** Remote/hybrid, side projects ambitieux, actif sur tech Twitter/Discord
- **Tech Stack:** TypeScript/Python, Claude Code comme IDE principal, 10-20+ MCP servers configurés

**Comportement Quotidien avec Claude Code:**
- **Usage Intensif:** 8-10 heures par jour dans Claude Code
- **Workflows Lourds:** Playwright pour testing, Serena pour code analysis, filesystem/git/database intensivement
- **Sessions Longues:** Conversations de 50-100+ messages avec contexte riche
- **Multi-Projets:** Jongle entre 3-5 projets simultanément (work + side projects)

**Pain Points Spécifiques:**
1. **Coût de Productivité Quotidien:**
   - "Je perds 30-45 minutes par jour à attendre des workflows séquentiels"
   - Contexte saturé force à redémarrer les conversations → perte de contexte précieux
   - Flow brisé plusieurs fois par session → impact mental/cognitif

2. **Auto-Limitation Frustrante:**
   - "J'ai 15 MCP servers installés mais j'en active que 7-8 maximum"
   - Doit choisir entre Playwright OU Serena pour une session (pas les deux)
   - Teste pas de nouveaux MCP intéressants par peur de saturer le contexte

3. **Workflows Sophistiqués Bloqués:**
   - Impossible de coordonner GitHub + Database + Slack + Testing dans un seul flow
   - Les agents "autonomes" qu'il veut construire sont bridés par les limites actuelles
   - Frustration face au potentiel inexploité de MCP

**Goals & Motivations:**
- **Productivité Maximale:** "Claude Code devrait être 10x developer, pas un goulot"
- **Innovation AI:** Construire des agents vraiment sophistiqués (multi-domaines, autonomes)
- **Exploration Sans Friction:** Tester TOUT l'écosystème MCP sans compromis
- **Influence:** Partager ses découvertes (tweets, blog posts, conf talks)

**Critères de Décision d'Adoption:**
- ✅ **Performance Tangible:** Doit voir 3-5x amélioration dès jour 1
- ✅ **Zero Friction:** `npx install` et ça marche - pas de config complexe
- ✅ **Fiabilité:** Doit être rock-solid, pas de bugs bloquants (AIRIS = repoussoir)
- ✅ **Open Source:** Préfère solutions open-source, self-hostable
- ✅ **Edge Cases Couverts:** Supporte ses workflows complexes existants

**Définition de Succès:**
- "Je peux activer mes 15 MCP servers sans y penser"
- "Mes workflows multi-tools sont fluides, j'ai oublié la latence"
- "Je construis des agents AI que je n'aurais jamais pu faire avant"

**Taille du Marché:**
- **Early Adopters:** ~5,000-10,000 développeurs worldwide (actifs sur Claude Code + MCP)
- **Marché Adressable:** ~50,000-100,000 dans 12-18 mois (adoption MCP croissante)
- **Influence:** Ratio 1:10 (1 power user influence 10 autres développeurs)

### Secondary User Segment

**Persona: "Jordan - Le Curieux MCP Explorer"**

**Profil Démographique:**
- **Rôle:** Mid-level Developer, Product Engineer, Indie Hacker
- **Expérience:** 2-5 ans de développement, nouveau sur Claude Code (<6 mois)
- **Contexte:** Découvre l'écosystème MCP, excité par le potentiel, veut explorer
- **Tech Stack:** Généralist (React/Node ou Python/Django), utilise Claude Code pour prototyping rapide

**Comportement avec Claude Code & MCP:**
- **Usage:** 3-5 heures par jour, principalement pour prototyping et learning
- **Approche:** "Je veux tester TOUT ce qui existe dans l'écosystème MCP"
- **Installation Enthusiaste:** Ajoute 5-10 MCP servers dès les premières semaines
- **Frustration Immédiate:** Se heurte au mur du contexte dès 5-8 MCP servers activés

**Pain Points Spécifiques:**
1. **Découverte Bridée:**
   - "J'ai vu 30 MCP servers cool sur Twitter mais je ne peux en utiliser que 5-6"
   - Doit désactiver un MCP pour en tester un autre → friction constante
   - Peur de "casser" sa config en ajoutant trop de MCP

2. **Complexité Technique:**
   - Pas expert en optimisation de contexte ou configuration avancée
   - Veut que "ça marche direct" sans lire 20 pages de docs
   - Frustré par les solutions qui nécessitent de la configuration manuelle (AIRIS)

3. **Expérimentation Limitée:**
   - Impossible de combiner librement différents MCP pour tester des idées
   - "Je voudrais essayer GitHub + Figma + Notion ensemble mais ça sature"
   - Abandonne certaines explorations faute d'infrastructure stable

**Goals & Motivations:**
- **Exploration Libre:** "Je veux pouvoir tester n'importe quel MCP sans me soucier des limites"
- **Apprentissage Rapide:** Comprendre le potentiel de MCP sans friction technique
- **Prototyping Agile:** Construire des POCs rapidement en combinant plusieurs MCP
- **Simplicité:** "npx install et ça marche" - pas de PhD en architecture distribuée requis

**Critères de Décision d'Adoption:**
- ✅ **Zero Configuration:** Doit marcher out-of-the-box
- ✅ **Gratuit/Open Source:** Budget limité (indie hacker ou side project)
- ✅ **Documentation Claire:** Quick start en <5 minutes
- ✅ **Communauté Active:** Discord/Forum pour poser questions
- ✅ **Pas de Lock-In:** Peut désinstaller facilement si ça ne marche pas

**Définition de Succès:**
- "J'ai installé AgentCards, tous mes MCP marchent ensemble, je n'y pense plus"
- "Je peux tester librement de nouveaux MCP sans désactiver les anciens"
- "Mes prototypes se construisent vite sans me battre avec la config"

**Taille du Marché:**
- **Early Explorers:** ~20,000-30,000 développeurs découvrant MCP
- **Marché Croissant:** +50% mensuel avec l'adoption de Claude Code
- **Conversion:** 10-20% deviendront power users dans 6-12 mois

**Relation avec Primary User:**
- Les power users (Alex) influencent les explorateurs (Jordan) via recommendations
- Jordan devient Alex avec le temps (pipeline naturel)
- AgentCards facilite cette transition (pas besoin de reconfigurer)

---

## Goals and Success Metrics

### Business Objectives

**Philosophie: Qualité > Quantité | DX Irréprochable > Growth Agressif**

AgentCards vise à construire une **communauté ultra-engagée** d'utilisateurs satisfaits plutôt qu'une base massive d'utilisateurs frustrés. Le succès se mesure à la satisfaction profonde des early adopters qui deviennent ensuite les évangélistes naturels du produit.

#### Objectifs 6 Mois Post-MVP (Février-Août 2025)

**1. Communauté Qualitative**
- **200-500 utilisateurs actifs hebdomadaires** ultra-engagés
  - Priorité: Engagement profond > volume massif
  - Chaque utilisateur doit être un potentiel ambassador
  - Ratio commits/users élevé (communauté contributive)

**2. Adoption Organique via Word-of-Mouth**
- **20-30 mentions Twitter/semaine** par des power users influents
- **3-5 blog posts/tutorials** créés par la communauté (non sollicités)
- **10-20 GitHub contributors** actifs au-delà du core team
- Apparition sur **1-2 newsletters tech** majeures (exemple: TLDR, ByteByteGo)

**3. Open Source Traction**
- **1,000-2,000 GitHub stars** (qualité communauté > vanity metric)
- **Pull Requests:** 50+ PR externes (communauté contributive)
- **Issues Resolution Time:** <48h pour bugs critiques (DX = prio)

**4. Market Penetration Ciblée**
- **2-5% des power users Claude Code** (segment primaire "Alex")
- **1-3% des explorateurs MCP** (segment secondaire "Jordan")
- Focus sur **top 100 early adopters MCP** plutôt que masse générique

### User Success Metrics

**Focus: DX Irréprochable = Métrique #1 de Succès**

#### Performance Technique Délivrée (Validation de la Promesse)

**1. Context Optimization**
- **Target:** Réduction de **30-50% → <5%** du contexte consommé par tool schemas
- **Mesure:** Moyenne sur tous les utilisateurs actifs
- **Seuil de Succès:** >90% des utilisateurs atteignent <10% de contexte utilisé
- **Validation:** Telemetry automatique (opt-in, respecte privacy)

**2. Latency Improvement**
- **Target:** Workflows 5-tools passent de **5x latence → 1x latence** (amélioration 5x)
- **Mesure:** P50 et P95 des temps d'exécution workflows multi-tools
- **Seuil de Succès:** P95 <3 secondes pour workflow 5-tools typique
- **Validation:** Built-in observability dashboard

**3. Scale Capability**
- **Target:** Moyenne MCP servers actifs passe de **7-8 → 15+**
- **Mesure:** Nombre médian de MCP servers activés par utilisateur power
- **Seuil de Succès:** >60% des power users utilisent 12+ MCP servers simultanément
- **Validation:** Configuration snapshots anonymisés

#### Satisfaction Utilisateur (Non-Négociable)

**1. Net Promoter Score (NPS) - Métrique Critique**
- **Target:** **NPS >75** (excellent) avec objectif stretch **>80** (world-class)
- **Mesure:** Survey mensuel après 2+ semaines d'usage
- **Benchmark:** Outils dev best-in-class (Vercel ~70, Raycast ~75)
- **Seuil d'Alerte:** Si NPS <65, freeze features et focus DX fixes

**2. Retention à 30 Jours**
- **Target:** **>70%** des utilisateurs encore actifs à J30
- **Mesure:** Utilisateurs ayant 1+ session active au jour 30 post-installation
- **Benchmark:** Excellent pour dev tools (typical ~40-50%)
- **Indicateur:** DX tellement bon que les users ne partent pas

**3. Time to "Aha Moment"**
- **Target:** <10 minutes de l'installation au premier "wow"
- **Mesure:** Temps entre `npx agentcards` et première exécution workflow parallélisé réussi
- **Seuil de Succès:** >80% des users atteignent "aha" en <10 min
- **Validation:** DX frictionless = adoption immédiate

#### Comportements Cibles (Adoption Profonde)

**1. Workflows Cross-MCP Sophistiqués**
- **Target:** >40% des power users créent workflows 3+ MCP servers coordonnés
- **Mesure:** Workflows détectés via DAG execution logs
- **Indicateur:** AgentCards débloque vraiment de nouveaux use cases

**2. Tool Prediction Hit Rate**
- **Target:** >70% de prédictions correctes après 1 semaine d'usage
- **Mesure:** % de tools spéculatifs effectivement utilisés
- **Indicateur:** Learning engine performant et utile

**3. Community Contribution Rate**
- **Target:** >15% des utilisateurs contribuent (code, docs, plugins, support)
- **Mesure:** % users avec 1+ contribution GitHub ou Discord help
- **Indicateur:** Communauté engagée et ownership partagé

### Key Performance Indicators (KPIs)

**Les 3 Métriques Non-Négociables pour Valider le Succès d'AgentCards**

Si AgentCards ne peut tracker que 3 métriques, ce sont celles-ci. Toutes les autres sont secondaires.

#### 🎯 KPI #1: Net Promoter Score (NPS) >75

**Pourquoi C'est Critique:**
- DX irréprochable = utilisateurs qui recommandent passionnément
- Indicateur direct de satisfaction profonde
- Prédicteur de word-of-mouth organique

**Target & Thresholds:**
- ✅ **Success:** NPS >75 (excellent, top 10% dev tools)
- 🎉 **Stretch:** NPS >80 (world-class, top 1% dev tools)
- 🚨 **Alert:** NPS <65 → FREEZE features, fix DX immédiatement

**Mesure:**
- Survey mensuel automatique après 2+ semaines d'usage
- Question: "Recommanderiez-vous AgentCards à un collègue dev? (0-10)"
- Segmentation: Power users vs Explorers

**Impact sur Roadmap:**
- Si NPS <target: Roadmap bloquée jusqu'à résolution des pain points
- Feedback qualitatif analysé chaque semaine pour prioriser fixes

---

#### ⚡ KPI #2: Context Reduction Moyenne <5%

**Pourquoi C'est Critique:**
- Core value prop technique d'AgentCards
- Mesure si la promesse principale est tenue
- Impact direct sur UX quotidienne (récupération de 90% du contexte)

**Target & Thresholds:**
- ✅ **Success:** <5% contexte consommé en moyenne
- 🎉 **Stretch:** <3% contexte consommé
- 🚨 **Alert:** >10% → Investigation architecture immédiate

**Mesure:**
- Telemetry opt-in (respecte privacy, anonymisé)
- Calcul: (tokens_tool_schemas / tokens_total_available) × 100
- Tracking: P50, P75, P95 pour identifier outliers

**Validation du Succès:**
- >90% des utilisateurs sous <10% de contexte
- Amélioration mesurée vs baseline (30-50% actuel)

---

#### 🔄 KPI #3: Retention à 30 Jours >70%

**Pourquoi C'est Critique:**
- Preuve de satisfaction durable (pas juste buzz initial)
- Indicateur que AgentCards devient indispensable
- 70% = exceptionnel pour dev tools (2x la norme ~35-40%)

**Target & Thresholds:**
- ✅ **Success:** >70% retention J30
- 🎉 **Stretch:** >80% retention J30
- 🚨 **Alert:** <60% → Churn analysis critique

**Mesure:**
- Cohorte analysis mensuelle
- Définition "actif": 1+ session avec AgentCards au jour 30
- Segmentation: Installation source, user type, MCP count

**Signal Qualitatif:**
- Interviews exit si churn pour comprendre "why"
- Corrélation avec NPS pour identifier patterns

---

#### 📊 KPIs Secondaires (Tracked mais Non-Bloquants)

**4. Utilisateurs Actifs Hebdomadaires: 200-500**
- Croissance organique saine
- Qualité communauté > volume

**5. GitHub Stars Growth Rate: +50-100/mois**
- Indicateur de buzz et découvrabilité
- Pas vanity metric si corrélé avec NPS élevé

---

### Dashboard de Suivi

**Weekly Check:**
- NPS trend (semaine glissante)
- Context reduction moyenne
- Retention cohort actuelle

**Monthly Review:**
- Deep dive sur les 3 KPIs + feedback qualitatif
- Décision: Continue roadmap ou pivot vers DX fixes
- Prioritization basée sur impact NPS

**Principe de Décision:**
> **"Si un choix doit être fait entre feature et DX, DX gagne toujours."**

---

## MVP Scope

**Philosophie: Foundation Solide > Feature Bloat | Valider Hypothèses > Promises Non-Testées**

### MVP Definition (8 Semaines - Production Ready)

Le MVP AgentCards délivre les **2 promesses fondamentales** qui résolvent les pain points critiques identifiés:
1. **Context Optimization** - Libérer 90% du contexte
2. **Parallélisation Basique** - Workflows 5x plus rapides

**Critère de Succès MVP:**
> Un power user peut activer 15+ MCP servers, exécuter un workflow cross-MCP parallélisé, et atteindre son "aha moment" en <10 minutes post-installation.

---

### Core Features (MUST HAVE - Semaines 1-6)

**1. Context Optimization Engine** ⭐⭐⭐
- **Vector Search Sémantique:**
  - SQLite + sqlite-vec extension pour embeddings storage
  - Recherche sémantique des tools pertinents via cosine similarity
  - API: `search_tools(query: string, top_k: number)` → tool_ids + scores
- **On-Demand Schema Loading:**
  - Chargement granulaire tool-by-tool (pas server-by-server)
  - Cache SQLite des schemas MCP
  - API: `get_tool_schema(tool_id: string)` → schema JSON
- **Résultat Mesurable:** Context <5% (vs 30-50% baseline)

**Effort:** 2-3 semaines | **Priorité:** P0 - Bloquant

---

**2. DAG Execution Engine (Parallélisation Basique)** ⭐⭐⭐
- **Dependency Graph Construction:**
  - Parsing automatique input/output schemas pour construire DAG
  - Détection des outils exécutables en parallèle vs séquentiel
  - Topological sort custom (100-150 LOC, zero dependency externe)
- **Parallel Executor:**
  - Exécution simultanée des branches indépendantes du DAG
  - Wait-all pattern + agrégation résultats
  - Gestion d'erreurs: retourner succès ET échecs avec codes
- **SSE Streaming:**
  - Stream résultats dès disponibilité (feedback progressif)
  - Format event: `task_complete`, `execution_complete`, `error`
- **Résultat Mesurable:** Latence 5x → 1x pour workflows multi-tools

**Effort:** 2-3 semaines | **Priorité:** P0 - Bloquant

---

**3. Zero-Config Auto-Discovery** ⭐⭐
- **MCP Server Detection:**
  - Scan automatique des MCP servers disponibles (stdio, SSE)
  - Health checks automatiques au démarrage
  - Convention over configuration (sensible defaults)
- **Embeddings Generation:**
  - Génération automatique des embeddings au premier lancement
  - Support API (OpenAI/Anthropic) OU local (transformers.js)
  - Stockage dans SQLite vector store
- **Résultat Mesurable:** Time to "aha moment" <10 min

**Effort:** 3-5 jours | **Priorité:** P0 - DX critique

---

**4. SQLite-Powered Storage** ⭐⭐
- **Unified Database:**
  - Vector store (sqlite-vec pour embeddings)
  - Schema cache (MCP tool schemas)
  - Usage stats table (foundation pour speculative execution future)
  - Configuration metadata
- **Single File Portability:**
  - Tout dans un fichier `.agentcards.db`
  - Pas de Redis/Postgres/Qdrant requis
  - Simplicité déploiement = avantage AIRIS raté
- **Résultat Mesurable:** Installation <2 minutes

**Effort:** 1 semaine intégré avec #1 | **Priorité:** P0 - Foundation

---

**5. Basic Observability (Telemetry Backend)** ⭐
- **Metrics Collection:**
  - Context usage tracking (opt-in, anonymisé)
  - Latency measurements (P50/P95)
  - DAG execution success/failure rates
  - Stockage dans SQLite (table `metrics`)
- **Structured Logging:**
  - JSON logs avec pino/winston
  - Niveaux: error, warn, info, debug
- **NO visual dashboard** (defer to v1.1)
- **Résultat Mesurable:** Données pour valider KPIs (NPS, context, retention)

**Effort:** 3-4 jours | **Priorité:** P1 - Important pour validation

---

### Out of Scope for MVP (Defer to v1.1+)

**❌ Speculative Execution & Tool Prediction**
- **Rationale:** Besoin de valider que ça marche vraiment en pratique
- **Approche:** Foundations d'abord (DAG + usage stats table)
- **Condition pour inclusion:** Tests concluants post-MVP prouvant efficacité >70%
- **Si validé:** Peut être "quick win" car graph dépendances déjà présent
- **Timeline si validé:** +2-3 semaines post-MVP

**❌ Plugin System pour API Translation**
- **Rationale:** Pas de cas d'usage bloquants sans plugins day-1
- **Approche:** MCP natif suffit pour MVP
- **Timeline:** v1.1 (+1 semaine)

**❌ Visual Observability Dashboard**
- **Rationale:** Telemetry backend suffit pour KPIs validation
- **Approche:** Logs + SQLite metrics queries manuels acceptable MVP
- **Timeline:** v1.2 (+1-2 semaines) si demand utilisateur

**❌ Edge Deployment (Deno Deploy/Cloudflare Workers)**
- **Rationale:** Local-first simplifie debugging et développement MVP
- **Approche:** Deno runtime local via `npx agentcards`
- **Architecture prep:** Code Deno-compatible dès le début (edge-ready)
- **Timeline:** v1.1 (+1 semaine deploy config)

**❌ Advanced Caching (Event-Based Invalidation)**
- **Rationale:** Basic cache suffit MVP
- **Approche:** Simple TTL-based cache pour schemas
- **Timeline:** v2 (+2 semaines) si usage stats montrent besoin

---

### MVP Success Criteria

**Technical Validation:**
- ✅ Context reduction <5% mesurée sur >10 power users beta
- ✅ Latency 5x→1x pour workflow 5-tools typique (P95 <3s)
- ✅ Zero bugs critiques bloquants (AIRIS lesson learned)
- ✅ Installation + premier workflow <10 minutes

**User Validation:**
- ✅ 20-50 beta users actifs (power users segment)
- ✅ NPS >70 sur beta cohort
- ✅ >60% beta users activent 12+ MCP servers
- ✅ 3-5 testimonials organiques positifs

---

### Timeline Détaillée (8 Semaines)

**Semaines 1-2: Foundation + Context Optimization**
- Setup projet Deno + architecture
- SQLite + sqlite-vec integration
- Vector search implementation
- On-demand schema loading

**Semaines 3-4: DAG Execution + Parallélisation**
- Dependency graph construction
- Parallel executor implementation
- SSE streaming setup
- **Checkpoint Semaine 4:** MVP demo-able avec 2-3 MCP servers

**Semaines 5-6: Polish + Auto-Discovery**
- Zero-config auto-discovery
- Embeddings generation automatique
- Error handling robuste
- Basic telemetry backend
- **Checkpoint Semaine 6:** Feature-complete, testing intensif

**Semaines 7-8: Beta Testing + Production Hardening**
- Beta deployment avec 20-50 power users
- Bug fixes critiques basés sur feedback
- Documentation (README, quick start)
- Performance optimization
- **Checkpoint Semaine 8:** Production-ready release

---

### Post-MVP Roadmap (Conditional on Validation)

**v1.1 (Semaines 9-11) - Extension Pragmatique:**
- Edge deployment si demand
- Plugin system si cas d'usage émergent
- Visual dashboard si friction metrics analysis

**v1.2-v2 (Semaines 12-20) - Innovation Layer:**
- **Speculative execution** (SI validé techniquement)
- Advanced caching avec event-based invalidation
- Multi-tenancy support (si teams demand)

**Principe de Décision Post-MVP:**
> **Features prioritized by: 1) User feedback intensity, 2) NPS impact potential, 3) Technical validation**

---

## Strategic Alignment and Financial Impact

### Financial Impact

**Nature du Projet:** Open-Source Passion Project (pas de revenue model direct MVP)

#### Investissement en Temps (Principale "Currency")

**Phase MVP (8 Semaines):**
- **Développement Full-Time:** ~320 heures (8 semaines × 40h)
- **Valeur Temps Développeur Senior:** ~€25,000-35,000 (market rate équivalent)
- **Temps Réel Investi:** Variable selon side-project vs full-time

**Coût d'Opportunité:**
- **Alternative A:** Consulting contracts (€500-800/jour × 40 jours = €20,000-32,000)
- **Alternative B:** Employment salaire (2 mois = ~€8,000-12,000 net)
- **Alternative C:** Autres side projects avec revenue plus court terme

**Justification de l'Investissement:**
- **ROI Non-Financier:** Portfolio piece exceptionnel (technical depth + market impact)
- **Learning Value:** Maîtrise approfondie de MCP, Deno, vector search, DAG execution
- **Positioning Stratégique:** Établir thought leadership dans l'écosystème MCP
- **Long-term Optionality:** Fondation pour opportunités futures (consulting, speaking, employment offers)

#### Coûts Infrastructure (Minimaux par Design)

**Développement & MVP:**
- **Hosting:** €0 (local-first deployment)
- **Database:** €0 (SQLite)
- **CI/CD:** €0 (GitHub Actions free tier)
- **Domain/Site:** €15-30/an (optionnel)
- **Embeddings:** €0 (BGE-Large-EN-v1.5 local, zero API costs)

**Total Coûts Directs MVP:** <€50

**Philosophie:**
> **"Frugalité par Design = Freedom to Fail Fast"**
> SQLite-first architecture élimine infrastructure costs, permettant iteration rapide sans burning cash.

#### Retour sur Investissement (Non-Traditionnel)

**ROI Direct (Improbable Court Terme):**
- Pas de revenue model MVP
- Open-source = free usage
- Monétisation future possible mais non-prioritaire

**ROI Indirect (Stratégique):**

**1. Career Capital (Valeur Estimée: €50,000-100,000)**
- Portfolio showcase technique de niveau "staff engineer"
- Proof of capability: architecture distribuée, performance optimization, DX focus
- Différenciation forte vs autres candidats dans interviews
- Potentiel speaking engagements (€1,000-3,000 per talk)

**2. Network Effects (Valeur Inestimable)**
- Connexions avec top 100 MCP early adopters (influencers tech)
- Reconnaissance dans communauté Anthropic/Claude
- Opportunités collaboration avec companies buildant sur MCP
- Insider knowledge écosystème AI tooling

**3. Thought Leadership (Valeur Long-Terme)**
- Établir expertise reconnue en AI tooling infrastructure
- Blog posts / technical content générant audience
- Potentiel book/course sur MCP architecture
- Consulting opportunities organiques (inbound)

**4. Optionality Creation (Valeur Stratégique)**
- **Option A:** Consulting spécialisé MCP/AI tooling (€800-1,200/jour)
- **Option B:** Acquisition par company buildant AI devtools
- **Option C:** Foundation pour startup si product-market fit exceptionnel
- **Option D:** Employment offers de companies impressed (Anthropic, Vercel, etc.)

**Scénario ROI Positif (12-24 Mois):**
- 1 speaking engagement (€2,000) + 5 consulting days (€4,000) + job offer premium (€10,000-20,000) = **€16,000-26,000**
- ROI: ~50-80% vs investissement temps équivalent
- SANS compter network/learning/positioning value (inestimable)

### Company Objectives Alignment

**Context:** Projet personnel (pas d'entreprise existante), donc alignement = Personal & Professional Goals

#### Objectifs Personnels Alignés

**1. Maîtrise Technique Approfondie ⭐⭐⭐**
- **Goal:** Devenir expert reconnu en AI tooling infrastructure
- **Alignment:** AgentCards couvre vector search, DAG execution, MCP protocol, performance optimization
- **Outcome:** Technical skills transférables valorisables à €800-1,200/jour consulting rate

**2. Impact Mesurable sur Écosystème ⭐⭐⭐**
- **Goal:** Créer des outils qui améliorent quotidien des développeurs
- **Alignment:** AgentCards résout pain points quotidiens (10h/jour Claude Code = impact direct)
- **Outcome:** Satisfaction de résoudre problèmes réels, testimonials authentiques

**3. Thought Leadership & Recognition ⭐⭐**
- **Goal:** Être reconnu comme thought leader AI/dev tools
- **Alignment:** Projet innovant (speculative execution appliqué à MCP), solvant problème que AIRIS/Smithery ont raté
- **Outcome:** Invitations speaking, blog audience, network quality

**4. Autonomie & Ownership ⭐⭐**
- **Goal:** Contrôle total sur vision produit et décisions techniques
- **Alignment:** Open-source = pas de investors/stakeholders contraignants
- **Outcome:** Creative freedom totale, apprentissage self-directed

**5. Portfolio Building (Career Insurance) ⭐⭐**
- **Goal:** Sécuriser options professionnelles futures
- **Alignment:** AgentCards = flagship portfolio piece (technical depth + market relevance)
- **Outcome:** Leverage dans négociations employment/consulting

#### Alignement avec Trajectoire Professionnelle

**Phase Actuelle:** Senior Developer / AI Engineer (10h/jour Claude Code)

**Phase Cible (12-24 Mois):**
- **Path A:** Staff/Principal Engineer dans AI devtools company
- **Path B:** Independent Consultant spécialisé AI tooling (€150,000-200,000/an)
- **Path C:** Technical Co-Founder AI infrastructure startup

**Comment AgentCards Facilite:**
- Proof of capability architecture distribuée (Staff Engineer skill)
- Network avec decision makers AI tooling ecosystem
- Expertise MCP = rare & valuable (early mover advantage)
- Track record shipping production-grade open source

### Strategic Initiatives

#### Initiative #1: Capturer le Market Timing Optimal (Q1-Q2 2025)

**Contexte Stratégique:**
- MCP adoption en croissance exponentielle (Claude Code push d'Anthropic)
- AIRIS/Smithery/Unla ont échoué sur exécution (bugs, lazy loading raté)
- Fenêtre d'opportunité 6-9 mois avant qu'une big tech résolve le problème

**Stratégie:**
- **Ship MVP Q1 2025** avant que quelqu'un d'autre résolve context optimization
- Early mover advantage = capture des top 100 early adopters influencers
- Établir AgentCards comme "de facto solution" avant concurrence sérieuse

**Risque de Délai:**
- Anthropic pourrait intégrer solution native dans Claude Code (likelihood: modérée)
- Autre indie hacker/team pourrait ship solution similaire
- Fenêtre se referme si trop lent → urgence justifiée

#### Initiative #2: Construire Communauté Quality-First (pas Growth-at-All-Costs)

**Philosophie:**
- 500 utilisateurs ultra-satisfaits > 50,000 utilisateurs frustrés
- NPS >75 non-négociable = ambassadors naturels via word-of-mouth
- Croissance organique durable vs spike hype puis churn

**Tactiques:**
- Beta privée avec 20-50 power users hand-picked (influencers MCP)
- Discord/GitHub community moderation active (response time <24h)
- Feedback loop direct: weekly user interviews pour capturer pain points
- Public roadmap driven par user feedback intensity

**Différenciation vs AIRIS:**
- AIRIS a privilégié growth → bugs critiques non-resolus → bad reputation
- AgentCards privilégie satisfaction → slow growth mais sustainable

**Mesure de Succès:**
- Ratio contributeurs/users élevé (>15% contribute code/docs/support)
- Testimonials organiques non-sollicités (Twitter, blog posts)
- Inbound demandes collaboration (companies voulant intégrer)

#### Initiative #3: Établir Thought Leadership via Technical Content

**Objectif:**
- Positionner AgentCards (et BMad) comme référence technique MCP infrastructure
- Éduquer l'écosystème sur context optimization & parallelization

**Content Strategy:**

**Blog Posts Techniques (4-6 sur 6 mois):**
1. "Why MCP Context Optimization Matters: The 30-50% Tax Nobody Talks About"
2. "Applying CPU Branch Prediction to AI Tool Workflows: Speculative Execution Explained"
3. "Building a Vector Search Engine with SQLite + sqlite-vec: A Practical Guide"
4. "DAG Execution for MCP: From 5x Latency to 1x in 200 Lines of Code"
5. "Why AIRIS Failed and What AgentCards Does Differently"
6. "The Economics of Edge-First Architecture: SQLite vs Redis/Postgres"

**Speaking Opportunities:**
- DevoxxFR, dotJS, JSConf EU (target Q3-Q4 2025)
- MCP community meetups (online + Paris/London)
- Anthropic developer events (si opportunité)

**Open Source Best Practices:**
- Transparent roadmap public (GitHub Projects)
- Weekly changelog détaillé
- Architecture Decision Records (ADRs) publics
- Livestream coding sessions (optionnel, si demand)

**Outcome Stratégique:**
- AgentCards devient "case study" de comment faire open source dev tools correctement
- Inbound traffic organique via content SEO
- Invitation collaborations/partnerships

#### Initiative #4: Créer Optionality pour Monétisation Future (Sans Compromettre MVP)

**Principe:**
> **"Build for love now, optionality for money later"**

**Options de Monétisation (Post-MVP, Conditional on Success):**

**Option A: Managed Service (SaaS)**
- AgentCards Cloud - hosted version avec zero-ops
- Target: Teams/enterprises voulant managed solution
- Pricing: €29-99/user/mois
- Timeline: v2+ (semaines 20-30) si demand validée

**Option B: Enterprise Features**
- Multi-tenancy, SSO, audit logs, SLA guarantees
- Open core model: MVP open-source, enterprise features payantes
- Target: Companies avec compliance requirements
- Pricing: €5,000-15,000/an per team

**Option C: Consulting & Support**
- Custom MCP integration development
- Architecture consulting pour AI tooling
- Priority support contracts
- Pricing: €800-1,200/jour OU retainers €3,000-8,000/mois

**Option D: Acquisition**
- Exit strategy si product-market fit exceptionnel
- Target acquirers: Anthropic, Vercel, companies buildant AI dev platforms
- Valuation hypothétique: €200,000-1,000,000 (dépend traction)

**Approche Immédiate:**
- MVP reste 100% gratuit open-source (pas de paywall)
- Foundations architecturales permettent future SaaS (multi-tenancy ready)
- Pas de pivot monetization avant validation product-market fit solide

**Décision Point:**
- SI NPS >80 ET 500+ active users ET inbound demand enterprise → Explorer Option A/B
- SI consulting inbound >5 demandes/mois → Formaliser Option C
- SINON → Continuer open-source, focus growth & impact

---

## Technical Considerations

### Platform Requirements

**Environnement d'Exécution:**
- **Runtime Principal:** Deno 1.40+ (JavaScript/TypeScript moderne)
  - Rationale: Zero-config, secure by default, excellent DX, edge-ready
  - Alternative considérée: Node.js (rejected: npm ecosystem overhead, config complexity)
- **Déploiement MVP:** Local-first (`npx agentcards` ou global install)
- **Post-MVP:** Edge deployment ready (Deno Deploy, Cloudflare Workers)

**Compatibilité OS:**
- **Supported:** macOS, Linux, Windows (via WSL2 recommandé)
- **Minimum:** macOS 10.15+, Ubuntu 20.04+, Windows 10+ with WSL2
- **Architectures:** x64, ARM64 (Apple Silicon native support)

**MCP Protocol Requirements:**
- **MCP Spec Version:** Compatible 1.0+ (tracking Anthropic spec évolutions)
- **Transport Protocols:** stdio (primary), SSE (secondary)
- **Server Discovery:** Auto-discovery via Claude Code config files + manual config override

**Contraintes Performance:**
- **Latency Target:** P95 <3 secondes pour workflow 5-tools
- **Memory Footprint:** <200MB RAM pour usage typique (8-15 MCP servers)
- **Startup Time:** <2 secondes cold start, <500ms warm start

**Browser/Client Compatibility:**
- **Primary Client:** Claude Code (VS Code extension)
- **Secondary Clients:** Terminal CLI, HTTP API (future)
- **No Browser UI** pour MVP (backend-only)

### Technology Preferences

**Stack Core (Non-Négociable MVP):**

**1. Deno Runtime** ⭐⭐⭐
- **Version:** Deno 1.40+ (latest stable)
- **Rationale:**
  - Zero-config: Pas de package.json, node_modules, build step complexe
  - Security first: Permissions explicites (network, file system, env)
  - TypeScript native: Pas de transpilation setup
  - Edge-ready: Deploy direct sur Deno Deploy (future)
  - Excellent DX: Fast iteration, clear error messages
- **Trade-off Accepté:** Écosystème plus petit que Node.js (non-bloquant pour ce use case)

**2. SQLite + sqlite-vec Extension** ⭐⭐⭐
- **Version:** SQLite 3.44+, sqlite-vec 0.1+
- **Rationale:**
  - Single-file database: Portabilité totale (.agentcards.db)
  - Vector search intégré: Pas besoin Qdrant/Pinecone/Weaviate séparé
  - Zero-ops: Pas de serveur externe à gérer
  - Performance excellente: Suffisant pour <10,000 tools vectorisés
  - Edge-compatible: Peut run sur Cloudflare Workers/Deno Deploy
- **Usage:**
  - Vector store (embeddings des MCP tools)
  - Schema cache (tool definitions)
  - Usage stats (foundation speculative execution)
  - Configuration metadata

**3. TypeScript (Strict Mode)** ⭐⭐
- **Version:** TypeScript 5.3+ (via Deno)
- **Configuration:** Strict mode enabled (null checks, no implicit any)
- **Rationale:** Type safety critique pour reliability (DX non-négociable)

**Stack Secondaire (Important mais Flexible):**

**4. Embeddings Generation**
- **MVP Approach:** BGE-Large-EN-v1.5 (local, open-source) ⭐
  - Model: BAAI/bge-large-en-v1.5 (1024 dimensions)
  - Quality: ≥ OpenAI text-embedding-3-small (benchmark validated)
  - Size: 330MB download, ~60s first-time generation
  - Cost: €0, zero API keys required
  - Implementation: @xenova/transformers (transformers.js)
  - License: MIT
  - **Rationale:** Aligné avec zero-config promise, évite friction API keys, qualité production-ready dès MVP

**5. Testing Framework**
- **Preferred:** Deno.test (built-in, zero config)
- **Coverage:** deno coverage (built-in)
- **E2E:** Playwright (optionnel, post-MVP)

**6. Logging & Observability**
- **Logging:** std/log (Deno standard library) OU pino (si besoin perf)
- **Metrics:** SQLite table (custom metrics storage)
- **Tracing:** Console structured logs MVP, OpenTelemetry future

**Technologies Explicitement Évitées (MVP):**

**❌ Redis/Postgres/MongoDB**
- Rationale: Infrastructure overhead vs SQLite simplicity
- SQLite suffisant pour MVP scale (<10,000 users)

**❌ Kubernetes/Docker**
- Rationale: Local-first MVP, over-engineering
- Deno binary direct suffit

**❌ Frameworks Web (Express/Fastify/Hono)**
- Rationale: std/http suffisant pour MVP API simple
- Peut introduire si routing complexity justifie

**❌ GraphQL**
- Rationale: REST/JSON-RPC suffit MCP protocol
- Over-engineering pour ce use case

### Architecture Considerations

#### Pattern Architectural Principal: MCP Gateway avec Context Intelligence

**High-Level Architecture:**

```
┌─────────────────────────────────────────────────┐
│           Claude Code (Client)                  │
└────────────────┬────────────────────────────────┘
                 │ MCP Protocol (stdio/SSE)
                 ▼
┌─────────────────────────────────────────────────┐
│         AgentCards Gateway (Deno)               │
│  ┌───────────────────────────────────────────┐  │
│  │  Vector Search Layer                      │  │
│  │  - Semantic tool discovery                │  │
│  │  - On-demand schema loading               │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  DAG Execution Engine                     │  │
│  │  - Dependency graph construction          │  │
│  │  - Parallel orchestration                 │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  SQLite Storage (.agentcards.db)          │  │
│  │  - Vector embeddings (sqlite-vec)         │  │
│  │  - Schema cache                           │  │
│  │  - Usage stats                            │  │
│  └───────────────────────────────────────────┘  │
└────────────────┬────────────────────────────────┘
                 │ MCP Protocol
                 ▼
┌─────────────────────────────────────────────────┐
│    MCP Servers (8-15+ servers)                  │
│  - GitHub, Slack, Filesystem, Database, ...     │
└─────────────────────────────────────────────────┘
```

**Composants Clés:**

**1. Vector Search Layer (Context Optimization Core)**
- **Input:** User query/intent (natural language)
- **Process:**
  1. Generate embedding du query (cosine similarity search)
  2. Retrieve top_k tools pertinents (k=3-10 dynamic)
  3. Load schemas on-demand uniquement pour matched tools
- **Output:** Minimal tool schemas (<5% context)
- **Performance:** <100ms latency (SQLite index optimisé)

**2. DAG Execution Engine (Orchestration Core)**
- **Input:** Tool execution plan avec dependencies
- **Process:**
  1. Parse input/output schemas → construct dependency graph
  2. Topological sort → identify parallel execution opportunities
  3. Execute independent branches concurrently (Promise.all)
  4. Aggregate results + stream via SSE
- **Output:** Results avec latency optimisée (5x → 1x)
- **Failure Handling:** Partial success (return succès + errors)

**3. SQLite Storage (Single Source of Truth)**
- **Tables:**
  - `tool_embeddings` (tool_id, embedding_vector, metadata)
  - `tool_schemas` (tool_id, schema_json, server_id, cached_at)
  - `usage_stats` (tool_a, tool_b, frequency, last_used) [foundation speculative]
  - `config` (key-value metadata)
- **Indexes:**
  - Vector index (sqlite-vec HNSW pour fast similarity search)
  - B-tree indexes sur tool_id, server_id
- **Size:** ~10-50MB pour 1,000-5,000 tools vectorisés

**Décisions Architecturales Critiques:**

**Decision #1: Gateway Pattern vs Proxy Pattern**
- **Choix:** Gateway (intelligent layer) > Proxy (dumb passthrough)
- **Rationale:** Gateway permet context optimization + orchestration
- **Trade-off:** Latency overhead (+50-100ms) vs gains massifs parallélisation

**Decision #2: SQLite vs Vector Database Dédié**
- **Choix:** SQLite + sqlite-vec > Qdrant/Pinecone/Weaviate
- **Rationale:**
  - Simplicité déploiement (single file)
  - Performance suffisante (<10,000 vectors)
  - Zero infrastructure costs
  - Edge-compatible (critical future)
- **Trade-off:** Scale limité à ~100,000 vectors (non-bloquant MVP)

**Decision #3: Local-First vs Cloud-First MVP**
- **Choix:** Local-first (`npx agentcards`)
- **Rationale:**
  - Debugging facilité (developers run locally)
  - Zero infrastructure setup (AIRIS lesson learned)
  - Privacy (data reste local)
- **Prep Future:** Architecture edge-ready dès day 1

**Decision #4: Local Embeddings avec BGE-Large-EN-v1.5**
- **Choix:** BGE-Large-EN-v1.5 local (1024-dim)
- **Rationale:**
  - Quality ≥ OpenAI API (benchmark validated)
  - Zero-config promise respectée (no API keys required)
  - Zero cost (€0 vs €50-100 API)
  - 330MB + ~60s init acceptable pour power users
- **Implementation:** @xenova/transformers via transformers.js

**Scalability Considerations (Post-MVP):**

**Current Architecture Limits:**
- **Vector Store:** ~100,000 tools (SQLite + sqlite-vec suffisant)
- **Concurrent Requests:** ~100-500 req/sec (Deno async I/O)
- **Memory:** Linear growth ~20KB per tool cached

**Scale Plan (si demand):**
- **10,000+ users:** Considérer Redis cache layer (hot schemas)
- **100,000+ tools:** Migration vers Qdrant/Weaviate (optionnel)
- **1,000+ req/sec:** Horizontal scaling via edge deployment

**Security Considerations:**

**Data Privacy:**
- Embeddings stockés localement (pas cloud)
- Telemetry opt-in (explicit user consent)
- Pas de tracking usage sans permission

**Deno Security Model:**
- Permissions explicites requises (--allow-net, --allow-read, etc.)
- Sandboxed execution (pas d'accès filesystem non-autorisé)

**MCP Server Trust:**
- AgentCards proxy MCP calls (pas d'exécution arbitrary code)
- Health checks pour detect malicious servers
- User control total sur servers activés

---

## Constraints and Assumptions

### Constraints

**1. Timeline & Delivery (Hard Constraint)**
- **8 Semaines MVP Deadline** - Q1 2025 target pour capturer market timing optimal
- **Conséquence:** Scope MVP rigoureux, pas de feature creep
- **Mitigation:** Speculative execution déféré, focus sur 2 core problems

**2. Ressources Humaines (Solo Developer)**
- **Équipe:** 1 personne (BMad) - développement + product + design
- **Conséquence:** Pas de parallélisation des tracks (frontend/backend simultanés)
- **Mitigation:**
  - Backend-only MVP (pas de visual dashboard)
  - Leverage Deno DX pour vélocité maximale
  - Community beta testing pour UX feedback (20-50 users)

**3. Budget Infrastructure (Frugalité Stricte)**
- **Budget Total:** <€200 pour MVP
- **Conséquence:** Pas de cloud costs (Redis, Postgres, Qdrant, hosting)
- **Mitigation:**
  - SQLite-first architecture (zero infrastructure)
  - Local-first deployment (pas de hosting requis)
  - GitHub Actions free tier pour CI/CD

**4. Dépendances Externes (MCP Spec Évolution)**
- **Anthropic MCP Protocol** en évolution active (spec pas finalisée)
- **Conséquence:** Breaking changes possibles durant développement MVP
- **Mitigation:**
  - Version pinning conservative (MCP 1.0 baseline)
  - Adapter layer pour absorber future changes
  - Active monitoring des MCP spec releases

**5. Technical Stack (Deno Ecosystem Maturity)**
- **Deno SQLite Bindings** moins matures que Node.js équivalents
- **sqlite-vec Extension** relativement nouveau (0.1.x)
- **Conséquence:** Possibles bugs/limitations découverts durant dev
- **Mitigation:**
  - Prototyping précoce (semaine 1) pour valider feasibility
  - Fallback plan: Node.js si Deno blockers insurmontables
  - Contribution upstream si bugs critiques découverts

**6. Market Window (Urgence Stratégique)**
- **6-9 mois** avant qu'un compétiteur sérieux ou Anthropic intègre solution native
- **Conséquence:** Pression delivery rapide vs qualité
- **Mitigation:**
  - DX non-négociable (NPS >75) même avec urgence
  - MVP scope minimal mais excellente exécution
  - Itération post-MVP rapide basée feedback beta

### Key Assumptions

**Assumptions Marché & Adoption:**

**A1: MCP Adoption Continue (Confidence: Haute)**
- **Assumption:** L'écosystème MCP grandit avec 20-50%+ mensuel via Claude Code
- **Validation:**
  - Anthropic push marketing MCP activement
  - Centaines de MCP servers créés en Q4 2024
- **Risque si Faux:** Market trop petit pour justifier effort
- **Mitigation:** Monitoring adoption metrics mensuellement (GitHub stars MCP servers)

**A2: Context Optimization = Killer Feature (Confidence: Très Haute)**
- **Assumption:** Réduire context 30-50% → <5% est suffisamment impactant pour adoption
- **Validation:**
  - Pain point vécu personnellement (BMad + discussions communauté)
  - AIRIS a promis mais raté = demand validée
- **Risque si Faux:** Users ne valorisent pas assez le gain
- **Mitigation:** Beta testing précoce (semaine 6) pour valider value prop

**A3: DAG Parallélisation Délivre 3-5x Speedup (Confidence: Moyenne-Haute)**
- **Assumption:** Workflows typiques ont suffisamment d'indépendance pour parallélisation
- **Validation:** LLMCompiler a prouvé faisabilité (mais limité Python)
- **Risque si Faux:** Speedup réel <2x = promesse non tenue
- **Mitigation:**
  - Prototype DAG execution semaine 3 avec workflows réels
  - Mesures P50/P95 sur beta users (validation empirique)

**Assumptions Techniques:**

**A4: Deno Stable & Production-Ready (Confidence: Haute)**
- **Assumption:** Deno 1.40+ suffisamment mature pour production deployment
- **Validation:** Deno Deploy utilisé par companies (Supabase, etc.)
- **Risque si Faux:** Bugs critiques bloquants découverts
- **Mitigation:** Fallback vers Node.js si blockers (architecture agnostic)

**A5: SQLite + sqlite-vec Scale à 10,000 Tools (Confidence: Haute)**
- **Assumption:** Performance vector search acceptable jusqu'à 10K vectors
- **Validation:** sqlite-vec benchmarks publiés (sub-100ms queries)
- **Risque si Faux:** Latency >500ms = UX dégradée
- **Mitigation:** Load testing semaine 4-5 avec synthetic data

**A6: BGE-Large Init Time Acceptable (Confidence: Haute)**
- **Assumption:** 330MB download + ~60s first-time generation acceptable pour power users
- **Validation:** One-time setup, quality production-ready (≥ OpenAI)
- **Risque si Faux:** Users impatients abandon setup
- **Mitigation:** Progress bar + caching, amortized over hundreds of uses

**Assumptions Utilisateur:**

**A7: Power Users Prêts Beta Test (Confidence: Haute)**
- **Assumption:** 20-50 early adopters disponibles pour beta privée
- **Validation:** Network personnel (Twitter, Discord MCP communities)
- **Risque si Faux:** Pas assez feedback qualité pour valider MVP
- **Mitigation:** Outreach proactive semaine 5-6 pour recruiting beta

**A8: Zero-Config = Differentiation Forte (Confidence: Haute)**
- **Assumption:** AIRIS config bugs = repoussoir, zero-config = competitive advantage
- **Validation:** Frustration AIRIS documentée (GitHub issues, Twitter)
- **Risque si Faux:** Config pas si important que prévu
- **Mitigation:** DX focus général (pas uniquement config) assure valeur

**A9: Open Source = Growth Driver (Confidence: Moyenne-Haute)**
- **Assumption:** Open source génère contributions + word-of-mouth vs closed source
- **Validation:** Succès d'autres dev tools open-source (Vite, Biome, etc.)
- **Risque si Faux:** Faible contribution rate, slow growth
- **Mitigation:** Community building actif (Discord, documentation excellente)

**Assumptions Stratégiques:**

**A10: Anthropic N'Intégrera Pas Solution Native Court Terme (Confidence: Moyenne)**
- **Assumption:** Anthropic focus sur LLM core vs tooling infrastructure (6-12 mois)
- **Validation:** Historique - Anthropic laisse ecosystem builder sur tooling
- **Risque si Faux:** Claude Code intègre context optimization = AgentCards obsolète
- **Mitigation:**
  - Ship rapide (8 semaines) pour établir position avant
  - Différenciation via speculative execution (post-MVP) si native solution arrive
  - Possibilité collaboration/acquisition si Anthropic intéressé

**A11: Consulting Opportunities Émergent Naturellement (Confidence: Faible-Moyenne)**
- **Assumption:** Succès MVP → inbound consulting demandes (€800-1,200/jour)
- **Validation:** Pattern observé avec autres dev tools creators
- **Risque si Faux:** Pas de monétisation court/moyen terme
- **Mitigation:** ROI non-financier suffit (career capital, learning, network)

**Assumptions Testing Strategy:**

**Critiques (Valider Semaines 1-4):**
- A2: Context optimization value (prototype + user interviews)
- A3: DAG speedup réel (benchmarks avec workflows réels)
- A5: SQLite scale (load testing)

**Importantes (Valider Semaines 5-8):**
- A1: MCP adoption trend (monitoring metrics)
- A7: Beta recruitment (outreach active)
- A6: BGE-Large init time UX (beta feedback)

**Secondaires (Observer Post-MVP):**
- A9: Open source contribution rate
- A10: Anthropic roadmap
- A11: Consulting inbound

---

## Appendices

### A. Research Summary

**Session de Brainstorming (2025-11-03):**
- Document: [docs/brainstorming-session-results-2025-11-03.md](docs/brainstorming-session-results-2025-11-03.md)
- Méthodes appliquées: First Principles Thinking, Morphological Analysis, SCAMPER, Reverse Brainstorming
- Résultats: 50+ concepts générés, convergence sur "Gateway Stupide" + Context Optimization + DAG Execution
- Insights clés:
  - SQLite Foundation comme killer decision (zero-ops, portability, edge-ready)
  - D-D-D-B configuration pattern (Discover-Describe-Deploy-Build)
  - Speculative Execution comme innovation différenciante (post-MVP validation)
  - 8-week timeline réaliste pour MVP scope défini

**Competitive Analysis:**
- **AIRIS:** Lazy loading promis mais raté, config bugs constants → bad reputation
- **Smithery:** All-at-once schema loading, pas de parallélisation
- **Unla:** Approche proxy simple, pas d'optimization contextuelle
- **LLMCompiler:** Proof of concept DAG execution (Python-only, inspiration directe)

**Market Validation:**
- Pain point vécu personnellement (BMad: 10h/jour Claude Code, 8+ MCP servers)
- Discussions communauté MCP: frustration contexte + latence récurrente
- GitHub issues AIRIS: nombreux users bloqués par config + bugs

### B. Stakeholder Input

**Primary Stakeholder: BMad (Product Creator & Primary User)**

**Inputs Clés Fournis Durant Workflow Interactif:**
1. **Vision Produit:** "Context opti et parallélisation minimum" pour MVP
2. **Priorités:** "DX c'est ma prio", "très très bon NPS je veux non négociable"
3. **Scope Decisions:**
   - Speculative execution déféré: "pas sûr que ça fonctionne en vrai, à vérifier"
   - Tech stack: "On va utiliser Deno je pense"
   - User primaire: Power user (10h/jour Claude Code) vs noob secondary
4. **Success Criteria:** NPS >75 comme KPI #1, qualité communauté > quantité users
5. **Pragmatisme:** Validation empirique avant promesses (test speculative post-MVP)

**Validation Points:**
- Confirmation target users (Power User primary après analyse stratégique)
- Approbation MVP scope (context opt + DAG, defer speculative)
- Validation metrics focus (NPS, DX, retention > vanity metrics)

### C. References

**MCP Protocol & Ecosystem:**
- [Anthropic MCP Specification](https://github.com/anthropics/mcp) (v1.0+)
- [Claude Code Documentation](https://docs.claude.com/en/docs/claude-code)
- MCP Server Directory: [github.com/punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers)

**Technical Inspiration:**
- LLMCompiler Paper: "An LLM Compiler for Parallel Function Calling" (Berkeley, 2024)
- sqlite-vec: [github.com/asg017/sqlite-vec](https://github.com/asg017/sqlite-vec)
- Deno Runtime: [deno.land](https://deno.land)

**Competitive Products:**
- AIRIS: [airis.com](https://airis.com)
- Smithery: [smithery.ai](https://smithery.ai)
- Unla: [unla.dev](https://unla.dev)

**Architectural Patterns:**
- Gateway Pattern (Microservices Architecture)
- DAG Execution (Task Scheduling, Apache Airflow)
- Vector Search (Semantic Similarity, FAISS, Pinecone)
- Branch Prediction (CPU Architecture, Speculative Execution)

**Developer Tools Benchmarks:**
- Vercel NPS: ~70 (excellent dev tools)
- Raycast NPS: ~75 (world-class DX)
- Vite GitHub Stars Growth: +50-100/semaine (healthy open source)

---

_This Product Brief serves as the foundational input for Product Requirements Document (PRD) creation._

_Next Steps: Handoff to Product Manager for PRD development using the `/bmad:bmm:workflows:prd` command._
