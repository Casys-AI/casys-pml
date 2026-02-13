# Rapport Marie Dubois -- Pricing & Monetization Strategy pour PML

**Expert** : Marie Dubois, Pricing & Monetization consultant
**Background** : Ex-Head of Pricing chez Algolia, avant ca Stripe, specialisee en monetisation de dev tools et API-first products
**Date** : 2026-02-13
**Contrainte cle** : Solo founder/builder, 0 revenus, 0 budget marketing, PLG only

---

## VERDICT EN UNE PHRASE

**PML doit monetiser le tracing cloud avec un modele usage-based simple, pas des tiers complexes. Le premier euro compte plus que le pricing optimal.**

---

## 1. CRITIQUE DU MODELE PROPOSE (rapport PMF)

Le rapport PMF propose :

| Tier | Prix | Problemes identifies |
|---|---|---|
| Free | 0 EUR | OK mais trop vague sur les limites |
| Pro | 29 EUR/mois | **Trop cher pour un outil sans utilisateurs.** A 0 users, le prix n'est pas un signal de valeur, c'est une barriere. |
| Team | 49 EUR/user/mois | **Premature.** Les features team (RBAC, partage) n'existent pas. Vendre ce qui n'existe pas = dette de confiance. |
| Enterprise | Sur devis | **Completement hors scope.** Solo builder, pas de sales. |

### Probleme fondamental

Le rapport PMF fait l'erreur classique du "pricing en chambre" : definir des tiers avant d'avoir des utilisateurs. C'est mettre la charrue avant les boeufs.

**Regle #1 de la monetisation dev tools** (apprise chez Algolia) : Ne monetise pas avant de savoir ce que les gens utilisent reellement. Stripe a ete gratuit pendant 2 ans. Algolia a donne 10K req/mois gratuites pendant 18 mois avant de monetiser.

Avec 0 utilisateurs, le probleme n'est pas "quel prix" mais "comment obtenir les 20 premiers utilisateurs actifs."

---

## 2. CE QUE JE RECOMMANDE A LA PLACE

### Phase 0 : Gratuit total (0-6 mois)

**Pas de paywall. Rien. Zero friction.**

| Element | Detail |
|---|---|
| CLI local | Gratuit, illimite |
| Tracing cloud | Gratuit, 10K traces/mois, retention 7 jours |
| Dashboard | Gratuit, toutes les features |
| MCP servers | Illimite |

**Pourquoi** : Le fondateur est solo et ne peut pas gerer du billing, du support client, des relances, des refunds. Chaque minute passee sur le billing est une minute pas passee sur le produit. A ce stade, l'objectif est d'obtenir 50 utilisateurs actifs hebdomadaires, pas des euros.

**Le "compte" gratuit collecte** :
- Email (obligatoire pour le cloud)
- Nombre de traces/semaine
- Tools et MCP servers utilises
- Patterns de workflows (anonymises)

Ces donnees valent plus que 29 EUR/mois. Elles repondent a : "qu'est-ce que les gens utilisent reellement ?"

### Phase 1 : Premier paywall (mois 6-9)

**Condition prealable** : 50+ utilisateurs actifs hebdomadaires ET le fondateur sait QUOI limiter.

Le paywall doit etre un **usage gate**, pas un feature gate :

| | Free | Pro |
|---|---|---|
| **Prix** | 0 EUR | **19 EUR/mois** (PAS 29) |
| Traces/mois | 10K | 100K |
| Retention | 7 jours | 30 jours |
| Dashboard | Complet | Complet |
| Export | JSON only | JSON + CSV + API |
| Replay | 3/jour | Illimite |

