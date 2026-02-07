export interface LinkInternalReferencesCommand {
  tenantId: string;
  projectId: string;
  articleId: string;
  sections: { id: string; content?: string }[];
  dryRun?: boolean;
}

export interface LinkInternalReferencesResult {
  linksCreated: number;
}
