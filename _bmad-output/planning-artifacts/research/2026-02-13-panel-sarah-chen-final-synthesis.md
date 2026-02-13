# Synthese finale Dr. Sarah Chen — Position consolidee apres debat panel complet

Date: 2026-02-13

---

## SCORE FINAL : 6/10

Baisse de 6.5 initial a 6.0 apres deux revelations :
1. Le SHGAT+GRU n'est pas deploye en prod (cosine basique = systeme actuel)
2. Le SHGAT n'est pas novel architecturalement (confirmation Yuki : GAT standard sur hypergraphe)

---

## CONSENSUS DU PANEL (5 experts)

| Expert | Score | Verdict |
|:--|:---:|:--|
| Marcus (systems) | 5/10 | Analogie JIT defaillante, formalisation insuffisante |
| Raj (methodologie) | 4/10 | Baselines absentes, dataset petit, comparaisons invalides |
| **Sarah (ML)** | **6/10** | Contribution reelle mais modeste, oversell le probleme |
| Amara (applied) | 7.5/10 | Architecture saine, valeur terrain, Hit@3 pivot |
| Yuki (graph ML) | ~5/10 | SHGAT pas novel, MP inutile, systeme = oui |

**Moyenne panel : ~5.5/10**

---

## CE QUI FAIT CONSENSUS (5/5 experts)

1. **Retirer "compiled" du titre** — Marcus (formellement incorrect), Sarah (marketing deguise), tous d'accord
2. **Retirer "SHGAT" du titre** — Yuki (pas novel), Sarah (contribution marginale +2pp)
3. **Table 5 doit etre reformulee** — comparer Hit@1 avec task success = non-sequitur methodologique
4. **Baselines triviales INDISPENSABLES** — Random, frequency, cosine-only (Raj). Note : cosine-only = le systeme en production actuel
5. **Presenter comme etude offline, pas systeme deploye** — le SHGAT+GRU n'est pas en prod
6. **Arxiv preprint acceptable** apres corrections — unanime

## CE QUI DIVISE

| Sujet | Position A | Position B |
|:--|:--|:--|
| Venue | cs.AI (Sarah, Marcus) | cs.SE (Raj) |
| Severite | 4-5/10 (Raj, Marcus, Yuki) | 6-7.5/10 (Sarah, Amara) |
| Le SHGAT | Retirer du paper (Yuki) | Garder comme composante mineure (Sarah) |
| Publication vs Produit | Paper d'abord (Sarah) | Tracing d'abord (Amara, rapport PMF) |

---

## RECOMMANDATIONS FINALES

### Pour le paper

1. **Nouveau titre suggere** : "Learned Tool Routing for MCP Workflows: A 258K-Parameter Model Trained on Production Traces and Community Workflows"
2. **Reframer sur Hit@3=80.9%** (insight Amara) : "reduire le search space de 870 a 3 candidats" plutot que "choisir le bon outil a 60.6%"
3. **Ajouter les baselines** (1-2 jours) : random, frequency, cosine-only (= systeme en prod)
4. **Ablation input-par-input du GRU** (1-2 jours) : 5 inputs, 5 runs, reporter les deltas
5. **Micro-benchmark inference latency** (2 heures) : P50/P95/P99 pour un forward pass
6. **Formaliser** (Marcus) : Def 1 (Hierarchical Tool Space), Def 2 (Routing Problem), L_total formelle
7. **Anonymiser un subset de traces** (3-5 jours) : reproductibilite
8. **Coverage rate** (Raj) : quel % des queries passe par le fast path avec confiance > seuil X ?
9. **Presenter le MP comme future work** (Yuki) : le "H" de SHGAT ne contribue pas empiriquement
10. **Etre transparent** : c'est une etude offline, pas un systeme deploye

**Effort total : ~2-3 semaines techniques + 2 semaines redaction = ~1 mois**

### Pour la strategie produit

1. **PRIORITE 1 : Tracing Dashboard cloud** (7-10 sem) — c'est le produit, le seul differenciateur defensible
2. **PRIORITE 2 : Paper arxiv** (~1 mois, en parallele) — credibilite technique, attire les early adopters
3. **PRIORITE 3 : Integrer le GRU en prod** — baseline cosine en prod, GRU plus performant, integration = credibilite paper + produit
4. **Reporter** : standalone, ML research ameliorations, landing V2

---

## LA PHRASE CLE

Le paper a une **bonne idee** (separer selection et filling, modele tiny sur traces reelles), un **bon systeme** (GRU 258K + n8n augmentation), mais un **mauvais framing** ("compiled", SHGAT en titre, comparaison ToolACE-MCP, claims de deployment). Corriger le framing transforme un 5.5/10 en 7/10. La substance est la — c'est la presentation qui doit changer.