**Pourquoi 19 EUR et pas 29 EUR** :
- 19 EUR est sous la barre psychologique de 20 EUR. Un dev peut le mettre sur sa carte perso sans validation manager.
- 19 EUR/mois = 228 EUR/an. C'est le prix d'un outil jetable ("j'essaie pendant 3 mois, si ca marche je garde").
- Le rapport PMF compare a LangSmith (39 USD). Mauvais comparateur. PML n'a ni la marque, ni la communaute, ni les features de LangSmith. Comparer a un incumbent quand on est un no-name = erreur de positionnement prix.
- A 19 EUR, 50 utilisateurs = 950 EUR MRR. C'est suffisant pour valider le modele sans etre un engagement psychologique lourd.

**Pourquoi usage-based (traces) et pas feature-based (RBAC, alerts)** :
- Le fondateur est seul. Il ne peut pas developper des features specifiques pour un tier payant. Ce qui existe doit etre accessible a tous.
- Les traces sont le metric naturel de valeur : plus on utilise PML, plus on genere de traces, plus on a besoin de retention et de volume.
- Usage-based est auto-service : pas besoin de vendre, pas de negociation, le client upgrade quand il atteint la limite.

### Phase 2 : Monetisation serieuse (mois 9-18)

**Condition prealable** : 20+ utilisateurs Pro payants ET pattern d'usage clair.

Ici, et SEULEMENT ici, on introduit un second tier :

| | Free | Pro | Team |
|---|---|---|---|
| **Prix** | 0 EUR | 19 EUR/mois | **39 EUR/user/mois** |
| Traces/mois | 10K | 100K | 500K |
| Retention | 7 jours | 30 jours | 90 jours |
| Users | 1 | 1 | Illimite |
| Partage traces | Non | Non | Oui |
| SSO/SAML | Non | Non | Oui |
| API rate limit | 100 req/min | 1000 req/min | 10K req/min |
| Support | Community | Email (48h) | Email (24h) |

**Note** : 39 EUR/user = meme prix que LangSmith Developer MAIS avec un positionnement different (tracing MCP vs tracing LLM). Le prix ne se justifie qu'une fois que PML a prouve sa valeur aupres d'utilisateurs individuels qui veulent partager avec leur equipe.

---

## 3. LE METRIC QUI COMPTE : TRACES PER WEEK

Chez Algolia, le metric qui predisait le mieux la conversion free-to-paid etait le nombre de requetes/semaine. Pas le nombre de features utilisees, pas le NPS, pas le temps passe dans le dashboard. Le VOLUME d'usage.

Pour PML, le metric equivalent est **traces par semaine par utilisateur** :

| Segment | Traces/semaine | Comportement |
|---|---|---|
| Touriste | < 10 | A essaye, ne reviendra probablement pas |
| Curieux | 10-50 | Explore, pas encore accro |
| **Utilisateur engage** | **50-200** | Utilise PML regulierement. CIBLE pour conversion. |
| Power user | 200+ | PML est critique pour son workflow. Paiera volontiers. |

**Actions** :
1. Instrumenter ce metric DES le jour 1 du cloud
2. Envoyer un email a 50 traces/semaine : "Vous utilisez PML serieusement. Voici ce que Pro vous apporterait."
3. Le paywall (10K traces/mois) est calibre pour que les "utilisateurs engages" l'atteignent en ~2-3 mois : 100 traces/semaine * 12 semaines = 1200 traces. A 200/semaine : 2400. A 300/semaine : 3600. Aucun n'atteint 10K en un mois sauf les power users.

**IMPORTANT** : Ne pas placer le paywall trop tot. Un utilisateur qui genere 50 traces/semaine et qui se fait bloquer a la semaine 3 ne paie pas. Il quitte. Le paywall doit etre une consequence naturelle de l'addiction, pas une barriere a l'adoption.

---

## 4. WHAT NOT TO DO

### 4.1 Ne pas faire de "plans annuels" avant 50 clients payants

