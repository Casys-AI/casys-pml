# Plan — Target runtime inputs + dry preview

Date: 2026-03-04

## Contexte

Le comportement actuel de `run --target` exécute directement le sous-graphe résolu sans phase explicite de préparation des inputs runtime.
Objectif: clarifier l’UX en introduisant:

1. un mode preview (`--dry`) pour inspecter ce qui va s’exécuter,
2. une phase schema-first pour les inputs runtime requis,
3. une validation stricte avant exécution.

## Décisions

- `run --target ... --dry`:
  - n’exécute pas,
  - affiche l’ordre d’exécution,
  - affiche le `input_schema` attendu s’il existe.
- `run --target ...`:
  - si des runtime inputs sont requis et absents: retourne le `input_schema` et stoppe.
  - si `--inputs` fourni: valide via AJV puis exécute.
- `--inputs` accepte:
  - JSON inline (`--inputs '{...}'`),
  - ou fichier JSON (`--inputs @./inputs.json`).

## Contrat runtime input

Références supportées dans frontmatter `inputs`:
- `{{input.foo}}`
- `{{inputs.foo}}`

Schéma:
- source recommandée: frontmatter `input_schema` (JSON Schema fragment),
- fallback: inférence minimale depuis les refs `{{input.*}}` (type `string`, requis).

## Validation

- AJV (`strict: false`, `allErrors: true`).
- En cas d’erreur: liste des erreurs par champ + renvoi du schema.

## Changements techniques

1. `CompiledNode` enrichi avec `inputSchema`.
2. `graph.ts` mappe `frontmatter.input_schema` vers `node.inputSchema`.
3. Nouveau module `runtime-inputs.ts`:
   - extraction des clés runtime,
   - fusion schema déclarés,
   - fallback d’inférence.
4. `validator.ts`:
   - ignore `input` / `inputs` pour `unresolved_input`.
5. `executor.ts`:
   - résolution templates runtime (`{{input.*}}`),
   - support `runtimeInputs` injectés.
6. `cli.ts`:
   - options `--dry`, `--inputs`,
   - rendu schema quand inputs manquants,
   - validation AJV avant exécution,
   - preview topological order.

## Notes UX

- Le mode `--target` devient “schema-first” quand des inputs runtime sont requis.
- Le mode `--dry` sert de préflight déterministe.

## Limites connues (MVP)

- Si plusieurs nœuds déclarent des `input_schema` conflictuels, la fusion est simple (premier arrivé conservé pour une propriété donnée).
- L’inférence fallback est volontairement minimaliste (`string` + required).

## Tests manuels effectués

- `demo-vault`:
  - `--dry` affiche correctement l’ordre sans exécuter.
- Vault temporaire avec `{{input.accountId}}` + `input_schema`:
  - sans `--inputs` => schema retourné,
  - `--inputs` invalide => erreurs AJV,
  - `--inputs` valide => exécution OK.
