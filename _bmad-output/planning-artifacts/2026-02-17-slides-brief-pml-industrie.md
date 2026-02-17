# Brief Slides — "PML : l'orchestrateur intelligent pour l'ingénierie système"

## Contexte pour le générateur de slides

**Audience** : 1 personne, profil technique/ingénierie, connaît l'industrie mais pas PML.
**Durée** : 30 minutes (12 min slides contexte, 10 min démo live, 7 min slides conclusion, 1 min questions).
**Ton** : Direct, concret, zéro bullshit. Pas de jargon IA ("intelligent", "smart", "revolutionary"). On parle infrastructure, plomberie, build system. Le produit est ennuyeux à dessein — c'est de la tuyauterie fiable.
**Style visuel** : Dark theme (fond très sombre #08080a, texte clair #e7e5e4, accent orange #FFB86F). Minimaliste, peu de texte par slide, beaucoup de schémas simples. Police monospace pour le code, sans-serif pour le reste.

---

## PARTIE 1 — CONTEXTE & PROBLÈME (slides 1-6, ~12 min)

---

### Slide 1 — Accroche

**Titre** : (aucun titre, juste le chiffre)

**Contenu visuel** : Au centre, en très gros :
```
2-3 semaines → 5 minutes
```
En dessous, en plus petit : "Du cahier des charges au coût produit chiffré"

**Ce que le présentateur dit** :
"Aujourd'hui quand un ingénieur système veut passer d'un cahier des charges à un coût produit chiffré — avec la BOM, les matériaux, la traçabilité — ça prend 2 à 3 semaines. Je vais te montrer comment le faire en 5 minutes."

**Note design** : Le "2-3 semaines" est en rouge/gris barré, le "5 minutes" est en orange (#FFB86F) lumineux. Effet de contraste maximal.

---

### Slide 2 — Le problème : les silos industriels

**Titre** : "4 outils, 0 connexion"

**Contenu visuel** : Schéma avec 4 boîtes disposées en carré, SANS flèches entre elles :
- En haut à gauche : **SysON / Cameo** (sous-titre : "Modélisation système")
- En haut à droite : **SAP / Odoo** (sous-titre : "ERP / Production")
- En bas à gauche : **Simulation** (sous-titre : "Analyse / Validation")
- En bas à droite : **Qualité** (sous-titre : "Plans d'inspection / Conformité")

Au centre des 4 boîtes : une icône de personne (l'ingénieur) avec des flèches manuelles en pointillé dans tous les sens, suggérant le chaos.

**Ce que le présentateur dit** :
"Dans l'industrie, tu as ces 4 types d'outils qui ne se parlent pas. Un outil de modélisation système — SysON, Cameo, Capella. Un ERP — SAP, Odoo. Des outils de simulation. Des outils qualité. Chaque changement traverse ces silos manuellement. L'ingénieur change un matériau dans le modèle, il doit ensuite aller manuellement mettre à jour la nomenclature dans l'ERP, recalculer les coûts, vérifier que le nouveau matériau passe les contraintes qualité. Tout ça à la main, avec des copier-coller entre outils."

---

### Slide 3 — Les 3 boucles de l'ingénierie système

**Titre** : "3 boucles, toutes manuelles"

**Contenu visuel** : 3 cercles concentriques (du plus petit au plus grand), chacun avec une flèche circulaire :

- **Cercle intérieur (orange)** : "1. Modéliser" — sous-titre : "Construire l'architecture du système (SysML v2 : parts, requirements, relations)"
- **Cercle milieu (bleu/gris)** : "2. Valider" — sous-titre : "BOM, estimation coûts, vérification contraintes, simulation"
- **Cercle extérieur (rouge/gris)** : "3. Itérer" — sous-titre : "Changer un paramètre → tout relancer"

En dessous des cercles, une annotation en rouge : "Boucle 3 = cauchemar. Chaque variante repart de zéro."

**Ce que le présentateur dit** :
"En ingénierie système, il y a 3 boucles itératives. D'abord tu modélises — tu construis l'architecture du système en SysML : les parts, les requirements, les relations. Ensuite tu valides — tu génères la BOM, tu estimes les coûts, tu vérifies les contraintes. Et enfin tu itères — un paramètre change, tu dois tout relancer. C'est cette troisième boucle qui tue. Parce qu'aujourd'hui, chaque variante repart quasiment de zéro. Tu changes un matériau, tu refais tout le pipeline manuellement."

---

### Slide 4 — PML : le build system de l'ingénierie

**Titre** : "PML = Make/CMake pour l'ingénierie"

**Contenu visuel** : Le même schéma que la slide 2 (4 boîtes SysON / ERP / Simulation / Qualité), MAIS cette fois :
- Au centre : un hexagone orange avec "PML" écrit dedans
- Des flèches pleines (pas pointillées) connectent PML à chaque boîte
- L'icône de personne est maintenant au-dessus de PML, avec une seule flèche descendante vers PML (l'ingénieur ne parle qu'à PML)
- Sous le schéma, un encadré code :
```
Intent : "Crée le système thermique et estime le coût"
         ↓
PML compile un DAG de 50+ opérations en parallèle
         ↓
Résultat : modèle + BOM + coûts en 5 min
```

**Ce que le présentateur dit** :
"PML c'est la couche qui connecte ces outils. Tu décris ton intention en langage naturel. PML compile un DAG — un graphe d'exécution acyclique dirigé — qui traverse les silos automatiquement. L'analogie la plus juste : SysON c'est le compilateur C, SAP c'est le linker, PML c'est Make ou CMake. Il orchestre les outils, gère les dépendances entre tâches, parallélise ce qui peut l'être, cache les résultats, et apprend les patterns récurrents."

---

### Slide 5 — Les 5 valeurs différentiantes

**Titre** : "Pourquoi PML, pas un script Python"

**Contenu visuel** : 5 lignes, chacune avec une icône à gauche, un titre en gras, et une phrase courte :

1. 🔀 **Cross-domaine** — Un intent traverse N outils (modélisation → BOM → coût → qualité). PML compile toute la chaîne.
2. ⚡ **Parallélisation auto** — PML analyse les dépendances et exécute en parallèle. 3-5x plus rapide qu'un script séquentiel.
3. 🧠 **Mémoire procédurale** — 1ère fois : le LLM compose le workflow. 10ème fois : le GRU route sans LLM (coût ÷100). 50ème fois : DAG compilé, zéro token, instantané.
4. 📋 **Traçabilité 7D** — Chaque exécution tracée : outils appelés, timing, dépendances causales, checkpoints. Audit DO-178C / ISO 26262 / EN 9100.
5. 🔁 **Reproductibilité** — Le même workflow s'applique à N systèmes différents. L'expertise du senior est capitalisée en artefact réutilisable.

**Note design** : Pas d'emojis si le style ne s'y prête pas — remplacer par des icônes minimalistes (lignes fines, style Material).

**Ce que le présentateur dit** :
"Pourquoi pas juste un script Python ? 5 raisons. Un — cross-domaine : un seul intent traverse N outils, PML compile la chaîne complète. Deux — parallélisation automatique : PML analyse les dépendances entre tâches et lance en parallèle tout ce qui peut l'être, c'est 3 à 5 fois plus rapide. Trois — mémoire procédurale : la première fois, un LLM compose le workflow. La dixième fois, le modèle ML route sans LLM, le coût est divisé par 100. La cinquantième fois, le DAG est compilé, zéro token consommé, exécution instantanée. Quatre — traçabilité : chaque exécution est tracée dans 7 dimensions, c'est auditable pour les certifications aéro et auto. Cinq — reproductibilité : le même workflow s'applique à N systèmes différents. L'expertise d'un ingénieur senior est capitalisée en artefact que n'importe qui peut réutiliser."

---

### Slide 6 — Le flywheel

**Titre** : "L'effet réseau des données d'ingénierie"

**Contenu visuel** : Un cercle avec 6 étapes, des flèches qui vont dans le sens des aiguilles d'une montre :

```
Plus de workflows exécutés
    → Plus de traces collectées
        → Meilleur routing ML (SHGAT apprend les patterns)
            → Plus de workflows compilés (warm → hot)
                → Coût réduit, vitesse augmentée
                    → Plus d'utilisateurs
                        → (retour au début)
```

En dessous du cercle, en italique orange : "Les données d'entraînement MBSE/PLM sont rares et précieuses. Qui les a = moat."

**Ce que le présentateur dit** :
"Et tout ça crée un cercle vertueux. Plus de workflows exécutés, plus de traces collectées, meilleur est le routing ML, plus de workflows passent en mode compilé — zéro LLM — le coût baisse, la vitesse augmente, plus d'utilisateurs arrivent, et la boucle recommence. Le point clé : les données d'entraînement sur les workflows MBSE et PLM sont extrêmement rares. Personne ne les collecte aujourd'hui. Celui qui les a en premier a le moat."

---

## TRANSITION DÉMO

---

### Slide 7 — Transition

**Titre** : (aucun)

**Contenu visuel** : Juste le mot "DÉMO" en très gros au centre, en orange (#FFB86F).

En dessous, en petit : "4 temps · Modèle → Coût → Variante → Reproductibilité"

**Ce que le présentateur dit** :
"Assez de slides. Je vais te montrer."

**Note** : Le présentateur passe à la démo live sur son terminal / browser. Les slides qui suivent (8-12) sont pour APRÈS la démo.

---

## DÉMO LIVE (pas de slides, ~10 min)

Le présentateur fait la démo en live. Voici le script :

**Temps 1 — Création du modèle (2-3 min)**
- Le présentateur tape un intent : "Crée un système de contrôle thermique satellite avec 3 sous-systèmes : dissipation, régulation, monitoring"
- PML compile un DAG d'environ 15 tâches (création du projet SysON, des packages, des parts, des relations)
- On voit le modèle se construire dans l'UI SysON en temps réel
- Le présentateur montre le DAG d'exécution (les tâches parallélisées, les dépendances)

**Temps 2 — Estimation de coût (1-2 min)**
- Intent : "Estime le coût de ce système"
- PML exécute : plm_bom_generate (BOM depuis le modèle) → plm_bom_cost (calcul coûts matériaux) → plm_bom_flatten (vue aplatie)
- Résultat : tableau BOM avec coûts par part, total, répartition par sous-système

**Temps 3 — Variante (1-2 min)**
- Intent : "Remplace l'aluminium par du cuivre dans le dissipateur et recalcule"
- PML relance le pipeline (DAG compilé, pas besoin de recomposer)
- Résultat : delta visible ("+23% coût, -15% masse, conductivité thermique x2")

**Temps 4 — Reproductibilité (1 min)**
- Intent : "Applique la même analyse de coût à mon autre système"
- La capability est en mode "warm" — le workflow est déjà connu
- Exécution quasi-instantanée sur un autre modèle

---

## PARTIE 2 — POST-DÉMO (slides 8-12, ~7 min)

---

### Slide 8 — Récap de ce qu'on vient de voir

**Titre** : "5 minutes, 4 résultats"

**Contenu visuel** : Timeline horizontale avec 4 étapes, chacune avec une icône et un résultat concret :

```
[1. Modèle]          [2. Coûts]           [3. Variante]        [4. Reproductible]
Système SysML v2     BOM + estimation     Delta Cu vs Al       Même workflow,
complet, 3 sous-     coût par part        +23% coût            autre système,
systèmes, 15+        et par sous-         -15% masse           exécution
éléments créés       système              conductivité x2      instantanée
```

En dessous : "Tout est tracé. Tout est reproductible. Tout est auditable."

**Ce que le présentateur dit** :
"Récap. En 5 minutes on a : construit un modèle SysML v2 complet avec 3 sous-systèmes, généré la nomenclature et chiffré le coût matière, exploré une variante cuivre vs aluminium avec le delta exact, et appliqué le même workflow à un autre système instantanément. Et chaque étape est tracée — on peut rejouer, auditer, comparer."

---

### Slide 9 — Le spectre cold → warm → hot

**Titre** : "Mémoire procédurale : de l'IA au déterminisme"

**Contenu visuel** : Barre horizontale avec un dégradé de gauche (bleu froid) à droite (orange chaud) :

```
COLD (1ère fois)              WARM (2-10x)              HOT (11x+)
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ LLM compose     │     │ GRU route       │     │ DAG compilé     │
│ le DAG           │ →   │ sans LLM         │ →   │ déterministe    │
│                  │     │                  │     │                  │
│ Coût: $$$        │     │ Coût: $          │     │ Coût: 0          │
│ Latence: 10-30s  │     │ Latence: 1-3s    │     │ Latence: <500ms  │
│ Reproductible:   │     │ Reproductible:   │     │ Reproductible:   │
│ Non              │     │ Partiellement    │     │ 100%             │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Ce que le présentateur dit** :
"Le mécanisme central c'est ce spectre cold-warm-hot. La première fois que tu fais un workflow, un LLM compose le DAG — c'est le mode cold. C'est lent, ça coûte des tokens. Après quelques exécutions similaires, le modèle GRU — un petit réseau entraîné sur tes traces — route les outils sans LLM. Coût divisé par 100. Et après une dizaine d'exécutions, le DAG est compilé. C'est du pur déterminisme, zéro token, exécution en millisecondes. En industrie, le même workflow tourne des dizaines de fois par semaine. Le mode hot c'est le mode normal d'opération."

---

### Slide 10 — Vision : orchestration distribuée

**Titre** : "Demain : N machines PML, 1 seul intent"

**Contenu visuel** : 3 hexagones PML connectés en réseau, chacun avec ses outils locaux :

```
┌──── Machine 1 ────┐     ┌──── Machine 2 ────┐     ┌──── Machine 3 ────┐
│  PML               │     │  PML               │     │  PML               │
│  ├── SysON         │ ←──→│  ├── SAP           │ ←──→│  ├── Qualité       │
│  ├── Simulation    │     │  ├── Odoo          │     │  ├── Plans inspect. │
│  └── lib/plm       │     │  └── Comptabilité  │     │  └── Conformité    │
│                    │     │                    │     │                    │
│  Équipe Système    │     │  Production        │     │  Sous-traitant     │
└────────────────────┘     └────────────────────┘     └────────────────────┘
```

Au-dessus, une flèche unique : `pml execute --intent "Change request #4523"`

**Ce que le présentateur dit** :
"La vision long terme : chaque équipe, chaque site, chaque sous-traitant a sa propre instance PML avec ses propres outils. Un seul intent — par exemple une demande de changement — traverse automatiquement les frontières organisationnelles. L'équipe système met à jour le modèle, la production met à jour la BOM dans SAP, le sous-traitant génère le nouveau plan d'inspection qualité. Tout coordonné, tout tracé. C'est de l'orchestration distribuée d'outils d'ingénierie."

---

### Slide 11 — Roadmap bridges + marché

**Titre** : "Feuille de route"

**Contenu visuel** : Deux colonnes.

Colonne gauche — **Bridges prévus** (tableau) :

| Phase | Bridge | Effort | Statut |
|-------|--------|--------|--------|
| Phase 1 | SysON (MBSE) + lib/plm (BOM, coûts) | 2 sem | ✅ Done |
| Phase 2 | IFC / IFC.js (jumeaux numériques usine) | 1 sem | Prévu |
| Phase 2 | SAP OData (ERP) | 2 sem | Prévu |
| Phase 2 | OPC-UA / Node-OPCUA (automates PLC) | 2 sem | Prévu |
| Phase 3 | 3DS REST (Dassault Systèmes) | 2-3 sem | Évaluation |

Colonne droite — **Marché cible** :

- Persona : Marie, ingénieur système dans un OEM aéro/auto
- Douleur : 3 semaines pour changement design → BOM → qualité
- TAM : 5000+ entreprises industrielles EU avec processus MBSE
- Pricing : 500-2000 €/mois (licence enterprise)
- Moat : données de traces MBSE/PLM (personne ne les collecte)

**Ce que le présentateur dit** :
"Côté roadmap : Phase 1, c'est ce que tu viens de voir — SysON plus lib/plm pour la BOM et le costing. Phase 2 : IFC.js pour les jumeaux numériques d'usine, bridge SAP pour l'ERP, OPC-UA pour les automates. En 5-6 semaines de bridges, on couvre la stack complète d'un OEM aéro ou automobile. Le marché, c'est pas les développeurs solo. C'est les entreprises industrielles européennes — 5000+ boîtes qui font du MBSE. Le willingness-to-pay c'est 500 à 2000 euros par mois en licence enterprise. Et le moat, c'est les données : personne ne collecte les traces de workflows MBSE/PLM aujourd'hui."

---

### Slide 12 — Slide finale

**Titre** : (aucun titre formel)

**Contenu visuel** : En haut, le logo PML (texte simple "PML" en monospace, ou logo si disponible).

Au centre, le positionnement final en gros :

> "PML connecte les silos industriels et rend les workflows d'ingénierie reproductibles."

En dessous, la punchline :

> "Modèle → coût du produit en 2 clics. N variantes simulées instantanément."

En bas de slide : URL ou contact.

**Ce que le présentateur dit** :
"PML connecte les silos industriels et rend les workflows d'ingénierie reproductibles. Modèle, coût, variante, en quelques clics. Des questions ?"

---

## Notes pour le générateur de slides

### Style à éviter absolument
- Pas de mots : "révolutionnaire", "intelligent", "smart", "AI-powered", "game-changer"
- Pas de stock photos
- Pas de bullet points interminables (max 5 lignes par slide)
- Pas de sous-titres creux ("Notre vision", "Notre mission")

### Style à viser
- Schémas techniques simples (boîtes + flèches)
- Peu de texte, beaucoup d'espace vide
- Chiffres concrets quand possible (3-5x, ÷100, 5000+)
- Code monospace pour les exemples d'intent
- Dark theme cohérent

### Palette de couleurs
- Fond : #08080a (presque noir)
- Texte principal : #e7e5e4 (stone clair)
- Accent / highlights : #FFB86F (orange PML)
- Secondaire : #6b7280 (gris moyen pour le texte moins important)
- Succès/positif : #4ade80 (vert)
- Alerte/négatif : #f87171 (rouge)

### Police
- Titres : sans-serif géométrique (Inter, Geist, ou Satoshi)
- Corps : même sans-serif
- Code / intents : monospace (JetBrains Mono, Fira Code, ou Geist Mono)