Les plans annuels (2 mois gratuits si vous payez pour l'annee) sont un outil d'optimisation du churn. A 0-20 clients, le churn n'est pas le probleme. L'acquisition l'est.

### 4.2 Ne pas faire de pricing "par MCP server"

Le rapport PMF mentionne des limites par nombre de MCP servers (3 free, 15+ pro). C'est une mauvaise metrique de valeur. Un dev qui utilise 2 MCP servers intensement genere plus de valeur qu'un dev qui en connecte 15 et n'en utilise aucun. Le nombre de servers est un vanity metric.

**Metrique de valeur** = traces (usage reel).

### 4.3 Ne pas mettre de features critiques derriere un paywall

Le tracing, le dashboard, la visualisation DAG : tout doit etre gratuit. Ce sont les features qui vendent PML. Les cacher derriere un paywall c'est comme cacher le logo d'une marque.

Ce qui peut etre premium : le VOLUME (plus de traces, plus de retention) et le CONFORT (export, API, replay illimite).

### 4.4 Ne pas copier Datadog

Datadog facture par host, par GB ingere, par log, par APM span, par... C'est un cauchemar de complexite. Le fondateur est seul, il ne peut pas gerer un systeme de billing complexe.

**UN metric de facturation** : traces/mois. Simple. Predictible. Comprehensible.

### 4.5 Ne pas offrir de "trial" du Pro

Les trials de 14 jours sont un pattern enterprise/SaaS B2B. Pour un dev tool PLG : le free tier IS the trial. Il dure indefiniment. La conversion vient du volume d'usage, pas d'un countdown.

---

## 5. IMPLEMENTATION TECHNIQUE MINIMALE

En tant que solo builder, le systeme de billing doit etre le plus simple possible.

### 5.1 Stripe Checkout (recommande)

| Composant | Solution | Effort |
|---|---|---|
| Payment | Stripe Checkout (hosted page) | 2-3h |
| Subscription management | Stripe Customer Portal (hosted) | 1h |
| Metering | Compteur traces dans la DB + cron daily | 4h |
| Paywall | Middleware API : if (traces > limit && !isPro) return 402 | 2h |
| Email de conversion | Stripe + SendGrid (trigger a 80% du quota) | 3h |
| **Total** | | **~2 jours** |

**Pas besoin de** :
- Systeme de facturation custom
- Dashboard admin de billing
- Gestion des refunds automatisee (Stripe le fait)
- Gestion des taxes (Stripe Tax ou Paddle)
- Systeme de coupon/discount

### 5.2 Alternative : Paddle (si TVA est un probleme)

Paddle est un Merchant of Record : ils gerent la TVA mondiale. A 5% de commission. Justifie SEULEMENT si le fondateur a des clients hors-France et ne veut pas gerer la TVA. Pas pertinent avant 50 clients.

### 5.3 Metering implementation

```typescript
// Pseudo-code du compteur de traces
// Ajouter dans le TraceSyncer existant

async function recordTrace(trace: ExecutionTrace): Promise<void> {
  await this.store.save(trace);

  // Increment monthly counter
  const key = `traces:${userId}:${yearMonth}`;
  await this.redis.incr(key);

  // Check limit
  const count = await this.redis.get(key);
  const limit = user.plan === 'pro' ? 100_000 : 10_000;

  if (count >= limit * 0.8 && !user.notifiedQuota80) {
    await sendQuotaWarning(user, count, limit);
  }

  if (count >= limit && user.plan === 'free') {
    // Ne pas bloquer. Degrader gracieusement.
    // Option A : reduire la retention a 24h au lieu de 7j
    // Option B : ne plus stocker les inputs/outputs (metadata only)
    trace.degraded = true;
  }
}
```

**Degradation gracieuse vs hard block** : Ne JAMAIS bloquer un utilisateur qui genere des traces. Bloquer = il quitte. Degrader (moins de retention, moins de detail) = il voit ce qu'il perd et upgrade.

---

## 6. PRICING POUR LE PAPER ARXIV

Le paper et le pricing sont lies. Voici comment :

### 6.1 Le paper comme outil d'acquisition gratuit

Le paper arxiv est un "lead magnet" technique : les lecteurs qui s'interessent au compiled routing sont exactement le persona Alex. Un lien vers PML dans le paper = trafic qualifie gratuit.

**Action** : le paper doit inclure un lien vers PML cloud avec un CTA subtil :
> "PML is available as an open-source CLI with optional cloud tracing at https://pml.casys.ai"

Pas de "sign up for our premium plan". Juste un lien. Le produit fait le reste.

### 6.2 Le tracing comme argument du paper

Le paper a besoin de plus de traces (374 = trop peu). Le tracing cloud gratuit avec des limites generouses = plus d'utilisateurs = plus de traces = meilleur paper v2. C'est le flywheel.

### 6.3 Le paper justifie un "Research" tier (future)

Si le paper est publie et cite, un tier "Research/Academic" (gratuit, limites elevees, en echange de traces anonymisees) pourrait accelerer le flywheel data. Mais c'est Phase 3.

---

## 7. COMPARAISON AVEC LES CONCURRENTS (AJUSTEE POUR SOLO BUILDER)

Le rapport PMF compare a LangSmith et Datadog. C'est trompeur car PML n'est pas dans la meme ligue. Voici la comparaison pertinente : les outils de la MEME taille.

| Outil | Modele | Free tier | Premier prix | Metric |
|---|---|---|---|---|
| **Posthog** (analytics) | Open Core | 1M events/mois | 0 EUR (genereux free tier) | Events |
| **Sentry** (error tracking) | Open Core | 5K errors/mois | 26 USD/mois | Errors |
| **Langfuse** (LLM obs) | Open Core | 50K observations/mois | 59 USD/mois | Observations |
| **Helicone** (LLM proxy) | Open Core | 10K req/mois | 20 USD/mois | Requests |
| **Axiom** (logs) | Usage-based | 500 GB/mois | 0 EUR (genereux free tier) | GB ingere |
| **PML (recommande)** | **Open Core** | **10K traces/mois** | **19 EUR/mois** | **Traces** |

**Observation cle** : Posthog et Axiom offrent des free tiers ENORMES (1M events, 500 GB). Leur strategie : l'adoption massive gratuite, la conversion sur le volume. Langfuse (le plus proche de PML en positionnement) est plus cher (59 USD) mais a deja une communaute (7K+ stars GitHub).

**PML doit etre plus genereux que Langfuse en free tier** (10K vs 50K observations -- mais PML trace des workflows entiers, donc 10K traces PML ~ 50-100K observations Langfuse en termes de donnees).

---

## 8. SCENARIO FINANCIER REALISTE (SOLO BUILDER)

Le rapport PMF projette 580 EUR MRR a 6 mois. C'est optimiste. Voici un scenario plus realiste :

### Mois 1-6 : Phase gratuite

| Mois | CLI installs | Cloud signups | Actifs/semaine | MRR |
|---|---|---|---|---|
| 1 | 50 | 10 | 3 | 0 EUR |
| 2 | 80 | 25 | 8 | 0 EUR |
| 3 | 120 | 40 | 15 | 0 EUR |
| 4 | 150 | 55 | 22 | 0 EUR |
| 5 | 180 | 70 | 30 | 0 EUR |
| 6 | 200 | 85 | 40 | 0 EUR |

### Mois 6-12 : Introduction du Pro a 19 EUR

| Mois | Cloud actifs | % conversion | Pro payants | MRR |
|---|---|---|---|---|
| 7 | 45 | 5% | 2 | 38 EUR |
| 8 | 50 | 5% | 4 | 76 EUR |
| 9 | 60 | 6% | 6 | 114 EUR |
| 10 | 70 | 7% | 8 | 152 EUR |
| 11 | 80 | 7% | 10 | 190 EUR |
| 12 | 100 | 8% | 12 | 228 EUR |

### Realite

- **228 EUR MRR a 12 mois** : c'est tres modeste. Mais c'est REEL. Le rapport PMF qui projette 580 EUR a 6 mois n'a pas la moindre donnee pour soutenir cette projection.
- **12 clients payants** : c'est suffisant pour avoir des feedback loops, pas suffisant pour vivre.
- **Le fondateur ne vivra pas de PML avant 18-24 mois** minimum. Ce n'est pas un probleme si c'est un side project. C'est un probleme si c'est son seul revenu.

### Scenarios de croissance (mois 12-24)

| Scenario | MRR mois 24 | Condition |
|---|---|---|
| **Pessimiste** | 500 EUR | Pas de viralite, bouche a oreille lent |
| **Base** | 2 000 EUR | 1 Show HN reussi, mention dans 2-3 newsletters |
| **Optimiste** | 5 000 EUR | Paper cite 10+ fois, mention par un influenceur (Fireship, Theo, etc.) |
| **Reve** | 10 000 EUR | Adoption par 1-2 entreprises (team tier), paper cite 50+ fois |

**Le scenario "reve" a 10K EUR MRR en 24 mois n'est pas suffisant pour un salaire temps plein en France** (apres charges, c'est ~5K net). Le fondateur doit avoir une autre source de revenus pendant la phase de croissance.

