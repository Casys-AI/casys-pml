# Section: Problem

**Ordre:** 2
**Composant:** `ProblemSection.tsx` (nouveau)
**Émotion:** Tension, Reconnaissance du problème

---

## Message

| Élément | Contenu |
|---------|---------|
| **Label** | The Problem |
| **Titre** | Today, your AI tools are black boxes |
| **Sous-titre** | You don't see what happens. You can't audit. You can't control. |

---

## Points de Douleur

| Icon | Texte |
|------|-------|
| `visibility_off` | No visibility into what's executing |
| `casino` | AI improvises every time — inconsistent results |
| `lock` | Locked into one vendor's ecosystem |

---

## Contenu TypeScript

```typescript
export const problem = {
  label: "The Problem",

  title: "Today, your AI tools are black boxes",

  subtitle:
    "You don't see what happens. You can't audit. You can't control.",

  points: [
    {
      icon: "visibility_off",
      text: "No visibility into what's executing",
    },
    {
      icon: "casino",
      text: "AI improvises every time — inconsistent results",
    },
    {
      icon: "lock",
      text: "Locked into one vendor's ecosystem",
    },
  ],
};
```

---

## Design Notes

- Fond légèrement différent pour créer une rupture avec le Hero
- Icônes en rouge/orange pour signifier le problème
- Peut inclure une illustration "black box" simple

---

## Alternative

Si on ne veut pas créer un nouveau composant, on peut adapter **ArchitectureSection** existante pour porter ce message.

---

## Vérification

- [ ] Label visible : "The Problem"
- [ ] Titre impactant : "black boxes"
- [ ] 3 points de douleur avec icônes
- [ ] Ton : tension, pas accusateur
