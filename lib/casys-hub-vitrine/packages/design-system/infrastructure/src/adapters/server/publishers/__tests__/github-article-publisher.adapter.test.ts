import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectConfig } from '@casys/shared';
import { type ArticleStructure, type GeneratedFrontmatter } from '@casys/core';
import type { ImageFetcherPort, UserProjectConfigPort } from '@casys/application';

import { GithubArticlePublisherAdapter } from '../github-article-publisher.adapter';

// Mocks dynamiques pour Octokit
let capturedAuth: string | undefined;
let requests: { route: string; params: Record<string, unknown> }[]; // capture des requêtes
let getBehavior: '404' | '200' | 'error' = '404';
let getErrorStatus = 500;
let existingSha = 'existing-sha-123';
let putResponse = {
  data: {
    commit: { sha: 'commit-sha-abc' },
    content: { html_url: 'https://github.com/owner/repo/blob/main/path.md' },
  },
};

// État additionnel pour les routes PR
let baseRefSha = 'base-sha-123';
let branchAlreadyExists = false;
let prAlreadyExists = false;

vi.mock('@octokit/core', () => {
  return {
    Octokit: class {
      constructor(opts: any) {
        capturedAuth = opts?.auth;
      }
      async request(route: string, params: any) {
        requests.push({ route, params });
        // Routes spécifiques PR/Git d'abord
        if (route.startsWith('GET /repos/{owner}/{repo}/git/ref/')) {
          return { data: { object: { sha: baseRefSha } } } as any;
        }
        if (route.startsWith('POST /repos/{owner}/{repo}/git/refs')) {
          if (branchAlreadyExists) {
            const err: any = new Error('Reference already exists');
            err.status = 422;
            throw err;
          }
          return { data: { ref: params?.ref, object: { sha: params?.sha } } } as any;
        }
        if (route.startsWith('POST /repos/{owner}/{repo}/pulls')) {
          if (prAlreadyExists) {
            const err: any = new Error('A pull request already exists');
            err.status = 422;
            throw err;
          }
          return {
            data: { html_url: 'https://github.com/owner/repo/pull/123', number: 123 },
          } as any;
        }
        if (route.startsWith('GET /repos/{owner}/{repo}/pulls')) {
          return {
            data: [{ html_url: 'https://github.com/owner/repo/pull/123', number: 123 }],
          } as any;
        }
        if (route.startsWith('POST /repos/{owner}/{repo}/issues/')) {
          return { data: {} } as any;
        }
        if (route.startsWith('GET ')) {
          if (getBehavior === '404') {
            const err: any = new Error('Not Found');
            (err as any).status = 404;
            throw err;
          } else if (getBehavior === 'error') {
            const err: any = new Error('Server Error');
            (err as any).status = getErrorStatus;
            throw err;
          }
          // 200
          return { data: { sha: existingSha } } as any;
        }
        if (route.startsWith('PUT ')) {
          return putResponse as any;
        }
        throw new Error('Unexpected route');
      }
    },
  };
});

// Mock FrontmatterService minimal (hors vi.mock)
const fmMock = {
  async generateForProject(_article: ArticleStructure): Promise<GeneratedFrontmatter> {
    const slug = 'elevation-l-ia-les-agents-123e4567';
    const fileName = `${slug}.mdx`;
    return {
      content: `---\nslug: ${slug}\n---\n\n`,
      fileName,
      format: 'mdx',
      meta: { canonicalUrl: `https://example.com/${slug}`, slug },
    } as GeneratedFrontmatter;
  },
} as any;

// Stub ImageFetcher minimal pour tous les tests
const imageFetcher: ImageFetcherPort = {
  async fetch(_url: string): Promise<{ data: Uint8Array; mimeType?: string | undefined }> {
    return { data: new Uint8Array([1, 2, 3]), mimeType: 'image/webp' };
  },
};

function makeArticle(overrides?: Partial<ArticleStructure['article']>): ArticleStructure {
  return {
    article: {
      id: '123e4567-e89b-12d3-a456-426614174000',
      title: 'Élévation: L’IA & les-agents!!!',
      description: 'desc',
      language: 'fr',
      createdAt: new Date().toISOString(),
      keywords: [],
      sources: [],
      agents: [],
      tenantId: 'john-doe',
      projectId: 'blog-perso',
      ...overrides,
    },
    sections: [],
    componentUsages: [],
    textFragments: [],
  } as ArticleStructure;
}

