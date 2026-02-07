export interface LinkSectionsToTopicsCommand {
  tenantId: string;
  projectId: string;
  articleId: string;
  sections: { id: string; content?: string }[];
  topics: { id: string; sourceUrl?: string }[];
  dryRun?: boolean;
}

export interface LinkSectionsToTopicsResult {
  linksCreated: number;
}
