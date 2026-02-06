# Section: Catalog

**Ordre:** 4
**Composant:** `CatalogPreviewSection.tsx` (existant, modifier messaging)
**Émotion:** Confiance, Curiosité

---

## Message

| Élément | Contenu |
|---------|---------|
| **Label** | Catalog |
| **Titre** | Browse. Use. Or build your own. |
| **Description** | Ready-to-use workflows. Or connect your own MCPs and create custom capabilities. |
| **CTA** | Explore Catalog → /catalog |

---

## Contenu TypeScript

```typescript
export const catalogPreview = {
  label: "Catalog",

  title: "Browse. Use. Or build your own.",

  description:
    "Ready-to-use workflows. Or connect your own MCPs and create custom capabilities.",

  // capabilities array reste identique (exemples de workflows)
  capabilities: [
    // ... garder les exemples existants
  ],

  // namespaces grid reste identique
  namespaces: [
    // ... garder les exemples existants
  ],

  cta: {
    label: "Explore Catalog",
    href: "/catalog",
  },
};
```

---

## Éléments à Garder

- **Carousel de capabilities** : Montre des exemples concrets de workflows
- **Grid de namespaces** : Montre la diversité des domaines
- **Code snippets** : Preuve technique

---

## Éléments à Modifier

- **Titre** : "Browse. Use. Or build your own." (au lieu du titre actuel)
- **Description** : Mettre l'accent sur le choix (utiliser existant OU construire)
- **CTA** : "Explore Catalog" (plus invitant que "Browse Full Catalog")

---

## Design Notes

- Cette section sert de **preuve** que l'écosystème existe
- Balance entre "prêt à l'emploi" et "construis le tien"
- Le carousel donne envie d'explorer

---

## Vérification

- [ ] Titre : "Browse. Use. Or build your own."
- [ ] Description mentionne : ready-to-use + build your own
- [ ] Carousel de workflows fonctionne
- [ ] CTA : "Explore Catalog"
- [ ] Lien vers /catalog fonctionne
