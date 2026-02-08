# Section: QuickStart

**Ordre:** 5
**Composant:** `QuickStartSection.tsx` (existant, modifier messaging)
**Émotion:** Confiance, "C'est facile"

---

## Message

| Élément | Contenu |
|---------|---------|
| **Label** | Quick Start |
| **Titre** | Get started in minutes |
| **Sous-titre** | Connect PML to your chat. Access your apps instantly. |
| **CTA** | Read the Docs → /docs |

---

## Steps

| # | Titre | Description | Code |
|---|-------|-------------|------|
| 1 | Install PML | One command. Linux, macOS, Windows. | `curl -fsSL https://pml.casys.ai/install.sh \| sh` |
| 2 | Initialize | Creates config for your chat client. | `pml init` |
| 3 | Start using | That's it. Your apps are now accessible. | Exemple d'utilisation |

---

## Contenu TypeScript

```typescript
export const quickStart = {
  label: "Quick Start",
  title: "Get started in minutes",
  subtitle: "Connect PML to your chat. Access your apps instantly.",

  steps: [
    {
      id: "install",
      title: "Install PML",
      description: "One command. Works on Linux, macOS, and Windows.",
      filename: "terminal",
      codeHtml: `<span class="cmd">$</span> curl -fsSL https://pml.casys.ai/install.sh | sh
<span class="dim">✓ Installed pml to /usr/local/bin/pml</span>`,
    },
    {
      id: "init",
      title: "Initialize your project",
      description: "Creates config for Claude Code, ChatGPT, or your own interface.",
      filename: "terminal",
      codeHtml: `<span class="cmd">$</span> pml init
<span class="dim">Created .pml.json</span>
<span class="dim">Created .mcp.json</span>`,
    },
    {
      id: "use",
      title: "Access your apps",
      description: "Your workflows are now accessible from any connected chat.",
      filename: "chat",
      codeHtml: `<span class="comment"># From any chat:</span>
"Deploy the latest release and notify the team"

<span class="dim">→ ops:deployNotify executed</span>
<span class="dim">→ 3 tools called, 1.2s total</span>`,
    },
  ],

  cta: {
    label: "Read the Docs",
    href: "/docs",
  },
};
```

---

## Différences vs Actuel

| Aspect | Actuel | V2 |
|--------|--------|-----|
| Titre | "Up and running in 3 steps" | "Get started in minutes" |
| Sous-titre | "Add procedural memory to Claude Code..." | "Connect PML to your chat. Access your apps instantly." |
| Step 3 | Montre discover/execute | Montre utilisation naturelle via chat |

---

## Design Notes

- Garder le format 3 steps avec code blocks
- Step 3 doit montrer le résultat final : parler au chat → action exécutée
- Mettre l'accent sur la simplicité, pas sur les détails techniques

---

## Vérification

- [ ] Titre : "Get started in minutes"
- [ ] 3 steps clairs
- [ ] Step 3 montre l'utilisation finale (chat → résultat)
- [ ] CTA : "Read the Docs"
- [ ] Pas de jargon technique excessif