function configWith(overrides: Partial<ProjectConfig>): UserProjectConfigPort {
  const base: any = {
    name: 'Test',
    publication: {
      github: {
        enabled: true,
        connection: 'direct',
        repo: 'owner/repo',
        branch: 'main',
        content_path: 'content/articles',
      },
    },
    security: {
      credentials_source: 'environment',
      env_prefix: 'TEST_',
    },
  };
  const cfg = { ...base, ...overrides } as ProjectConfig;
  return {
    async getProjectConfig() {
      return cfg;
    },
    async getUserConfig() {
      return { id: 'test-user' } as any;
    },
    async saveUserConfig() {
      return;
    },
    async saveProjectConfig() {
      return;
    },
    async listUsers() {
      return ['test-user'];
    },
    async listUserProjects() {
      return ['test-project'];
    },
  } as UserProjectConfigPort;
}

const prevEnv = { ...process.env };

beforeEach(() => {
  requests = [];
  capturedAuth = undefined;
  getBehavior = '404';
  getErrorStatus = 500;
  existingSha = 'existing-sha-123';
  putResponse = {
    data: {
      commit: { sha: 'commit-sha-abc' },
      content: { html_url: 'https://github.com/owner/repo/blob/main/any.md' },
    },
  };
  baseRefSha = 'base-sha-123';
  branchAlreadyExists = false;
  prAlreadyExists = false;
});

afterEach(() => {
  process.env = { ...prevEnv };
});

describe('GithubArticlePublisherAdapter - sélection de token (fail-fast)', () => {
  it('Direct: utilise <ENV_PREFIX>GITHUB_TOKEN', async () => {
    process.env.TEST_GITHUB_TOKEN = 'PREFIX_TOKEN';
    delete process.env.GITHUB_TOKEN;
    const cfg = configWith({
      publication: {
        github: {
          enabled: true,
          connection: 'direct',
          repo: 'owner/repo',
          branch: 'main',
          content_path: 'content/articles',
        } as any,
      },
      security: { env_prefix: 'TEST_' } as any,
    });
    const adapter = new GithubArticlePublisherAdapter(cfg, fmMock, imageFetcher);
    await adapter.publishArticle(makeArticle(), 't', 'p');
    expect(capturedAuth).toBe('PREFIX_TOKEN');
  });

  it('Direct: throw si <ENV_PREFIX>GITHUB_TOKEN manquant (aucun fallback)', async () => {
    delete process.env.TEST_GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'CANNOT_USE_IN_DIRECT';
    const cfg = configWith({
      publication: {
        github: {
          enabled: true,
          connection: 'direct',
          repo: 'owner/repo',
          branch: 'main',
          content_path: 'content/articles',
        },
      },
    } as any);
    const adapter = new GithubArticlePublisherAdapter(cfg, fmMock, imageFetcher);
    await expect(adapter.publishArticle(makeArticle(), 't', 'p')).rejects.toThrow(
      /Mode direct: <ENV_PREFIX>GITHUB_TOKEN requis/
    );
  });

  it('PR: utilise uniquement GITHUB_TOKEN', async () => {
    process.env.GITHUB_TOKEN = 'FALLBACK_TOKEN';
    delete process.env.TEST_GITHUB_TOKEN;
    const cfg = configWith({
      publication: {
        github: {
          enabled: true,
          connection: 'pr',
          repo: 'owner/repo',
          branch: 'main',
          content_path: 'content/articles',
          pr: { branch_prefix: 'feature/' },
        } as any,
      },
    } as any);
    const adapter = new GithubArticlePublisherAdapter(cfg, fmMock, imageFetcher);
    await adapter.publishArticle(makeArticle(), 't', 'p');
    expect(capturedAuth).toBe('FALLBACK_TOKEN');
  });

  it('PR: throw si GITHUB_TOKEN manquant', async () => {
    delete process.env.GITHUB_TOKEN;
    const cfg = configWith({
      publication: {
        github: {
          enabled: true,
          connection: 'pr',
          repo: 'owner/repo',
          branch: 'main',
          content_path: 'content/articles',
          pr: { branch_prefix: 'feature/' },
        } as any,
      },
    } as any);
    const adapter = new GithubArticlePublisherAdapter(cfg, fmMock, imageFetcher);
    await expect(adapter.publishArticle(makeArticle(), 't', 'p')).rejects.toThrow(
      /Mode PR: GITHUB_TOKEN requis/
    );
  });
});