---

## 9. STRATEGIES DE MONETISATION ALTERNATIVES

Si le tracing cloud ne suffit pas, voici 3 pistes complementaires (toutes compatibles solo builder) :

### 9.1 "Sponsor" model (a la Sidekiq)

Mike Perham (Sidekiq) est le modele du solo builder qui monetise de l'open source. Son approche :

| Sidekiq | PML equivalent |
|---|---|
| Sidekiq OSS : gratuit | PML CLI : gratuit |
| Sidekiq Pro (100 USD/mois) : batching, reliability | PML Pro (19 EUR/mois) : tracing cloud, retention |
| Sidekiq Enterprise (250 USD/mois) : rate limiting, multi-process | PML Team (39 EUR/user/mois) : partage, RBAC |

**Ce qui marche pour Sidekiq** : Mike vend un outil CRITIQUE pour la production. Si ton background job casse en prod, tu paies 100 USD/mois sans hesiter. PML doit atteindre le meme statut : "si mon agent casse en prod, je DOIS avoir PML pour diagnostiquer."

### 9.2 Consulting ponctuel (compatible solo builder)

Le fondateur refuse le consulting regulier (pas de time-for-money). Mais du consulting PONCTUEL est faisable :

| Type | Duree | Prix | Frequence |
|---|---|---|---|
| Audit workflow MCP | 2h | 500 EUR | 1/mois |
| Workshop "Agent observability" | 4h | 1 500 EUR | 1/trimestre |
| Setup PML en entreprise | 1 jour | 2 000 EUR | Quand ca vient |

