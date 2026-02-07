import type { LinkInternalReferencesCommand, LinkInternalReferencesResult } from '../../types/link-internal-references.types';

export interface LinkInternalReferencesPort {
  execute(command: LinkInternalReferencesCommand): Promise<LinkInternalReferencesResult>;
}