describe('GithubArticlePublisherAdapter - cover assets (direct)', () => {
  it("uploade l'image dans assets_base/<slug>/<file>.webp et met à jour cover.src", async () => {
    process.env.TEST_GITHUB_TOKEN = 'OK';
    getBehavior = '404';

    // Spy FrontmatterService pour capturer l'article mis à jour
    const fmSpy = {
      calls: [] as any[],
      generateForProject: vi.fn(async (article: ArticleStructure) => {
        fmSpy.calls.push(article);
        const slug = 'elevation-l-ia-les-agents-123e4567';
        const fileName = `${slug}.mdx`;
        return { content: '---\n---\n', fileName, format: 'mdx', meta: { slug } } as any;
      }),
    } as any;

    // Stub ImageFetcher
    const imageFetcher: ImageFetcherPort = {
      async fetch(_url: string): Promise<{ data: Uint8Array; mimeType?: string | undefined }> {
        return { data: new Uint8Array([1, 2, 3, 4]), mimeType: 'image/webp' };
      },
    };

    const cfg = configWith({
      publication: {
        images: { cover: { format: 'webp' } } as any,
        github: {
          enabled: true,
          connection: 'direct',
          repo: 'owner/repo',
          branch: 'main',
          content_path: 'content/articles',
          assets_path: 'images/articles',
          assets_url_base: '/images/articles',
        } as any,
      },
    } as any);

    const adapter = new GithubArticlePublisherAdapter(cfg, fmSpy, imageFetcher as any);

    const article = makeArticle({ cover: { src: 'https://example.com/cover.webp', alt: 'alt' } });
    await adapter.publishArticle(article, 't', 'p');

    // PUT attendu pour l'asset dans images/articles/<slug>/<file>.webp
    const assetPut = requests.find(
      r =>
        r.route.startsWith('PUT ') &&
        typeof r.params?.path === 'string' &&
        /^images\/articles\/elevation-l-ia-les-agents-123e4567\/elevation-l-ia-les-agents-123e4567-[a-f0-9]{8}\.webp$/.test(
          r.params.path
        )
    );
    expect(assetPut).toBeTruthy();

    // FrontmatterService doit avoir reçu un article avec cover.src mis à jour en route-absolute
    expect(fmSpy.generateForProject).toHaveBeenCalled();
    const updated = fmSpy.calls[0] as ArticleStructure;
    expect(updated.article.cover?.src).toMatch(
      new RegExp(
        '^/images/articles/elevation-l-ia-les-agents-123e4567/elevation-l-ia-les-agents-123e4567-[a-f0-9]{8}\\.webp$'
      )
    );
  });
});

describe('GithubArticlePublisherAdapter - validations config', () => {
  it('throw si repo invalide', async () => {
    process.env.GITHUB_TOKEN = 'OK';
    const cfg = configWith({
      publication: {
        github: {
          enabled: true,
          connection: 'pr',
          repo: 'invalid',
          branch: 'main',
          content_path: 'content/articles',
        },
      },
    } as any);
    const adapter = new GithubArticlePublisherAdapter(cfg, fmMock, imageFetcher);
    await expect(adapter.publishArticle(makeArticle(), 't', 'p')).rejects.toThrow(/repo invalide/);
  });

  it('throw si branch manquante', async () => {
    process.env.GITHUB_TOKEN = 'OK';
    const cfg = configWith({
      publication: {
        github: {
          enabled: true,
          connection: 'direct',
          repo: 'owner/repo',
          branch: '   ',
          content_path: 'content/articles',
        },
      },
    } as any);
    const adapter = new GithubArticlePublisherAdapter(cfg, fmMock, imageFetcher);
    await expect(adapter.publishArticle(makeArticle(), 't', 'p')).rejects.toThrow(/branch requis/);
  });

  it('throw si content_path manquant', async () => {
    process.env.GITHUB_TOKEN = 'OK';
    const cfg = configWith({
      publication: {
        github: {
          enabled: true,
          connection: 'direct',
          repo: 'owner/repo',
          branch: 'main',
          content_path: '  ',
        },
      },
    } as any);
    const adapter = new GithubArticlePublisherAdapter(cfg, fmMock, imageFetcher);
    await expect(adapter.publishArticle(makeArticle(), 't', 'p')).rejects.toThrow(
      /content_path requis/
    );
  });
});

