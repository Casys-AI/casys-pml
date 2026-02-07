import { Octokit } from '@octokit/core';

import type { ProjectConfig } from '@casys/shared';
import { type ArticleStructure } from '@casys/core';
import type {
  ArticlePublisherPort,
  ImageFetcherPort,
  UserProjectConfigPort,
  FrontmatterService,
} from '@casys/application';

import {
  ensureExtension,
  generateFileNameFromArticleWithFormat,
  resolveContentFormat,
} from '../../../utils/content-format';
import {
  assertImageMatchesFormat,
  buildArticleAssetsSubdir,
  buildCoverFileName,
  ensureDirPath,
  isDataUrl,
  isHttpUrl,
  parseDataUrl,
} from '../../../utils/image-utils';
import { createLogger } from '../../../utils/logger';

/**
 * Adaptateur GitHub implémentant ArticlePublisherPort.
 * Publie un article au format MDX dans un repo GitHub via l'API Contents.
 */
export class GithubArticlePublisherAdapter implements ArticlePublisherPort {
  private readonly logger = createLogger('GithubArticlePublisherAdapter');

  constructor(
    private readonly configReader: UserProjectConfigPort,
    private readonly fmService: FrontmatterService,
    private readonly imageFetcher: ImageFetcherPort
  ) {}

