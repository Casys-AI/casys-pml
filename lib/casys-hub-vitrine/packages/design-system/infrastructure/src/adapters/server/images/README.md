# Images (fetch/upload)

## Objet

- `ImageFetcherPort` — récupération binaire en mémoire (HTTP)
- Upload d’images vers FS/GitHub (chemins finaux pilotés par la config de publication)

## Fichiers clés

- `http-image-fetcher.adapter.ts` — fetch en mémoire, validation MIME
- `fs-image-uploader.adapter.ts` — écriture dans `publication.file_system.assets_path`
- `github-image-uploader.adapter.ts` — envoi via API Contents vers `publication.github.assets_path`

## Règles Fail Fast

- Format attendu: `image/webp` uniquement (pas de conversion automatique)
- `assets_path` requis si une cover doit être publiée
- Nom: `<slug>-<shortUUID>.webp`

## Notes

- Les publishers orchestrent upload + mise à jour du frontmatter (chemin final) — pas le use case.
