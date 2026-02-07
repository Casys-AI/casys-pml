// Import de la route projects
import { Hono } from 'hono';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import projectsRoute from '../projects';

describe('Projects API Route', () => {
  let app: Hono;
  const testProjectsDir = path.join(tmpdir(), 'casys-test-projects');
  const testArticlesDir = path.join(tmpdir(), 'casys-test-articles');

  beforeEach(() => {
    app = new Hono();
    app.route('/projects', projectsRoute);
  });

  afterEach(async () => {
    // Nettoie les dossiers de test après chaque test
    try {
      await fs.rm(testProjectsDir, { recursive: true, force: true });
      await fs.rm(testArticlesDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore les erreurs de nettoyage
    }
  });

  describe('POST /projects/create', () => {
    it('should create a new project successfully', async () => {
      // Arrange
      const projectName = 'Mon Super Projet';
      const userId = 'john-doe';

      // Act
      const res = await app.request('/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName, userId }),
      });

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.project.name).toBe(projectName);
      expect(data.project.slug).toBe('mon-super-projet');
      expect(data.project.userId).toBe(userId);

      // Vérifier que le fichier projet existe dans le dossier temporaire
      const projectFile = path.join(testProjectsDir, 'mon-super-projet.json');
      const projectExists = await fs
        .access(projectFile)
        .then(() => true)
        .catch(() => false);
      expect(projectExists).toBe(true);
    });

    it('should return 400 when project name is missing', async () => {
      // Act
      const res = await app.request('/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'john-doe' }),
      });

      // Assert
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      // Accepte soit le message spécifique, soit le message générique actuel de l'API
      const err = String(data.error ?? '');
      expect(
        err.includes('nom du projet est requis') ||
          err.includes('Requête invalide: name et userId sont requis')
      ).toBe(true);
    });

    it('should return 400 when userId is missing', async () => {
      // Act
      const res = await app.request('/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Project' }),
      });

      // Assert
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      // Accepte soit le message spécifique, soit le message générique actuel de l'API
      const err = String(data.error ?? '');
      expect(
        err.includes('ID utilisateur est requis') ||
          err.includes('Requête invalide: name et userId sont requis')
      ).toBe(true);
    });

    it('should return 409 when project already exists', async () => {
      // Arrange - Create a project first
      await app.request('/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Existing Project', userId: 'john-doe' }),
      });

      // Act - Try to create the same project again
      const res = await app.request('/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Existing Project', userId: 'john-doe' }),
      });

      // Assert
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('existe déjà');
    });
  });

  describe('GET /projects', () => {
    it('should return empty list when no projects exist', async () => {
      // Act
      const res = await app.request('/projects');

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.projects).toEqual([]);
    });

    it('should return list of projects when projects exist', async () => {
      // Arrange - Create some projects
      const res1 = await app.request('/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Mon Premier Projet', userId: 'john-doe' }),
      });
      expect(res1.status).toBe(200);

      // Petit délai pour s'assurer que les timestamps sont différents
      await new Promise(resolve => setTimeout(resolve, 10));

      const res2 = await app.request('/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Mon Second Projet', userId: 'john-doe' }),
      });
      expect(res2.status).toBe(200);

      // Act
      const res = await app.request('/projects');

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.projects).toHaveLength(2);
      expect(data.projects[0].name).toBe('Mon Second Projet'); // Most recent first
      expect(data.projects[1].name).toBe('Mon Premier Projet');
    });
  });
});