describe('GithubArticlePublisherAdapter - create vs update et normalisation path', () => {
  it('Direct: create (GET 404) → PUT sans sha, path normalisé', async () => {
    process.env.TEST_GITHUB_TOKEN = 'OK';
    getBehavior = '404';
    const cfg = configWith({
      publication: {
        github: {
          enabled: true,
          connection: 'direct',
          repo: 'owner/repo',
          branch: 'main',
          content_path: '/content/articles/',
        },
      },
    } as any);
    const adapter = new GithubArticlePublisherAdapter(cfg, fmMock, imageFetcher);

    const res = await adapter.publishArticle(makeArticle(), 't', 'p');

    const put = requests.find(r => r.route.startsWith('PUT '))!;
    expect(put.params.sha).toBeUndefined();

    // slug calculé: elevation-l-ia-les-agents-123e4567.mdx
    const expectedFile = 'elevation-l-ia-les-agents-123e4567.mdx';
    expect(res.path).toBe(`content/articles/${expectedFile}`);
  });

  it('Direct: update (GET 200) → PUT avec sha', async () => {
    process.env.TEST_GITHUB_TOKEN = 'OK';
    getBehavior = '200';
    existingSha = 'beefdead';
    const cfg = configWith({
      publication: {
        github: {
          enabled: true,
          connection: 'direct',
          repo: 'owner/repo',
          branch: 'main',
          content_path: 'content/articles',
        },
      },
    } as any);
    const adapter = new GithubArticlePublisherAdapter(cfg, fmMock, imageFetcher);

    await adapter.publishArticle(makeArticle(), 't', 'p');

    const put = requests.find(r => r.route.startsWith('PUT '))!;
    expect(put.params.sha).toBe('beefdead');
  });

  it('Direct: GET erreur ≠ 404 → throw explicite', async () => {
    process.env.TEST_GITHUB_TOKEN = 'OK';
    getBehavior = 'error';
    getErrorStatus = 500;
    const cfg = configWith({
      publication: {
        github: {
          enabled: true,
          connection: 'direct',
          repo: 'owner/repo',
          branch: 'main',
          content_path: 'content/articles',
        },
      },
    } as any);
    const adapter = new GithubArticlePublisherAdapter(cfg, fmMock, imageFetcher);

    await expect(adapter.publishArticle(makeArticle(), 't', 'p')).rejects.toThrow(
      /GitHub: échec de la vérification/
    );
  });
});

describe('GithubArticlePublisherAdapter - mode PR (branche, PR, labels)', () => {
  it('Crée la branche feature, commit et PR avec labels', async () => {
    process.env.GITHUB_TOKEN = 'OK';
    const cfg = configWith({
      publication: {
        github: {
          enabled: true,
          connection: 'pr',
          repo: 'owner/repo',
          branch: 'main',
          content_path: 'content/articles',
          pr: {
            branch_prefix: 'feature/',
            title_prefix: 'chore(content): ',
            draft: false,
            labels: ['content'],
          },
        },
      },
    } as any);
    const adapter = new GithubArticlePublisherAdapter(cfg, fmMock, imageFetcher);

    await adapter.publishArticle(makeArticle(), 't', 'p');

    // Assertions minimales sur les routes appelées
    expect(requests.some(r => r.route.startsWith('POST /repos/{owner}/{repo}/git/refs'))).toBe(
      true
    );
    expect(requests.some(r => r.route.startsWith('POST /repos/{owner}/{repo}/pulls'))).toBe(true);
    expect(requests.some(r => r.route.startsWith('POST /repos/{owner}/{repo}/issues/'))).toBe(true);
  });

  it('Idempotent: branche existe déjà et PR déjà ouverte', async () => {
    process.env.GITHUB_TOKEN = 'OK';
    branchAlreadyExists = true;
    prAlreadyExists = true;
    const cfg = configWith({
      publication: {
        github: {
          enabled: true,
          connection: 'pr',
          repo: 'owner/repo',
          branch: 'main',
          content_path: 'content/articles',
          pr: { branch_prefix: 'feature/' },
        } as any,
      },
    });
    const adapter = new GithubArticlePublisherAdapter(cfg, fmMock, imageFetcher);
    await adapter.publishArticle(makeArticle(), 't', 'p');

    expect(requests.some(r => r.route.startsWith('GET /repos/{owner}/{repo}/pulls'))).toBe(true);
  });

  it('Throw si branch_prefix manquant en mode PR', async () => {
    process.env.GITHUB_TOKEN = 'OK';
    const cfg = configWith({
      publication: {
        github: {
          enabled: true,
          connection: 'pr',
          repo: 'owner/repo',
          branch: 'main',
          content_path: 'content/articles',
          pr: {} as any,
        } as any,
      },
    });
    const adapter = new GithubArticlePublisherAdapter(cfg, fmMock, imageFetcher);
    await expect(adapter.publishArticle(makeArticle(), 't', 'p')).rejects.toThrow(
      /pr\.branch_prefix requis/
    );
  });
});
