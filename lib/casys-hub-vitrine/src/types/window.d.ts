// Déclarations TypeScript pour les fonctions globales personnalisées

declare global {
  interface Window {
    // Modal de création de projet
    openCreateProjectModal: () => void;
    closeCreateProjectModal: () => void;
    
    // Google Analytics (gtag.js)
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export {};
