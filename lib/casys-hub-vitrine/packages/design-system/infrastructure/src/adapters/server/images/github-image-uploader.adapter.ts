import { Octokit } from '@octokit/core';

import type { ProjectConfig } from '@casys/shared';
import type { ImageUploaderPort, UserProjectConfigPort } from '@casys/application';

import { createLogger } from '../../../utils/logger';

export class GithubImageUploaderAdapter implements ImageUploaderPort {
  private readonly logger = createLogger('GithubImageUploaderAdapter');

  constructor(private readonly configReader: UserProjectConfigPort) {}

  async uploadBase64Image(params: {
    base64: string;
    filename: string; // <slug>-<shortId>.<ext>
    mime: string; // image/webp | image/png | image/jpeg
    tenantId: string;
    projectId: string;
  }): Promise<{ url: string }> {
    const { base64, filename, mime, tenantId, projectId } = params;

    if (!tenantId?.trim()) throw new Error('[GithubImageUploader] tenantId requis');
    if (!projectId?.trim()) throw new Error('[GithubImageUploader] projectId requis');
    if (!base64 || base64.trim().length === 0) throw new Error('[GithubImageUploader] base64 vide');
    if (!filename?.trim()) throw new Error('[GithubImageUploader] filename requis');
    const ext = filename.split('.').pop()?.toLowerCase();
    const allowed = new Set(['webp', 'png', 'jpg', 'jpeg']);
    if (!ext || !allowed.has(ext)) {
      throw new Error(`[GithubImageUploader] extension non supportée: .${ext ?? 'inconnue'}`);
    }
    const mimeByExt: Record<string, string> = {
      webp: 'image/webp',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
    };
    const expected = mimeByExt[ext];
    if (!mime || mime.toLowerCase() !== expected) {
      throw new Error(
        `[GithubImageUploader] mime/extension incohérents: attendu ${expected}, reçu ${mime}`
      );
    }

    const projectConfig: ProjectConfig = await this.configReader.getProjectConfig(
      tenantId,
      projectId
    );
    const gh = projectConfig.publication?.github;
    if (!gh) throw new Error('[GithubImageUploader] publication.github absent');
    if (!gh.repo?.trim()) throw new Error('[GithubImageUploader] publication.github.repo requis');
    if (!gh.branch?.trim())
      throw new Error('[GithubImageUploader] publication.github.branch requis');
    if (!gh.assets_path?.trim())
      throw new Error('[GithubImageUploader] publication.github.assets_path requis');
    if (!gh.assets_url_base?.trim())
      throw new Error('[GithubImageUploader] publication.github.assets_url_base requis');

    // Cette implémentation supporte le mode direct uniquement (pas PR)
    if (gh.connection !== 'direct') {
      throw new Error(
        "[GithubImageUploader] Seul le mode 'direct' est supporté pour l'upload d'images"
      );
    }

    // Résolution token: <ENV_PREFIX>GITHUB_TOKEN obligatoire
    const security = projectConfig.security;
    const prefixedEnv = security?.env_prefix
      ? process.env[`${security.env_prefix}GITHUB_TOKEN`]
      : undefined;
    const token = prefixedEnv;
    if (!token) {
      throw new Error(
        '[GithubImageUploader] <ENV_PREFIX>GITHUB_TOKEN requis (ex: MAGICKING_GITHUB_TOKEN)'
      );
    }

    const octokit = new Octokit({ auth: token });
    const [owner, repo] = gh.repo.split('/');
    if (!owner || !repo) throw new Error(`[GithubImageUploader] repo invalide: ${gh.repo}`);

    const assetsBase = gh.assets_path.replace(/^\/+|\/+$/g, '');
    // Pas de sous-dossier auto: le nom de fichier inclut déjà le slug+shortId
    const assetRepoPath = `${assetsBase}/${filename}`;

    // Vérifier existence éventuelle pour récupérer le sha
    let existingSha: string | undefined;
    try {
      const res = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner,
        repo,
        path: assetRepoPath,
        ref: gh.branch,
      });
      existingSha = (res as { data?: { sha?: string } } | undefined)?.data?.sha;
    } catch (err: unknown) {
      const e = err as { status?: number; response?: { status?: number } };
      const status = e.status ?? e.response?.status;
      if (status !== 404) {
        this.logger.error('GET contents (asset) a échoué', err);
        throw new Error(`GitHub: échec de la vérification de l'asset (${status ?? 'inconnu'})`);
      }
    }

    // Décoder base64 (supporte data URL)
    const b64 = base64.includes(',') ? (base64.split(',').pop() ?? '') : base64;
    if (!b64) throw new Error('[GithubImageUploader] base64 invalide (aucune donnée)');

    // Upload via API Contents
    const putAsset = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path: assetRepoPath,
      message: existingSha
        ? `chore(assets): update cover ${filename}`
        : `feat(assets): add cover ${filename}`,
      content: b64,
      branch: gh.branch,
      sha: existingSha,
    });

    const uploadStatus = putAsset.status;
    if (typeof uploadStatus !== 'number' || uploadStatus >= 300) {
      throw new Error("GitHub: échec de l'upload de l'image (direct)");
    }

    const baseUrl = gh.assets_url_base.replace(/\/+$/g, '');
    const url = `${baseUrl}/${filename}`.replace(/\/+/g, '/');

    this.logger.log('Upload GitHub OK', { repo: gh.repo, path: assetRepoPath, url });
    return { url };
  }
}
