import type { LinkSectionsToTopicsCommand, LinkSectionsToTopicsResult } from '../../types/link-sections-to-topics.types';

export interface LinkSectionsToTopicsPort {
  execute(command: LinkSectionsToTopicsCommand): Promise<LinkSectionsToTopicsResult>;
}
