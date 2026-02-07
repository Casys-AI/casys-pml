import { type ContextVariableMap, Hono } from 'hono';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { computeEtag, maybeNotModified, setEtag } from '../utils/http';
import { createLogger } from '../utils/logger';

interface ProjectsBindings {
  Variables: Pick<ContextVariableMap, 'articleStructureRepository'>;
}

const app = new Hono<ProjectsBindings>();
const logger = createLogger('ProjectsRoute');

interface CreateProjectRequest {
  name: string;
  userId: string;
}

interface StoredProject {
  name: string;
  slug: string;
  userId: string;
  createdAt: string;
  description: string;
  status: string;
}

function isCreateProjectRequest(value: unknown): value is CreateProjectRequest {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.name === 'string' && typeof record.userId === 'string';
}

function isStoredProject(value: unknown): value is StoredProject {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.name === 'string' &&
    typeof record.slug === 'string' &&
    typeof record.userId === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.description === 'string' &&
    typeof record.status === 'string'
  );
}

// Utilise des dossiers temporaires en mode test pour éviter de polluer le site de prod
const hasVitest = !!(process.env.VITEST ?? '');
const hasDescribe = typeof (globalThis as Record<string, unknown>).describe !== 'undefined';
const isTestMode = process.env.NODE_ENV === 'test' || hasVitest || hasDescribe;

const PROJECTS_DIR = isTestMode
  ? path.join(tmpdir(), 'casys-test-projects')
  : path.resolve(process.cwd(), '../../apps/astro-web/src/content/projects');

const ARTICLES_DIR = isTestMode
  ? path.join(tmpdir(), 'casys-test-articles')
  : path.resolve(process.cwd(), '../../apps/astro-web/src/content/articles');

/**
 * POST /projects/create - Crée un nouveau projet
 * Body: { name: string, userId: string }
 */
app.post('/create', async c => {
  try {
    const body: unknown = await c.req.json();
    if (!isCreateProjectRequest(body)) {
      return c.json(
        {
          success: false,
          error: 'Requête invalide: name et userId sont requis',
        },
        400
      );
    }
    const { name, userId } = body;

    // Validation des données
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return c.json(
        {
          success: false,
          error: 'Le nom du projet est requis et doit être une chaîne non vide',
        },
        400
      );
    }

    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return c.json(
        {
          success: false,
          error: "L'ID utilisateur est requis et doit être une chaîne non vide",
        },
        400
      );
    }

    // Génération du slug
    const slug = name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Supprimer les caractères spéciaux
      .replace(/\s+/g, '-') // Remplacer les espaces par des tirets
      .replace(/-+/g, '-') // Éviter les tirets multiples
      .trim();

    if (slug.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Le nom du projet doit contenir au moins un caractère alphanumérique',
        },
        400
      );
    }

    // Vérifier si le projet existe déjà
    const projectPath = path.join(PROJECTS_DIR, `${slug}.json`);
    try {
      await fs.access(projectPath);
      return c.json(
        {
          success: false,
          error: `Un projet avec le slug '${slug}' existe déjà`,
        },
        409
      );
    } catch {
      // Le fichier n'existe pas, c'est ce qu'on veut
    }

    // Créer les données du projet
    const projectData: StoredProject = {
      name: name.trim(),
      slug,
      userId: userId.trim(),
      createdAt: new Date().toISOString(),
      description: `Projet créé pour ${name.trim()}`,
      status: 'active',
    };

    // Assurer que le répertoire projects existe
    await fs.mkdir(PROJECTS_DIR, { recursive: true });

    // Créer le fichier JSON du projet
    await fs.writeFile(projectPath, JSON.stringify(projectData, null, 2), 'utf-8');

    // Créer le répertoire d'articles pour ce projet
    const articlesProjectDir = path.join(ARTICLES_DIR, userId.trim(), slug);
    await fs.mkdir(articlesProjectDir, { recursive: true });

    // Créer un fichier .gitkeep pour préserver le dossier vide
    const gitkeepPath = path.join(articlesProjectDir, '.gitkeep');
    await fs.writeFile(gitkeepPath, '', 'utf-8');

    return c.json({
      success: true,
      project: projectData,
      message: `Projet '${name.trim()}' créé avec succès`,
    });
  } catch (error) {
    logger.error('Erreur lors de la création du projet:', error);
    return c.json(
      {
        success: false,
        error: 'Erreur interne du serveur lors de la création du projet',
      },
      500
    );
  }
});

/**
 * GET /projects - Liste tous les projets
 */
app.get('/', async c => {
  try {
    // Assurer que le répertoire existe
    await fs.mkdir(PROJECTS_DIR, { recursive: true });

    const files = await fs.readdir(PROJECTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const projects: StoredProject[] = [];
    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(PROJECTS_DIR, file), 'utf-8');
        const parsed: unknown = JSON.parse(content);
        if (isStoredProject(parsed)) {
          projects.push(parsed);
        } else {
          logger.warn(`Projet ${file} ignoré: format invalide`);
        }
      } catch (error) {
        logger.error(`Erreur lors de la lecture du projet ${file}:`, error);
        // Continue avec les autres fichiers
      }
    }

    // Trier par date de création (plus récent en premier)
    projects.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // ETag sur la liste des projets (représentation stable)
    const payload = JSON.stringify({ projects });
    const etag = computeEtag(payload);
    const notModified = maybeNotModified(c, etag);
    if (notModified) return notModified;
    setEtag(c, etag);
    return c.json({ success: true, projects });
  } catch (error) {
    logger.error('Erreur lors de la récupération des projets:', error as Error);
    return c.json(
      {
        success: false,
        error: 'Erreur interne du serveur lors de la récupération des projets',
      },
      500
    );
  }
});

/**
 * GET /projects/:tenantId - Liste les projets d'un tenant via le repository MDX
 */
app.get('/:tenantId', async c => {
  try {
    const tenantId = c.req.param('tenantId');
    if (!tenantId) {
      return c.json({ success: false, error: 'tenantId requis' }, 400);
    }

    const repo = c.get('articleStructureRepository');
    if (!repo || typeof repo.listProjectsByTenant !== 'function') {
      return c.json({ success: false, error: 'Repository indisponible' }, 500);
    }

    const projects: string[] = await repo.listProjectsByTenant(tenantId);
    // ETag par tenant
    const payload = JSON.stringify({ tenantId, projects });
    const etag = computeEtag(payload);
    const notModified = maybeNotModified(c, etag);
    if (notModified) return notModified;
    setEtag(c, etag);
    return c.json({ success: true, tenantId, projects });
  } catch (error) {
    logger.error('Erreur lors du listing des projets par tenant:', error as Error);
    return c.json(
      { success: false, error: 'Erreur interne du serveur lors du listing des projets' },
      500
    );
  }
});

export default app;
