# Section: Blog

**Ordre:** 6
**Composant:** `BlogSection.tsx` (existant, modifier messaging)
**Émotion:** Crédibilité, Confiance

---

## Message

| Élément | Contenu |
|---------|---------|
| **Label** | Blog |
| **Titre** | Insights & Updates |
| **Description** | Technical deep dives and product updates. |
| **CTA** | View All Posts → /blog |

---

## Contenu TypeScript

```typescript
export const blog = {
  label: "Blog",
  title: "Insights & Updates",
  description: "Technical deep dives and product updates.",
  cta: {
    label: "View All Posts →",
    href: "/blog",
  },
};
```

---

## Différences vs Actuel

| Aspect | Actuel | V2 |
|--------|--------|-----|
| Label | "Engineering Blog" | "Blog" |
| Titre | "Latest Insights" | "Insights & Updates" |
| Description | "Deep dives, debugging stories, and lessons learned." | "Technical deep dives and product updates." |

---

## Design Notes

- Garder l'affichage des 3 derniers posts
- Format carte existant fonctionne bien
- Section sobre, pas besoin de changements majeurs

---

## Vérification

- [ ] Titre : "Insights & Updates"
- [ ] 3 posts récents affichés
- [ ] CTA : "View All Posts →"
- [ ] Lien vers /blog fonctionne
