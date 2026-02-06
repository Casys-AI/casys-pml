# Section: Solution

**Ordre:** 3
**Composant:** `SolutionSection.tsx` (adapter IsolationSection ou nouveau)
**Émotion:** Soulagement, Confiance

---

## Message

| Élément | Contenu |
|---------|---------|
| **Label** | The Solution |
| **Titre** | See what runs. Validate before it executes. Keep control. |

---

## Points de Solution

| Icon | Titre | Description |
|------|-------|-------------|
| `visibility` | Observable | Every step traced. Every workflow auditable. Debug in seconds. |
| `check_circle` | Deterministic | Validated workflows run the same way every time. No improvisation. |
| `person` | Human-in-the-loop | Checkpoints for approval. Review and validate without going through AI. |
| `dns` | Self-hosted | Run on your infrastructure. Your data stays yours. No vendor lock-in. |

---

## Contenu TypeScript

```typescript
export const solution = {
  label: "The Solution",

  title: "See what runs. Validate before it executes. Keep control.",

  points: [
    {
      icon: "visibility",
      title: "Observable",
      description: "Every step traced. Every workflow auditable. Debug in seconds.",
    },
    {
      icon: "check_circle",
      title: "Deterministic",
      description: "Validated workflows run the same way every time. No improvisation.",
    },
    {
      icon: "person",
      title: "Human-in-the-loop",
      description: "Checkpoints for approval. Review and validate without going through AI.",
    },
    {
      icon: "dns",
      title: "Self-hosted",
      description: "Run on your infrastructure. Your data stays yours. No vendor lock-in.",
    },
  ],
};
```

---

## Design Notes

- Layout en grille 2x2 ou liste verticale
- Icônes en couleur accent (orange/doré)
- Peut réutiliser le style de IsolationSection actuelle
- Contraste visuel avec la section Problem (couleurs positives)

---

## Lien avec IsolationSection Existante

L'actuelle `IsolationSection` parle déjà d'isolation/sandboxing. On peut :
1. **Remplacer** complètement par cette nouvelle section
2. **Fusionner** les concepts (isolation = partie de "self-hosted/control")
3. **Garder les deux** si l'isolation technique mérite sa propre section

**Recommandation :** Remplacer par cette section plus orientée bénéfices.

---

## Vérification

- [ ] Label : "The Solution"
- [ ] Titre : "See what runs..."
- [ ] 4 points avec icônes + titre + description
- [ ] Ton : confiance, soulagement
- [ ] Contraste visuel avec Problem section
