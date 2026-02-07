# Audit Architecture des Composants - Août 2025

## Situation Actuelle

### 1. Schéma KuzuDB (`kuzu-connection.ts`)

- Définit des noeuds `Component` sans champs tenant/project (ressources globales)
- Prévoit des relations `USES` (Project → Component) et `ARTICLE_USES` (Article → Component)
- Architecture conçue pour composants globaux reliés à des tenants/projets via relations

### 2. Port de domaine (`component-vector-store.port.ts`)

- Interface prévoit des méthodes `getComponentsByTenant` et `getComponentsByProject`
- Spécification complète pour filtrage multi-tenant/projet
- Accepte les paramètres tenantId/projectId mais non exploités

### 3. Use Cases (`list-components.usecase.ts` et `index-components.usecase.ts`)

- **ListComponentsUseCase**:
  - Interface prévoit granularité à plusieurs niveaux (global, tenant, project, article)
  - Accepte tenantId/projectId en paramètres optionnels
  - Les composants sont traités comme ressources globales dans l'implémentation
- **IndexComponentsUseCase**:
  - Interface simplifiée sans tenantId/projectId dans execute()
  - Méthodes spécifiques pour indexer par tenant existent mais reposent sur un service qui ne les exploite pas
  - Aucune validation de l'existence du tenant/projet avant indexation

### 4. Service de domaine (`component-indexing.service.ts`)

- Reçoit et transmet tenantId/projectId dans les métadonnées
- Structure cohérente avec concept composants globaux + relations
- Passe les métadonnées avec tenantId/projectId à l'adaptateur

### 5. Adaptateur KuzuDB (`kuzu-component-store.adapter.ts`)

- **MANQUE CRITIQUE**: N'établit pas les relations `USES` lors de l'indexation
- Reçoit tenantId/projectId mais ne les utilise pas dans les requêtes Cypher
- Implémentation incomplète des méthodes de filtrage tenant/projet

### 6. Routes API (`indexing.ts` et `list.ts`)

- Routes avec paramètres tenant dans l'URL (/tenant/:tenantId/component)
- Inconsistance avec l'implémentation actuelle (composants purement globaux)
- Aucune standardisation des réponses avec le format DTO (contrairement aux routes articles)

### 7. Tests unitaires

- Testent les routes avec tenantId dans l'URL
- Vérifient le format des réponses actuelles (non standardisées)
- Ne testent pas le filtrage par tenant/projet qui n'est pas implémenté

## Actions Immédiates

1. **Implémenter les DTOs standardisés** pour les composants:
   - Standardiser les réponses API avec `createResponse`
   - Utiliser les DTOs du container shared comme pour les articles

2. **Tests**:
   - Adapter les tests unitaires au modèle simplifié et aux DTOs

## Actions Futures (à planifier)

- Implémenter les relations `USES` dans l'adaptateur (on est sûr de ce nom USES ? Trop ressemblant avec component usage, il faudrait plutôt un truc du genre "COMPONENT_AVAILABLE_IN" ou "COMPONENT_APPLICABLE_TO")
- Compléter les méthodes de filtrage par tenant/projet
- Réactiver les routes contextuelles avec tenant/projet
