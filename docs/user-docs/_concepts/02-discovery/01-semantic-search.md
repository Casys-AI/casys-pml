# Semantic Search

> Finding tools by meaning, not keywords

## En bref

La recherche sémantique vous permet de trouver des outils en décrivant ce que vous voulez faire,
plutôt qu'en devinant leur nom exact. Comme un moteur de recherche moderne qui comprend votre
intention, PML trouve les bons outils même si vous utilisez des mots différents de leur nom
officiel.

**Exemple :** Chercher "lire un fichier" trouvera `filesystem:read_file`, "récupérer le contenu"
trouvera le même outil, et "charger des données" aussi.

## The Problem with Keyword Search

Traditional search requires knowing exact names:

- "filesystem:read_file" ✓
- "read file" ✗
- "get contents" ✗

**Semantic search** understands meaning, so all of these work:

- "read a file"
- "get file contents"
- "load data from disk"

## How it Works

![Semantic Search Flow](excalidraw:src/web/assets/diagrams/rag-flow.excalidraw)

1. Your query is converted to a vector (list of numbers)
2. This vector is compared to all stored tool vectors
3. Tools with similar vectors are returned, ranked by similarity

### Analogie : La bibliothèque intelligente

Imaginez une bibliothèque où chaque livre a une "empreinte" qui capture son sujet. Au lieu de
chercher par titre exact, vous décrivez ce que vous cherchez et la bibliothèque trouve
automatiquement tous les livres dont l'empreinte ressemble à votre description.

**Bibliothèque traditionnelle :** "Je cherche 'Guerre et Paix'" → trouve uniquement ce titre
**Bibliothèque sémantique :** "Je cherche un roman historique russe" → trouve 'Guerre et Paix',
'Anna Karénine', 'Docteur Jivago', etc.

C'est exactement ce que fait la recherche sémantique avec les outils PML.

## Embeddings

An **embedding** is a numerical representation of text that captures its meaning.

| Text           | Embedding (simplified) |
| -------------- | ---------------------- |
| "read file"    | [0.8, 0.2, 0.1, ...]   |
| "get contents" | [0.7, 0.3, 0.1, ...]   |
| "create issue" | [0.1, 0.1, 0.9, ...]   |

Similar meanings → similar numbers → found together.

### Embedding Model

PML uses the BGE-M3 embedding model that runs locally:

- **1024 dimensions** per vector
- **Fast** - milliseconds per embedding
- **No API calls** - works offline

## Similarity Scoring

Similarity is measured using **cosine similarity**:

- **1.0** = identical meaning
- **0.7+** = very similar
- **0.5+** = somewhat related
- **< 0.3** = unrelated

### Example Search

Query: "upload to github"

| Tool                  | Similarity |
| --------------------- | ---------- |
| github:create_issue   | 0.82       |
| github:push           | 0.78       |
| github:create_pr      | 0.71       |
| filesystem:write_file | 0.31       |

The top results are GitHub tools because they're semantically closest to "upload to github".

### Exemples concrets de requêtes

Voici des exemples réels de ce que vous pouvez chercher et ce que PML trouvera :

**Scénario 1 : Travail avec des fichiers**

```
Requête : "analyser le contenu d'un document"
Résultats trouvés :
  ✓ filesystem:read_file (0.84)
  ✓ text:parse_content (0.79)
  ✓ analysis:extract_info (0.72)
```

**Scénario 2 : Collaboration**

```
Requête : "partager mon code avec l'équipe"
Résultats trouvés :
  ✓ github:create_pr (0.87)
  ✓ github:push (0.81)
  ✓ git:commit (0.76)
```

**Scénario 3 : Automatisation**

```
Requête : "exécuter une tâche répétitive"
Résultats trouvés :
  ✓ automation:create_workflow (0.83)
  ✓ script:run_batch (0.78)
  ✓ scheduler:add_job (0.74)
```

Notez que dans chaque cas, vous n'avez pas besoin de connaître les noms exacts des outils ni leur
namespace.

## Pourquoi c'est utile en pratique

La recherche sémantique transforme votre façon de travailler avec PML :

**Gain de temps**

- Plus besoin de parcourir des listes d'outils
- Trouvez instantanément ce dont vous avez besoin
- Commencez à être productif immédiatement

**Découverte naturelle**

- Explorez les capacités en posant des questions
- Découvrez des outils que vous ne connaissiez pas
- Apprenez en utilisant votre propre vocabulaire

**Flexibilité linguistique**

- Utilisez vos propres mots
- Pas besoin de mémoriser des conventions de nommage
- Fonctionne même avec des descriptions approximatives

**Cas d'usage réel :** Un développeur nouveau sur PML tape "envoyer une notification" sans savoir
qu'il existe un outil `notifications:send_alert`. La recherche sémantique trouve instantanément le
bon outil, et le développeur peut continuer son travail sans consulter la documentation.

## When to Use

Semantic search is ideal when:

- You don't know the exact tool name
- You want to explore available tools
- You're describing what you want to do, not how

## Next

- [Hybrid Search](./02-hybrid-search.md) - Combining semantic with graph signals
- [Proactive Suggestions](./03-proactive-suggestions.md) - Automatic recommendations
