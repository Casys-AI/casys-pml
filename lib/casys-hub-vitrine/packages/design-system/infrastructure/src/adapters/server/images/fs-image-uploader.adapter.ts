import fs from 'node:fs/promises';
import path from 'node:path';

import type { ProjectConfig } from '@casys/shared';
import type { ImageUploaderPort, UserProjectConfigPort } from '@casys/application';

import { createLogger } from '../../../utils/logger';

export class FsImageUploaderAdapter implements ImageUploaderPort {
  private readonly logger = createLogger('FsImageUploaderAdapter');

  constructor(private readonly configReader: UserProjectConfigPort) {}

  async uploadBase64Image(params: {
    base64: string;
    filename: string; // <slug>-<shortId>.<ext>
    mime: string; // image/webp | image/png | image/jpeg
    tenantId: string;
    projectId: string;
  }): Promise<{ url: string }> {
    const { base64, filename, mime, tenantId, projectId } = params;

    if (!tenantId?.trim()) throw new Error('[FsImageUploader] tenantId requis');
    if (!projectId?.trim()) throw new Error('[FsImageUploader] projectId requis');
    if (!base64 || base64.trim().length === 0) throw new Error('[FsImageUploader] base64 vide');
    if (!filename?.trim()) throw new Error('[FsImageUploader] filename requis');
    const ext = filename.split('.').pop()?.toLowerCase();
    const allowed = new Set(['webp', 'png', 'jpg', 'jpeg']);
    if (!ext || !allowed.has(ext)) {
      throw new Error(`[FsImageUploader] extension non supportée: .${ext ?? 'inconnue'}`);
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
        `[FsImageUploader] mime/extension incohérents: attendu ${expected}, reçu ${mime}`
      );
    }

    const projectConfig: ProjectConfig = await this.configReader.getProjectConfig(
      tenantId,
      projectId
    );
    const fsCfg = projectConfig.publication?.file_system;
    if (!fsCfg?.enabled) throw new Error('[FsImageUploader] publication.file_system.disabled');
    if (!fsCfg.assets_path?.trim())
      throw new Error('[FsImageUploader] publication.file_system.assets_path requis');
    if (!fsCfg.assets_url_base?.trim())
      throw new Error('[FsImageUploader] publication.file_system.assets_url_base requis');

    // Résoudre assets dir absolu
    let assetsAbs: string;
    if (path.isAbsolute(fsCfg.assets_path)) {
      assetsAbs = fsCfg.assets_path;
    } else {
      const baseRoot = process.env.CASYS_PROJECT_ROOT;
      if (!baseRoot?.trim()) {
        throw new Error('[FsImageUploader] CASYS_PROJECT_ROOT requis pour assets_path relatif');
      }
      assetsAbs = path.resolve(baseRoot, fsCfg.assets_path);
    }

    await fs.mkdir(assetsAbs, { recursive: true });
    const fileAbs = path.join(assetsAbs, filename);

    // Décoder base64 (supporter éventuellement data URL)
    const b64Part = base64.includes(',') ? (base64.split(',').pop() ?? '') : base64;
    if (!b64Part) throw new Error('[FsImageUploader] base64 invalide (aucune donnée)');
    const buffer = Buffer.from(b64Part, 'base64');

    await fs.writeFile(fileAbs, buffer);

    const base = fsCfg.assets_url_base.replace(/\/+$/g, '');
    const url = `${base}/${filename}`.replace(/\/+/g, '/');

    this.logger.log('Upload FS OK', { file: fileAbs, url });
    return { url };
  }
}
