/**
 * Port domaine pour l'accès aux configurations User/Project (YAML)
 * Fail-fast: toutes les méthodes lèvent une erreur explicite si la ressource est absente ou invalide.
 */
import type { ProjectConfig, UserConfig } from '@casys/shared';

export interface UserProjectConfigPort {
  // Lecture
  getUserConfig(userId: string): Promise<UserConfig>;
  getProjectConfig(userId: string, projectId: string): Promise<ProjectConfig>;

  // Écriture
  saveUserConfig(userId: string, config: UserConfig): Promise<void>;
  saveProjectConfig(userId: string, projectId: string, config: ProjectConfig): Promise<void>;

  // Découverte
  listUsers(): Promise<string[]>;
  listUserProjects(userId: string): Promise<string[]>;
}
