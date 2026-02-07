import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { ProjectConfig, UserConfig } from '@casys/shared';

import { FsYamlUserProjectConfigAdapter } from '../fs-yaml-user-project-config.adapter';

async function mkTmp(prefix: string) {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function rimraf(p: string) {
  try {
    await fs.rm(p, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe('FsYamlUserProjectConfigAdapter', () => {
  describe('constructor', () => {
    it('devrait valider baseDir requis', async () => {
      expect(() => {
        new FsYamlUserProjectConfigAdapter('');
      }).toThrow('baseDir requis');
    });

    it('devrait échouer si config/ manquant', async () => {
      const emptyRoot = await mkTmp('casys-config-empty-');
      expect(() => {
        new FsYamlUserProjectConfigAdapter(emptyRoot);
      }).toThrow('Dossier de configuration introuvable');
      await rimraf(emptyRoot);
    });

    it('devrait échouer si config/users/ manquant', async () => {
      const root = await mkTmp('casys-config-nouser-');
      await fs.mkdir(path.join(root, 'config'));
      expect(() => {
        new FsYamlUserProjectConfigAdapter(root);
      }).toThrow('Dossier users introuvable');
      await rimraf(root);
    });

    it('devrait créer adapter avec structure valide', async () => {
      const root = await mkTmp('casys-config-valid-');
      await fs.mkdir(path.join(root, 'config', 'users'), { recursive: true });
      expect(() => {
        new FsYamlUserProjectConfigAdapter(root);
      }).not.toThrow();
      await rimraf(root);
    });
  });

  describe('getUserConfig', () => {
    it('devrait échouer si fichier config.yml manquant', async () => {
      const root = await mkTmp('casys-config-test-');
      await fs.mkdir(path.join(root, 'config', 'users'), { recursive: true });
      const adapter = new FsYamlUserProjectConfigAdapter(root);

      await expect(adapter.getUserConfig('nonexistent')).rejects.toThrow(
        'Config utilisateur manquante'
      );
      await rimraf(root);
    });

    it('devrait échouer si YAML invalide', async () => {
      const root = await mkTmp('casys-config-test-');
      const userDir = path.join(root, 'config', 'users', 'test-user');
      await fs.mkdir(userDir, { recursive: true });
      await fs.writeFile(path.join(userDir, 'config.yml'), 'invalid: yaml: [', 'utf-8');

      const adapter = new FsYamlUserProjectConfigAdapter(root);
      await expect(adapter.getUserConfig('test-user')).rejects.toThrow(
        'Erreur lecture config user'
      );
      await rimraf(root);
    });

    it('devrait échouer si YAML vide', async () => {
      const root = await mkTmp('casys-config-test-');
      const userDir = path.join(root, 'config', 'users', 'test-user');
      await fs.mkdir(userDir, { recursive: true });
      await fs.writeFile(path.join(userDir, 'config.yml'), '', 'utf-8');

      const adapter = new FsYamlUserProjectConfigAdapter(root);
      await expect(adapter.getUserConfig('test-user')).rejects.toThrow(
        'Parsing YAML renvoie null/undefined'
      );
      await rimraf(root);
    });

    it('devrait lire config utilisateur valide', async () => {
      const root = await mkTmp('casys-config-test-');
      const userDir = path.join(root, 'config', 'users', 'test-user');
      await fs.mkdir(userDir, { recursive: true });

      const _userConfig: UserConfig = {
        name: 'Test User',
        email: 'test@example.com',
        apiUrl: 'https://api.example.com',
        defaultTenant: 'test-tenant',
      };
      await fs.writeFile(
        path.join(userDir, 'config.yml'),
        `name: Test User\nemail: test@example.com\npreferences:\n  theme: dark`,
        'utf-8'
      );

      const adapter = new FsYamlUserProjectConfigAdapter(root);
      const result = await adapter.getUserConfig('test-user');

      expect(result.name).toBe('Test User');
      expect(result.email).toBe('test@example.com');
      await rimraf(root);
    });
  });

  describe('saveUserConfig', () => {
    it('devrait créer dossiers et sauvegarder config', async () => {
      const root = await mkTmp('casys-config-test-');
      await fs.mkdir(path.join(root, 'config', 'users'), { recursive: true });

      const adapter = new FsYamlUserProjectConfigAdapter(root);
      const userConfig: UserConfig = {
        name: 'New User',
        email: 'new@example.com',
        apiUrl: 'https://api.example.com',
        defaultTenant: 'test-tenant',
      };

      await adapter.saveUserConfig('new-user', userConfig);

      const configPath = path.join(root, 'config', 'users', 'new-user', 'config.yml');
      const projectsPath = path.join(root, 'config', 'users', 'new-user', 'projects');

      expect(
        await fs
          .access(configPath)
          .then(() => true)
          .catch(() => false)
      ).toBe(true);
      expect(
        await fs
          .access(projectsPath)
          .then(() => true)
          .catch(() => false)
      ).toBe(true);

      const content = await fs.readFile(configPath, 'utf-8');
      expect(content).toContain('name: New User');
      await rimraf(root);
    });
  });

  describe('getProjectConfig', () => {
    it('devrait échouer si fichier projet manquant', async () => {
      const root = await mkTmp('casys-config-test-');
      await fs.mkdir(path.join(root, 'config', 'users'), { recursive: true });
      const adapter = new FsYamlUserProjectConfigAdapter(root);

      await expect(adapter.getProjectConfig('user', 'nonexistent')).rejects.toThrow(
        'Config projet manquante'
      );
      await rimraf(root);
    });

    it('devrait échouer si YAML projet invalide', async () => {
      const root = await mkTmp('casys-config-test-');
      const projectsDir = path.join(root, 'config', 'users', 'test-user', 'projects');
      await fs.mkdir(projectsDir, { recursive: true });
      await fs.writeFile(path.join(projectsDir, 'test-project.yml'), 'invalid: yaml: [', 'utf-8');

      const adapter = new FsYamlUserProjectConfigAdapter(root);
      await expect(adapter.getProjectConfig('test-user', 'test-project')).rejects.toThrow(
        'Erreur lecture projet'
      );
      await rimraf(root);
    });

    it('devrait lire config projet valide', async () => {
      const root = await mkTmp('casys-config-ok-');
      const usersDir = path.join(root, 'config', 'users', 'john-doe', 'projects');
      await fs.mkdir(usersDir, { recursive: true });
      const yml = `
name: Test
publication:
  file_system:
    enabled: true
    content_path: "apps/astro-web/src/content/articles/john-doe/blog-perso"
    format: "mdx"
  github:
    enabled: false
    repo: "owner/repo"
    branch: "main"
    content_path: "src/content/articles/"
security:
  credentials_source: "environment"
  env_prefix: "TEST_"
`;
      await fs.writeFile(path.join(usersDir, 'blog-perso.yml'), yml, 'utf-8');

      const adapter = new FsYamlUserProjectConfigAdapter(root);
      const cfg = await adapter.getProjectConfig('john-doe', 'blog-perso');

      expect(cfg.publication?.file_system?.enabled).toBe(true);
      expect(cfg.publication?.file_system?.content_path).toContain(
        'apps/astro-web/src/content/articles'
      );
      expect(cfg.publication?.github?.repo).toBe('owner/repo');
      expect(cfg.security?.env_prefix).toBe('TEST_');

      await rimraf(root);
    });
  });

  describe('saveProjectConfig', () => {
    it('devrait créer dossier projects et sauvegarder', async () => {
      const root = await mkTmp('casys-config-test-');
      await fs.mkdir(path.join(root, 'config', 'users'), { recursive: true });

      const adapter = new FsYamlUserProjectConfigAdapter(root);
      const projectConfig: ProjectConfig = {
        name: 'Test Project',
        type: 'astro',
        language: 'fr',
        sources: { rss: [] },
        generation: {
          tone: 'professionnel',
          length: '800-1200',
        },
        publication: {
          file_system: {
            enabled: true,
            content_path: 'test/path',
            format: 'mdx',
          },
        },
      };

      await adapter.saveProjectConfig('test-user', 'test-project', projectConfig);

      const projectPath = path.join(
        root,
        'config',
        'users',
        'test-user',
        'projects',
        'test-project.yml'
      );
      expect(
        await fs
          .access(projectPath)
          .then(() => true)
          .catch(() => false)
      ).toBe(true);

      const content = await fs.readFile(projectPath, 'utf-8');
      expect(content).toContain('name: Test Project');
      await rimraf(root);
    });
  });

  describe('listUsers', () => {
    it('devrait retourner liste vide si aucun user', async () => {
      const root = await mkTmp('casys-config-test-');
      await fs.mkdir(path.join(root, 'config', 'users'), { recursive: true });

      const adapter = new FsYamlUserProjectConfigAdapter(root);
      const users = await adapter.listUsers();

      expect(users).toEqual([]);
      await rimraf(root);
    });

    it('devrait filtrer uniquement dossiers avec config.yml', async () => {
      const root = await mkTmp('casys-config-test-');
      const usersDir = path.join(root, 'config', 'users');
      await fs.mkdir(usersDir, { recursive: true });

      // Créer user valide
      await fs.mkdir(path.join(usersDir, 'valid-user'));
      await fs.writeFile(path.join(usersDir, 'valid-user', 'config.yml'), 'name: Valid', 'utf-8');

      // Créer dossier sans config.yml
      await fs.mkdir(path.join(usersDir, 'invalid-user'));

      // Créer fichier (pas dossier)
      await fs.writeFile(path.join(usersDir, 'not-a-dir.txt'), 'test', 'utf-8');

      const adapter = new FsYamlUserProjectConfigAdapter(root);
      const users = await adapter.listUsers();

      expect(users).toEqual(['valid-user']);
      await rimraf(root);
    });
  });

  describe('listUserProjects', () => {
    it('devrait échouer si dossier projects manquant', async () => {
      const root = await mkTmp('casys-config-test-');
      await fs.mkdir(path.join(root, 'config', 'users'), { recursive: true });

      const adapter = new FsYamlUserProjectConfigAdapter(root);
      await expect(adapter.listUserProjects('nonexistent')).rejects.toThrow(
        'Dossier projets manquant'
      );
      await rimraf(root);
    });

    it('devrait retourner liste projets .yml', async () => {
      const root = await mkTmp('casys-config-test-');
      const projectsDir = path.join(root, 'config', 'users', 'test-user', 'projects');
      await fs.mkdir(projectsDir, { recursive: true });

      await fs.writeFile(path.join(projectsDir, 'project1.yml'), 'name: Project 1', 'utf-8');
      await fs.writeFile(path.join(projectsDir, 'project2.yml'), 'name: Project 2', 'utf-8');
      await fs.writeFile(path.join(projectsDir, 'not-yaml.txt'), 'test', 'utf-8');

      const adapter = new FsYamlUserProjectConfigAdapter(root);
      const projects = await adapter.listUserProjects('test-user');

      expect(projects.sort()).toEqual(['project1', 'project2']);
      await rimraf(root);
    });
  });
});
