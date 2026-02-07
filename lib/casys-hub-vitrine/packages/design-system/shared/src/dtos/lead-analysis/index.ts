/**
 * Lead Analysis DTOs
 * Contrats de données partagés entre API et Dashboard Angular
 */

// Business Context
export type {
  BusinessContextDTO,
  PersonaProfileDTO,
  PersonaProfileDetailsDTO,
} from './business-context.dto';

// Domain Metrics
export type {
  DomainMetricsDTO,
  TopKeywordDTO,
} from './domain-metrics.dto';

// Ontology
export type {
  DomainOntologyDTO,
  OntologyNodeDTO,
  OntologyEdgeDTO,
} from './ontology.dto';

// Lead Snapshot (main aggregate)
export type {
  LeadSnapshotDTO,
  LeadSeedsDTO,
} from './lead-snapshot.dto';