**Regle** : le consulting n'est PAS le business model. C'est un complement de revenus qui finance le developpement du produit et fournit des retours terrain. Maximum 20% du temps.

### 9.3 Managed hosting (Phase 3)

Si PML a 50+ utilisateurs cloud, proposer du managed hosting (PML as a Service) pour les entreprises qui veulent un tenant dedie :

| Offre | Prix | Ce qu'il inclut |
|---|---|---|
| Managed PML | 500 EUR/mois | Instance dedicee, backup, SLA 99.9%, support prioritaire |

C'est du hosting, pas du dev. Si le fondateur a deja l'infra en place (il utilise deja systemctl pour le deploy), c'est marginal en effort additionnel. Mais c'est Phase 3, pas Phase 1.

---

## 10. LE PIEGE A EVITER : "OPTIMISER LE PRICING AVANT D'AVOIR DES CLIENTS"

Le fondateur est un builder. Les builders adorent optimiser. Le pricing est un probleme d'optimisation seduisant. Le piege :

```
Semaine 1 : "Je vais mettre en place Stripe avec 3 tiers, des coupons, un pricing calculator..."
Semaine 2 : "Il faut gerer la TVA pour les clients EU, et la facturation par pays..."
Semaine 3 : "Le billing dashboard doit montrer l'historique des factures..."
Semaine 4 : Toujours 0 utilisateurs.
```

