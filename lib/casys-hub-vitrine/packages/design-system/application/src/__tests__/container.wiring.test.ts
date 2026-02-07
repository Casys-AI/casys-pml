import { describe, it, expect } from 'vitest';

import { ApplicationContainer } from '../application.container';

// Minimal fake ports to satisfy type constraints when needed
const fakeConfigReader = {
  getProjectConfig: async () => ({ name: 'test', type: 'astro' }),
} as any;

const fakePromptTemplate = {
  loadTemplate: async (_p: string) => '<poml></poml>',
} as any;

const fakeTopicSelectorWorkflow = {
  execute: async () => ({ topics: [], angle: '', seoSummary: { keywordTags: [] } }),
} as any;

describe('ApplicationContainer wiring (smoke)', () => {
  it('build() should not throw with empty deps and returns a services map', () => {
    const container = new ApplicationContainer({});
    const services = container.build();
    expect(services).toBeDefined();
    // No mandatory services should be built without deps
    expect(services.generateArticleLinearUseCase).toBeUndefined();
  });

  it('build() wires selectTopicUseCase when minimal deps provided', () => {
    const container = new ApplicationContainer({
      configReader: fakeConfigReader,
      topicSelectorWorkflow: fakeTopicSelectorWorkflow,
    } as any);
    const services = container.build();
    expect(services.selectTopicUseCase).toBeDefined();
  });

  it('build() wires outlineWriterUseCase when config/prompt/outlineWriter provided', () => {
    const container = new ApplicationContainer({
      configReader: fakeConfigReader,
      promptTemplate: fakePromptTemplate,
      outlineWriter: { generateOutline: async () => ({ title: 't', summary: 's', sections: [] }) },
    } as any);
    const services = container.build();
    expect(services.outlineWriterUseCase).toBeDefined();
  });

  it('listComponentsUseCase is undefined without componentStore', () => {
    const container = new ApplicationContainer({} as any);
    const services = container.build();
    expect(services.listComponentsUseCase).toBeUndefined();
  });

  it('listComponentsUseCase is wired when componentStore provided', () => {
    const fakeComponentStore = {
      upsertMany: async () => {},
      search: async () => [],
    } as any;
    const fakeComponentListing = {
      getAllComponents: async () => ({ components: [] }),
      getComponentsByTenant: async () => ({ components: [] }),
      getComponentsByProject: async () => ({ components: [] }),
      getComponentsByArticle: async () => ({ components: [] }),
      getComponent: async () => ({ success: false, component: undefined }),
    } as any;
    const container = new ApplicationContainer({
      componentStore: fakeComponentStore,
      componentListing: fakeComponentListing,
    } as any);
    const services = container.build();
    expect(services.listComponentsUseCase).toBeDefined();
  });

  it('articlePublicationService should be constructed when configReader is available', () => {
    // This test ensures that ArticlePublicationService is built in the container
    // It would have caught the previous bug where articlePublicationService was undefined
    const container = new ApplicationContainer({
      configReader: fakeConfigReader,
    } as any);
    const services = container.build();
    // After build, deps should have articlePublicationService constructed
    // (even without articlePublisher/articlePublisherGithub, the service can be created)
    expect(container['deps'].articlePublicationService).toBeDefined();
  });
});