  async publishArticle(
    article: ArticleStructure,
    tenantId: string,
    projectId: string
  ): Promise<{ url: string; path: string; success: boolean; commitSha?: string }> {
    // Fail-fast inputs
    if (!tenantId?.trim()) throw new Error('[GithubPublisher] tenantId requis');
    if (!projectId?.trim()) throw new Error('[GithubPublisher] projectId requis');

    // Chargement config projet
    const projectConfig: ProjectConfig = await this.configReader.getProjectConfig(
      tenantId,
      projectId
    );

    const gh = projectConfig.publication?.github;
    if (!gh) throw new Error('[GithubPublisher] publication.github absent dans la config projet');
    if (!gh.repo?.trim())
      throw new Error('[GithubPublisher] publication.github.repo requis (ex: org/repo)');
    if (!gh.branch?.trim()) throw new Error('[GithubPublisher] publication.github.branch requis');
    if (!gh.content_path?.trim()) {
      throw new Error('[GithubPublisher] publication.github.content_path requis');
    }
    if (!gh.connection) {
      throw new Error("[GithubPublisher] publication.github.connection requis ('direct' | 'pr')");
    }
    // Garde: content_path ne doit pas contenir le nom de la branche (ex: "main/")
    const contentPathSanitized = gh.content_path.replace(/^\/+|\/+$/g, '');
    if (contentPathSanitized.startsWith(`${gh.branch}/`) || contentPathSanitized === gh.branch) {
      throw new Error(
        `[GithubPublisher] publication.github.content_path ne doit pas inclure le nom de branche (${gh.branch}). Exemple attendu: "content/posts"`
      );
    }

    // Stratégie tokens:
    // - Mode PR: utiliser UNIQUEMENT GITHUB_TOKEN (token machine GitHub Actions). Ignorer les tokens utilisateurs.
    // - Mode direct: token explicite > <ENV_PREFIX>GITHUB_TOKEN > GITHUB_TOKEN
    const security = projectConfig.security;
    let token: string | undefined;
    if (gh.connection === 'pr') {
      token = process.env.GITHUB_TOKEN;
      if (!token) {
        throw new Error(
          '[GithubPublisher] Mode PR: GITHUB_TOKEN requis (fourni par GitHub Actions avec permissions adéquates). Les tokens utilisateur (ex: MAGICKING_GITHUB_TOKEN) sont ignorés.'
        );
      }
    } else {
      const prefixedEnv = security?.env_prefix
        ? process.env[`${security.env_prefix}GITHUB_TOKEN`]
        : undefined;
      token = prefixedEnv;
      if (!token) {
        throw new Error(
          '[GithubPublisher] Mode direct: <ENV_PREFIX>GITHUB_TOKEN requis (ex: MAGICKING_GITHUB_TOKEN). Aucun fallback autorisé.'
        );
      }
    }

    // Prépare Octokit
    const octokit = new Octokit({ auth: token });

    // Déterminer owner/repo
    const [owner, repo] = gh.repo.split('/');
    if (!owner || !repo) {
      throw new Error(
        `[GithubPublisher] publication.github.repo invalide "${gh.repo}". Attendu: "owner/repo"`
      );
    }

    // Pré-traitement cover: si URL distante, uploader dans assets_path et mettre à jour cover.src
    let updated: ArticleStructure = article;
    const cover = article.article?.cover;
    if (cover?.src && (isHttpUrl(cover.src) || isDataUrl(cover.src))) {
      const imgCfg = projectConfig.publication?.images;
      const coverCfg = imgCfg?.cover;
      if (!coverCfg?.format) {
        throw new Error(
          '[GithubPublisher] images.cover.format requis lorsque cover.src est distante'
        );
      }
      if (!gh.assets_path?.trim()) {
        throw new Error(
          '[GithubPublisher] publication.github.assets_path requis pour publier la cover'
        );
      }
      if (!gh.assets_url_base?.trim()) {
        throw new Error(
          '[GithubPublisher] publication.github.assets_url_base requis pour référencer la cover'
        );
      }
      // Récupérer l'image (HTTP ou data URL) et vérifier le MIME
      let data: Uint8Array;
      let mimeType: string;
      if (isHttpUrl(cover.src)) {
        this.logger.debug('Cover(GH): fetch', { src: cover.src });
        const fetched = await this.imageFetcher.fetch(cover.src);
        data = fetched.data;
        if (!fetched.mimeType || fetched.mimeType.trim().length === 0) {
          throw new Error(
            '[GithubPublisher] fetch cover: mimeType manquant depuis ImageFetcher (HTTP)'
          );
        }
        mimeType = fetched.mimeType;
      } else {
        this.logger.debug('Cover(GH): parse data URL');
        const parsed = parseDataUrl(cover.src);
        data = parsed.data;
        mimeType = parsed.mimeType;
      }
      assertImageMatchesFormat(mimeType, coverCfg.format);
      this.logger.debug('Cover(GH): MIME OK', { mimeType });

      const assetFileName = buildCoverFileName(
        article.article.title,
        article.article.id,
        coverCfg.format,
        article.article.slug // Utilise le slug généré par OutlineWriter AI
      );
      const assetsBase = gh.assets_path.replace(/^\/+|\/+$/g, '');
      const subdir = buildArticleAssetsSubdir(
        article.article.title,
        article.article.id,
        article.article.slug // Utilise le slug généré par OutlineWriter AI
      );
      const assetRepoPath = `${assetsBase}/${subdir}/${assetFileName}`;
      this.logger.debug('Cover(GH): assetRepoPath', { assetRepoPath });

      // Upload de l'image selon le mode
      if (gh.connection === 'direct') {
        let existingAssetSha: string | undefined;
        try {
          const res = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
            owner,
            repo,
            path: assetRepoPath,
            ref: gh.branch,
          });
          existingAssetSha = (res as { data: { sha: string } | undefined } | undefined)?.data?.sha;
        } catch (err: unknown) {
          const e = err as { status: number; response: { status: number } };
          const status = e.status ?? e.response?.status;
          if (status !== 404) {
            this.logger.error('Erreur GET asset (direct)', err);
            throw new Error(`GitHub: échec de la vérification de l'asset (${status ?? 'inconnu'})`);
          }
        }

        const putAsset = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
          owner,
          repo,
          path: assetRepoPath,
          message: existingAssetSha
            ? `chore(assets): update cover ${assetFileName}`
            : `feat(assets): add cover ${assetFileName}`,
          content: Buffer.from(data).toString('base64'),
          branch: gh.branch,
          sha: existingAssetSha,
        });
        {
          const status = (putAsset as { status?: number } | undefined)?.status ?? 200;
          if (status >= 300) {
            throw new Error("GitHub: échec de l'upload de l'image (direct)");
          }
        }
        this.logger.log('Cover(GH): upload direct OK', { path: assetRepoPath });
      }

      // En mode PR, l'upload s'effectue après la création de la branche feature (voir plus bas)

      // Calcul de l'URL public à inscrire dans le frontmatter (explicite via assets_url_base)
      const base = gh.assets_url_base.replace(/\/+$/g, '');
      const webPath = ensureDirPath(`${base}/${subdir}/${assetFileName}`);
      this.logger.log('Cover(GH): webPath assigné', { webPath });
      updated = {
        ...article,
        article: {
          ...article.article,
          cover: { src: webPath, ...(cover.alt ? { alt: cover.alt } : {}) },
        },
      };
    }

    // Construire chemin de publication et contenu via FrontmatterService (avec cover potentiellement mise à jour)
    const generated = await this.fmService.generateForProject(updated, projectConfig);
    const format = resolveContentFormat(projectConfig);
    const fileName = generated.fileName
      ? ensureExtension(generated.fileName, format)
      : generateFileNameFromArticleWithFormat(article.article, format);
    const normalizedBase = contentPathSanitized;
    const targetPath = [normalizedBase, fileName].filter(Boolean).join('/');
    const contentB64 = Buffer.from(generated.content, 'utf8').toString('base64');

    if (gh.connection === 'direct') {
      // Récupérer SHA existant si le fichier existe déjà (branche cible)
      let existingSha: string | undefined;
      try {
        const res = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
          owner,
          repo,
          path: targetPath,
          ref: gh.branch,
        });
        existingSha = (res as { data: { sha: string } | undefined } | undefined)?.data?.sha;
      } catch (err: unknown) {
        const e = err as { status: number; response: { status: number } };
        const status = e.status ?? e.response?.status;
        if (status !== 404) {
          this.logger.error('Erreur GET contents (direct)', err);
          throw new Error(
            `GitHub: échec de la vérification du contenu existant (${status ?? 'inconnu'})`
          );
        }
      }

      const message = existingSha
        ? `chore(content): update article ${fileName}`
        : `feat(content): add article ${fileName}`;

      const putRes = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
        owner,
        repo,
        path: targetPath,
        message,
        content: contentB64,
        branch: gh.branch,
        sha: existingSha,
      });

      const commitSha: string | undefined = (
        putRes as { data: { commit: { sha: string } } | undefined } | undefined
      )?.data?.commit?.sha;

      const htmlUrl: string | undefined = (
        putRes as { data: { content: { html_url: string } } | undefined } | undefined
      )?.data?.content?.html_url;

      const url = htmlUrl ?? `https://github.com/${owner}/${repo}/blob/${gh.branch}/${targetPath}`;

      this.logger.log('Article publié sur GitHub (direct)', {
        repo: gh.repo,
        branch: gh.branch,
        path: targetPath,
      });
      return { url, path: targetPath, success: true, commitSha };
    }

    // Mode PR
    // 1) Récupérer la ref de base (branche cible)
    const baseRef = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
      owner,
      repo,
      ref: `heads/${gh.branch}`,
    });
    const baseSha = (baseRef as { data: { object: { sha: string } } | undefined } | undefined)?.data
      ?.object?.sha;
    if (!baseSha)
      throw new Error('[GithubPublisher] Impossible de récupérer la ref de base pour la branche');

    // 2) Construire le nom de branche feature
    const prOpts: {
      branch_prefix?: string;
      title_prefix?: string;
      labels?: string[];
      draft?: boolean;
    } = gh.pr ?? {};
    if (!prOpts.branch_prefix?.trim()) {
      throw new Error('[GithubPublisher] publication.github.pr.branch_prefix requis en mode PR');
    }
    const safeName = fileName.replace(/[^a-zA-Z0-9-_.]/g, '-').replace(/\s+/g, '-');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const featureBranch = `${prOpts.branch_prefix.replace(/\s+/g, '')}${safeName}-${ts}`.replace(
      /\/+$/,
      ''
    );

    // 3) Créer la ref de branche (idempotent)
    let _createdNewBranch = false;
    try {
      await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
        owner,
        repo,
        ref: `refs/heads/${featureBranch}`,
        sha: baseSha,
      });
      _createdNewBranch = true;
    } catch (err: unknown) {
      const e = err as {
        status?: number;
        response?: { status?: number; data?: { message?: string } };
        message?: string;
      };
      const status = e.status ?? e.response?.status;
      const msg = e.message ?? e.response?.data?.message;
      if (status === 422 && typeof msg === 'string' && msg.includes('Reference already exists')) {
        // Branche déjà existante -> continuer en update
        _createdNewBranch = false;
      } else {
        this.logger.error('Erreur création de la branche feature', err);
        throw new Error('GitHub: échec de la création de la branche feature');
      }
    }

    // 4) Upload de l'image dans la branche feature si nécessaire
    if (
      article.article?.cover?.src &&
      (isHttpUrl(article.article.cover.src) || isDataUrl(article.article.cover.src))
    ) {
      const coverCfg = projectConfig.publication?.images?.cover;
      if (!coverCfg?.format) {
        throw new Error('[GithubPublisher] images.cover.format requis (PR flow)');
      }
      if (!gh.assets_path?.trim()) {
        throw new Error('[GithubPublisher] publication.github.assets_path requis (PR flow)');
      }
      const assetFileName = buildCoverFileName(
        article.article.title,
        article.article.id,
        coverCfg.format,
        article.article.slug // Utilise le slug généré par OutlineWriter AI
      );
      const assetsBase = gh.assets_path.replace(/^\/+|\/+$/g, '');
      const subdir = buildArticleAssetsSubdir(
        article.article.title,
        article.article.id,
        article.article.slug // Utilise le slug généré par OutlineWriter AI
      );
      const assetRepoPath = `${assetsBase}/${subdir}/${assetFileName}`;
      this.logger.debug('Cover(GH PR): assetRepoPath', { assetRepoPath });

      // Récupérer le SHA existant éventuel sur la feature
      let existingAssetShaFeature: string | undefined;
      try {
        const res = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
          owner,
          repo,
          path: assetRepoPath,
          ref: featureBranch,
        });
        existingAssetShaFeature = (res as { data: { sha: string } | undefined } | undefined)?.data
          ?.sha;
      } catch (err: unknown) {
        const e = err as { status: number; response: { status: number } };
        const status = e.status ?? e.response?.status;
        if (status !== 404) {
          this.logger.error('Erreur GET asset (feature)', err);
          throw new Error("GitHub: échec de la vérification de l'asset (feature)");
        }
      }

      // Récupérer l'image source (HTTP ou data URL)
      let data: Uint8Array;
      let mimeType: string;
      if (isHttpUrl(article.article.cover.src)) {
        this.logger.debug('Cover(GH PR): fetch', { src: article.article.cover.src });
        const fetched = await this.imageFetcher.fetch(article.article.cover.src);
        data = fetched.data;
        if (!fetched.mimeType || fetched.mimeType.trim().length === 0) {
          throw new Error(
            '[GithubPublisher] fetch cover (PR): mimeType manquant depuis ImageFetcher (HTTP)'
          );
        }
        mimeType = fetched.mimeType;
      } else {
        this.logger.debug('Cover(GH PR): parse data URL');
        const parsed = parseDataUrl(article.article.cover.src);
        data = parsed.data;
        mimeType = parsed.mimeType;
      }
      assertImageMatchesFormat(mimeType, coverCfg.format);
      this.logger.debug('Cover(GH PR): MIME OK', { mimeType });

      const putAssetFeature = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
        owner,
        repo,
        path: assetRepoPath,
        message: existingAssetShaFeature
          ? `chore(assets): update cover ${assetFileName}`
          : `feat(assets): add cover ${assetFileName}`,
        content: Buffer.from(data).toString('base64'),
        branch: featureBranch,
        sha: existingAssetShaFeature,
      });
      {
        const status = (putAssetFeature as { status?: number } | undefined)?.status ?? 200;
        if (status >= 300) {
          throw new Error("GitHub: échec de l'upload de l'image (feature)");
        }
      }
      this.logger.log('Cover(GH PR): upload OK', { path: assetRepoPath, branch: featureBranch });
    }

    // 5) Récupérer SHA existant sur la feature (si re-run)
    let existingShaFeature: string | undefined;
    try {
      const res = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner,
        repo,
        path: targetPath,
        ref: featureBranch,
      });
      existingShaFeature = (res as { data: { sha: string } | undefined } | undefined)?.data?.sha;
    } catch (err: unknown) {
      const e = err as { status?: number; response?: { status?: number } };
      const status = e.status ?? e.response?.status;
      if (status !== 404) {
        this.logger.error('Erreur GET contents (feature)', err);
        throw new Error('GitHub: échec de la vérification du contenu existant (feature)');
      }
    }

    // 6) Commit du fichier sur la branche feature
    const messagePr = existingShaFeature
      ? `chore(content): update article ${fileName}`
      : `feat(content): add article ${fileName}`;
    const putResFeature = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path: targetPath,
      message: messagePr,
      content: contentB64,
      branch: featureBranch,
      sha: existingShaFeature,
    });
    const commitSha = (
      putResFeature as { data: { commit: { sha: string } } | undefined } | undefined
    )?.data?.commit?.sha;

    // 7) Créer la PR (idempotent si déjà créée)
    const prTitlePrefix = prOpts.title_prefix ?? 'chore(content): ';
    const prTitle = `${prTitlePrefix}${existingShaFeature ? 'update' : 'add'} article ${fileName}`;
    let prUrl: string | undefined;
    let prNumber: number | undefined;
    try {
      const prRes = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
        owner,
        repo,
        title: prTitle,
        head: featureBranch,
        base: gh.branch,
        draft: !!prOpts.draft,
        body: `Automated content publication for ${fileName}`,
      });
      prUrl = (prRes as { data: { html_url: string } | undefined } | undefined)?.data?.html_url;
      prNumber = (prRes as { data: { number: number } | undefined } | undefined)?.data?.number;
    } catch (err: unknown) {
      const e = err as {
        status?: number;
        message?: string;
        response?: { status?: number; data?: { message?: string } };
      };
      const status = e.status ?? e.response?.status;
      const msg = e.message ?? e.response?.data?.message;
      if (
        status === 422 &&
        typeof msg === 'string' &&
        msg.includes('A pull request already exists')
      ) {
        // Récupérer la PR existante
        const listRes = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
          owner,
          repo,
          state: 'open',
          head: `${owner}:${featureBranch}`,
          base: gh.branch,
        });
        const existing = (
          listRes as { data?: { html_url?: string; number?: number }[] } | undefined
        )?.data?.[0];
        prUrl = existing?.html_url;
        prNumber = existing?.number;
      } else {
        this.logger.error('Erreur création PR', err);
        throw new Error('GitHub: échec de la création de la Pull Request');
      }
    }

    // 8) Labels éventuels
    if (prNumber && Array.isArray(prOpts.labels) && prOpts.labels.length > 0) {
      try {
        await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
          owner,
          repo,
          issue_number: prNumber,
          labels: prOpts.labels,
        });
      } catch (err) {
        this.logger.warn?.("Impossible d'ajouter des labels à la PR", err);
      }
    }

    const url = prUrl ?? `https://github.com/${owner}/${repo}/pulls`;
    this.logger.log('Article publié en PR sur GitHub', {
      repo: gh.repo,
      base: gh.branch,
      feature: featureBranch,
      path: targetPath,
      pr: url,
    });
    return { url, path: targetPath, success: true, commitSha };
  }
}