**La regle** : Si tu as 0 utilisateurs, le prix est 0 EUR. Si tu as 20 utilisateurs, envoie-leur un email : "Je lance un tier Pro a 19 EUR/mois. Voici ce que ca inclut. Ca vous interesse ?" Si 5+ disent oui, integre Stripe Checkout (2h). Si 0 dit oui, le probleme n'est pas le prix.

---

## 11. RECOMMANDATIONS FINALES (CLASSEES PAR PRIORITE)

| # | Action | Quand | Effort | Impact |
|---|---|---|---|---|
| 1 | **Lancer le cloud GRATUIT** avec compteur de traces | Avec le tracing dashboard | 1 jour (compteur) | CRITIQUE -- pas de monetisation sans utilisateurs |
| 2 | **Instrumenter le metric "traces/semaine/user"** | Jour 1 du cloud | 2h | CRITIQUE -- c'est le leading indicator de conversion |
| 3 | **Email de bienvenue** avec onboarding guide quand un dev s'inscrit au cloud | Jour 1 du cloud | 2h | ELEVE -- retention early |
| 4 | **NE PAS integrer Stripe** avant d'avoir 50 utilisateurs actifs | Mois 5-6 | 0h (attendre) | ELEVE -- evite le piege du billing premature |
| 5 | **Email de conversion** a 80% du quota gratuit (8K traces/mois) | Avec le paywall Pro | 3h | MOYEN -- conversion naturelle |
| 6 | **Pro a 19 EUR/mois** usage-based (traces, retention) | Quand 50+ actifs hebdo | 2 jours (Stripe) | MOYEN -- premier revenu |
| 7 | **NE PAS lancer de tier Team** avant 20 clients Pro | Mois 12-18 | 0h (attendre) | -- |
| 8 | **NE PAS faire de Enterprise/Sur devis** tant qu'un prospect ne le demande pas explicitement | Jamais proactivement | 0h | -- |

---

## 12. DESACCORD AVEC LE RAPPORT PMF

| Point | Rapport PMF | Ma position | Justification |
|---|---|---|---|
| Prix Pro | 29 EUR/mois | **19 EUR/mois** | Pas de marque, pas de communaute, pas de leverage. 19 EUR = sous la barre psychologique. |
| Timing monetisation | Implicitement "maintenant" | **Pas avant 50 actifs hebdo** | Le billing est une distraction tant qu'il n'y a pas d'utilisateurs. |
| Limites free tier | 3 MCP servers | **Pas de limite de servers** | Les servers ne sont pas le metric de valeur. Les traces le sont. |
| Metric de pricing | Non specifie | **Traces/mois** | Un seul metric, simple, predictible, aligne avec la valeur. |
| Tier Enterprise | Sur devis | **Ne pas proposer** | Solo builder, pas de sales, pas de support enterprise. |
| Projections | 580 EUR MRR a 6 mois | **0 EUR a 6 mois** | Phase gratuite pour acquérir des utilisateurs d'abord. |

---

## 13. LA PHRASE CLE

**"Le premier probleme de monetisation de PML n'est pas le prix. C'est qu'il n'y a personne a qui facturer. Resolvez le probleme d'acquisition (tracing cloud gratuit + Show HN + paper arxiv) avant de resoudre le probleme de monetisation."**

Le pricing est une consequence de l'adoption, pas un prerequis.

---

*Marie Dubois*
*Ex-Head of Pricing, Algolia / Stripe*
*Specialisee en monetisation de dev tools a croissance organique*
