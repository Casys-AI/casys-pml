# Schema Inference

> Automatically detecting capability parameters

## En bref

Imaginez preter votre voiture sans manuel d'utilisation. Votre ami observe les commandes et deduit le "mode d'emploi" : ou est le frein a main, comment regler les retroviseurs, etc.

Le schema inference de PML fonctionne pareil : il analyse le code pour comprendre automatiquement les parametres necessaires (nom, type, role). Pas besoin de documenter manuellement.

**Exemple :** Script qui lit un fichier JSON. PML detecte automatiquement qu'il faut un parametre "path" (texte) et peut-etre "encoding" (optionnel). La prochaine fois, PML sait quoi demander.

**L'avantage :** Zero documentation manuelle. PML comprend automatiquement comment reutiliser vos solutions avec de nouveaux parametres.

## How it Works

When PML captures a capability, it doesn't just store the code—it analyzes it to understand what **parameters** the capability accepts.

### Moteur d'analyse : SWC

PML utilise **SWC** (Speedy Web Compiler), un parser AST base sur Rust :

| Caracteristique | Valeur |
|-----------------|--------|
| **Performance** | 20x plus rapide que ts-morph |
| **Compatibilite** | Deno-native (zero configuration) |
| **Analyse** | TypeScript/JavaScript AST complet |

**Flow d'inference :**
```
Code TypeScript → SWC parse AST → Detecte args.xxx (MemberExpression)
    → Infere types depuis MCP schemas → Genere JSON Schema
```

SWC permet d'analyser le code instantanement pour en extraire les parametres sans impacter les performances d'execution.

### Exemple d'analyse

```
┌─────────────────────────────────────────────────────────────────┐
│                    Schema Inference                              │
│                                                                  │
│  Input Code:                                                     │
│    const content = await mcp.read_file({ path: "data.json" });  │
│    const parsed = JSON.parse(content);                          │
│    return parsed.users;                                          │
│                                                                  │
│  Inferred Schema:                                                │
│    {                                                             │
│      path: { type: "string", description: "File to read" }      │
│    }                                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

This makes capabilities **generalizable**—they can be reused with different inputs.

**Analogie :** Comme une recette de crepes ou "250ml de lait" est un parametre variable (300ml, lait d'amande, lait de soja). PML identifie ce qui est variable vs fixe dans le code.

## Parameter Extraction

PML uses multiple techniques to identify parameters:

### 1. Tool Call Analysis

Every MCP tool call has defined parameters. PML extracts these:

```
Tool Call: mcp.filesystem.read_file({ path: "config.json" })

Tool Schema says:
  path: string (required) - File path to read

PML Infers:
  Capability parameter: path (string)
```

### 2. Literal Value Detection

Hardcoded values that look like they should be parameters:

```
Code: const url = "https://api.example.com/users"

Detection:
  "https://api.example.com/users" looks like a URL
  → Suggest as parameter: endpoint (string)
```

### 3. Variable Tracing

Variables that flow into tool calls are tracked:

```
Code:
  const fileName = "report.csv";
  await mcp.write_file({ path: fileName, content: data });

Tracing:
  fileName → path parameter
  → Infer: fileName is a configurable parameter
```

## Type Detection

PML infers parameter types from usage:

### String Detection
String operations, path/URL patterns, string-expecting tools → `mcp.read_file({ path: value })` identifies value as string.

### Number Detection
Arithmetic operations, count/limit/offset patterns → `mcp.search({ limit: value })` identifies value as number.

### Boolean Detection
Conditions, boolean parameters, true/false literals → `mcp.list_files({ recursive: value })` identifies value as boolean.

### Object/Array Detection
Destructured access, iteration patterns → `for (const item of value)` identifies value as array.

## Inference Confidence

Not all inferences are equally reliable:

| Source | Confidence | Example |
|--------|------------|---------|
| Tool schema | High | `read_file` requires `path: string` |
| Type annotation | High | User wrote `path: string` |
| Usage pattern | Medium | Variable used as string |
| Heuristic | Low | Looks like a URL |

```
Parameter: filePath
  Inferred type: string
  Confidence: HIGH
  Reason: Tool schema requires string for 'path' parameter
```

## Generated Schema

The final schema combines all inferences:

```
Capability: read_and_parse_json

Inferred Schema:
┌─────────────────────────────────────────────────────────────────┐
│  Parameters:                                                     │
│                                                                  │
│  path (required)                                                │
│    Type: string                                                 │
│    Description: Path to the JSON file                           │
│    Confidence: HIGH                                              │
│    Source: Tool schema                                           │
│                                                                  │
│  encoding (optional)                                             │
│    Type: string                                                 │
│    Default: "utf-8"                                              │
│    Description: File encoding                                    │
│    Confidence: MEDIUM                                            │
│    Source: Usage pattern                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Schema Evolution

Schemas improve over time as PML observes more executions, refining type detection and patterns for greater accuracy.

## Using Inferred Schemas

Schemas enable several features:

### 1. Capability Invocation

When reusing a capability, PML knows what inputs are needed:

```
Capability: process_file
Schema: { path: string, output: string }

Usage:
  "Process the file sales.csv and save to report.txt"

PML Maps:
  path → "sales.csv"
  output → "report.txt"
```

### 2. Validation

Before execution, inputs can be validated:

```
Input: { path: 123, output: "result.txt" }

Validation:
  ✗ path should be string, got number
  ✓ output is valid string
```

### 3. Documentation

Schemas generate automatic documentation:

```
## process_file

Process a file and generate output.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | string | Yes | Input file path |
| output | string | Yes | Output file path |
```

## Benefices concrets pour vous

**Reutilisation intelligente :** Vous creez une solution une fois, PML la rend reutilisable automatiquement sans documentation manuelle.

**Suggestions contextuelles :** Quand PML suggere une capability, il sait deja quoi demander ("cette solution a besoin d'un fichier d'entree et d'un nom de sortie").

**Validation automatique :** PML detecte les erreurs avant execution ("vous avez fourni un nombre, ce parametre attend du texte").

**Documentation auto-generee :** Chaque capability a sa documentation a jour automatiquement, utile pour revisiter un projet apres plusieurs mois.

**Exemple vecu :** Script pour convertir PNG en JPG. Six mois plus tard, besoin de convertir WebP en PNG. PML adapte automatiquement en changeant les parametres sans que vous ayez a vous rappeler comment ca marche.

## Next

- [DAG Structure](../05-dag-execution/01-dag-structure.md) - How capabilities become workflows
- [Parallelization](../05-dag-execution/03-parallelization.md) - Concurrent execution
