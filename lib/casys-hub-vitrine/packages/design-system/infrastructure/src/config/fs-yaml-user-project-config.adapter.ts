import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { join } from 'path';

import type { ProjectConfig, UserConfig } from '@casys/shared';
import type { UserProjectConfigPort } from '@casys/application';

/**
 * Adaptateur Infrastructure pour lire/écrire les YAML User/Project dans config/users/**
 * Fail-fast: lève des erreurs explicites en cas de fichiers manquants ou invalides.
 */
export class FsYamlUserProjectConfigAdapter implements UserProjectConfigPort {
  private readonly baseDir: string;
  private readonly configDir: string;
  private readonly usersDir: string;

  constructor(baseDir: string) {
    if (!baseDir) {
      throw new Error('[FsYamlUserProjectConfigAdapter] baseDir requis (CASYS_PROJECT_ROOT)');
    }
    this.baseDir = baseDir;
    this.configDir = join(this.baseDir, 'config');
    this.usersDir = join(this.configDir, 'users');

    // Fail-fast: vérifier l’existence minimale
    if (!existsSync(this.configDir)) {
      throw new Error(
        `[FsYamlUserProjectConfigAdapter] Dossier de configuration introuvable: ${this.configDir}`
      );
    }
    if (!existsSync(this.usersDir)) {
      throw new Error(
        `[FsYamlUserProjectConfigAdapter] Dossier users introuvable: ${this.usersDir}`
      );
    }
  }

  async getUserConfig(userId: string): Promise<UserConfig> {
    const userConfigFile = join(this.usersDir, userId, 'config.yml');
    if (!existsSync(userConfigFile)) {
      throw new Error(`Config utilisateur manquante: ${userConfigFile}`);
    }
    try {
      const data = readFileSync(userConfigFile, 'utf8');
      const parsed = yaml.load(data) as UserConfig | undefined;
      if (!parsed) throw new Error('Parsing YAML renvoie null/undefined');
      return Promise.resolve(parsed);
    } catch (e) {
      throw new Error(`Erreur lecture config user ${userId}: ${String(e)}`);
    }
  }

  async saveUserConfig(userId: string, config: UserConfig): Promise<void> {
    const userDir = join(this.usersDir, userId);
    const projectsDir = join(userDir, 'projects');
    try {
      if (!existsSync(userDir)) mkdirSync(userDir, { recursive: true });
      if (!existsSync(projectsDir)) mkdirSync(projectsDir, { recursive: true });
      const userConfigFile = join(userDir, 'config.yml');
      const yamlData = yaml.dump(config, { indent: 2 });
      writeFileSync(userConfigFile, yamlData, 'utf8');
      return Promise.resolve();
    } catch (e) {
      throw new Error(`Erreur écriture config user ${userId}: ${String(e)}`);
    }
  }

  async getProjectConfig(userId: string, projectId: string): Promise<ProjectConfig> {
    const projectFile = join(this.usersDir, userId, 'projects', `${projectId}.yml`);
    if (!existsSync(projectFile)) {
      throw new Error(`Config projet manquante: ${projectFile}`);
    }
    try {
      const data = readFileSync(projectFile, 'utf8');
      const parsed = yaml.load(data) as ProjectConfig | undefined;
      if (!parsed) throw new Error('Parsing YAML renvoie null/undefined');
      return Promise.resolve(parsed);
    } catch (e) {
      throw new Error(`Erreur lecture projet ${projectId}: ${String(e)}`);
    }
  }

  async saveProjectConfig(userId: string, projectId: string, config: ProjectConfig): Promise<void> {
    const projectsDir = join(this.usersDir, userId, 'projects');
    try {
      if (!existsSync(projectsDir)) mkdirSync(projectsDir, { recursive: true });
      const projectFile = join(projectsDir, `${projectId}.yml`);
      const yamlData = yaml.dump(config, { indent: 2 });
      writeFileSync(projectFile, yamlData, 'utf8');
      return Promise.resolve();
    } catch (e) {
      throw new Error(`Erreur écriture projet ${projectId}: ${String(e)}`);
    }
  }

  async listUsers(): Promise<string[]> {
    try {
      const entries = readdirSync(this.usersDir, { withFileTypes: true });
      const users = entries
        .filter(e => e.isDirectory())
        .filter(e => existsSync(join(this.usersDir, e.name, 'config.yml')))
        .map(e => e.name);
      return Promise.resolve(users);
    } catch (e) {
      throw new Error(`Erreur listUsers: ${String(e)}`);
    }
  }

  async listUserProjects(userId: string): Promise<string[]> {
    const projectsDir = join(this.usersDir, userId, 'projects');
    if (!existsSync(projectsDir)) {
      throw new Error(`Dossier projets manquant: ${projectsDir}`);
    }
    try {
      const projects = readdirSync(projectsDir)
        .filter(f => f.endsWith('.yml'))
        .map(f => f.replace(/\.yml$/, ''));
      return Promise.resolve(projects);
    } catch (e) {
      throw new Error(`Erreur listUserProjects(${userId}): ${String(e)}`);
    }
  }
}
