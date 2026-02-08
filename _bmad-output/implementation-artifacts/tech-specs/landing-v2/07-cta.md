# Section: CTA + Beta

**Ordre:** 7
**Composants:** `BetaSignupSection.tsx` + `CTASection.tsx`
**Émotion:** Action, Urgence douce

---

## BetaSignupSection

### Message

| Élément | Contenu |
|---------|---------|
| **Titre** | Join the beta |
| **Description** | Be among the first to build on the conversational web. |
| **CTA Button** | Start Building |
| **Input Placeholder** | Enter your email |

### Contenu TypeScript

```typescript
export const betaSignup = {
  title: "Join the beta",
  description: "Be among the first to build on the conversational web.",

  form: {
    placeholder: "Enter your email",
    button: "Start Building",
  },

  note: "We'll reach out when your spot is ready.",
};
```

---

## CTASection (Final)

### Message

| Élément | Contenu |
|---------|---------|
| **Titre** | Ready to take control? |
| **Description** | Observable workflows. Deterministic execution. Your infrastructure. |
| **CTA Primary** | Start Building → #quickstart |
| **CTA Secondary** | Browse Catalog → /catalog |

### Contenu TypeScript

```typescript
export const cta = {
  title: "Ready to take control?",

  description:
    "Observable workflows. Deterministic execution. Your infrastructure.",

  actions: {
    primary: {
      label: "Start Building",
      href: "#quickstart",
      icon: "arrow",
    },
    secondary: {
      label: "Browse Catalog",
      href: "/catalog",
      icon: "arrow",
    },
  },
};
```

---

## Différences vs Actuel

| Section | Aspect | Actuel | V2 |
|---------|--------|--------|-----|
| Beta | CTA | "Request Access" | "Start Building" |
| CTA | Titre | "Ready to try?" | "Ready to take control?" |
| CTA | Description | "Give your agents procedural memory..." | "Observable workflows. Deterministic..." |
| CTA | Primary | "Get Started" | "Start Building" |

---

## Design Notes

### BetaSignupSection
- Formulaire email simple
- Bouton "Start Building" cohérent avec le reste
- Message de confirmation discret

### CTASection
- Dernière section avant le footer
- Rappel des 3 piliers dans la description
- Deux CTAs pour choix (quickstart ou catalog)

---

## Vérification

- [ ] Beta CTA : "Start Building"
- [ ] CTA titre : "Ready to take control?"
- [ ] Description rappelle : observable, deterministic, your infrastructure
- [ ] Cohérence des CTAs sur toute la page
