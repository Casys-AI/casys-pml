import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ctxSetUnsafe } from '../../utils/hono-context';

type MockFn = ReturnType<typeof vi.fn>;
interface DtoApi {
  createResponse: MockFn;
}
interface SharedContainer {
  dtos: { api: DtoApi };
}
interface IndexComponentsUseCaseMock {
  execute: MockFn;
  indexComponentsByTenant: MockFn;
  indexComponent: MockFn;
  indexBaseCatalog: MockFn;
  indexTenantCatalog: MockFn;
}
interface DeleteComponentUseCaseMock {
  execute: MockFn;
}
interface ComponentStoreMock {
  removeComponentById: MockFn;
  getComponentById: MockFn;
}

// Import de la route indexing
import { indexingComponentsRoutes as indexingRoutes } from '../components/indexing.js';

describe('Components Indexing API Routes', () => {
  let app: Hono;
  let mockIndexComponentsUseCase: IndexComponentsUseCaseMock;
  let mockDeleteComponentUseCase: DeleteComponentUseCaseMock;
  let mockComponentStore: ComponentStoreMock;
  let mockSharedContainer: SharedContainer;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock des use cases et des services
    mockIndexComponentsUseCase = {
      execute: vi.fn(),
      indexComponentsByTenant: vi.fn(),
      indexComponent: vi.fn(),
      indexBaseCatalog: vi.fn(),
      indexTenantCatalog: vi.fn(),
    };

    mockDeleteComponentUseCase = {
      execute: vi.fn(),
    };

    mockComponentStore = {
      removeComponentById: vi.fn(),
      getComponentById: vi.fn(),
    };

    // Mock du container shared com les DTOs
    mockSharedContainer = {
      dtos: {
        api: {
          createResponse: vi.fn().mockImplementation((success, data, message) => ({
            success,
            data,
            message,
            error: success ? undefined : message,
          })),
        },
      },
    };

    // Création de l'app Hono avec middleware mockés
    app = new Hono();

    // Middleware pour injecter les mocks dans le contexte
    app.use('*', async (c, next) => {
      // Nouvelles routes lisent via c.get('useCases').<uc>
      ctxSetUnsafe(
        c,
        'useCases',
        {
          indexComponentsUseCase: mockIndexComponentsUseCase,
          deleteComponentUseCase: mockDeleteComponentUseCase,
          // listComponentsUseCase non requis pour ces tests
        } as any
      );
      // Stores additionnels si utilisés par d'autres routes
      ctxSetUnsafe(c, 'componentStore', mockComponentStore);

      // Injection du container shared dans le contexte
      ctxSetUnsafe(c, 'shared', mockSharedContainer);

      // Injection de createApiResponse (attendu par les routes)
      ctxSetUnsafe(c, 'createApiResponse', mockSharedContainer.dtos.api.createResponse);

      await next();
    });

    app.route('/', indexingRoutes);
  });

  describe('POST /catalog-components', () => {
    it('should index components successfully', async () => {
      // Arrange
      // Correction du format pour correspondre au schéma attendu par la route
      // Le schéma attend available_components comme un objet avec des clés, pas un tableau
      const componentsData = {
        available_components: {
          'comp-1': {
            description: 'A reusable button component',
            category: 'ui',
            subcategory: 'inputs',
            file_path: '/components/Button.tsx', // Ajout du file_path attendu par la route
            props: { variant: 'primary', size: 'medium' },
            tags: ['ui', 'button'],
            useCases: ['forms', 'navigation'],
            ai_metadata: { complexity: 'low' }, // Utilisation de ai_metadata au lieu de aiMetadata
          },
          'comp-2': {
            description: 'A form input component',
            category: 'ui',
            subcategory: 'inputs',
            file_path: '/components/Input.tsx', // Ajout du file_path attendu par la route
            props: { type: 'text', placeholder: 'Enter text' },
            tags: ['ui', 'form'],
            useCases: ['forms'],
            ai_metadata: { complexity: 'medium' }, // Utilisation de ai_metadata au lieu de aiMetadata
          },
        },
        tenantId: 'tenant-123',
      };

      mockIndexComponentsUseCase.execute.mockResolvedValue({
        success: true,
        indexedCount: 2,
        indexedComponentIds: ['comp-1', 'comp-2'],
        errors: [],
      });

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: true,
        data: {
          indexedCount: 2,
          indexedComponentIds: ['comp-1', 'comp-2'],
          catalogSize: 2,
          errors: [],
        },
        message: 'Composants indexés avec succès',
      });

      // Act
      const res = await app.request('/catalog-components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(componentsData),
      });

      // Assert - Vérifier que la route renvoie une réponse valide
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.indexedCount).toBe(2);
      expect(data.data.indexedComponentIds).toEqual(['comp-1', 'comp-2']);
    });

    it('should handle validation errors for invalid component data', async () => {
      // Arrange
      const invalidData = {
        components: [
          {
            // Missing required fields
            description: 'Invalid component',
          },
        ],
      };

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: false,
        data: null,
        message: 'Données de composant invalides',
        error: 'Données de composant invalides',
      });

      // Act
      const res = await app.request('/catalog-components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData),
      });

      // Assert
      expect(res.status).toBe(400);
    });
  });

  describe('POST /tenant/:tenantId/component', () => {
    it('should index a single component successfully', async () => {
      // Arrange
      const component = {
        id: 'comp-1',
        name: 'Button',
        description: 'A reusable button component',
        category: 'ui',
        subcategory: 'inputs',
        props: { variant: 'primary', size: 'medium' },
        tags: ['ui', 'button'],
        useCases: ['forms', 'navigation'],
        ai_metadata: { complexity: 'low' },
        file_path: 'components/Button.vue',
      };

      const tenantId = 'tenant-123';

      // Utilisation de execute au lieu de indexComponent
      mockIndexComponentsUseCase.execute.mockResolvedValue({
        success: true,
        indexedCount: 1,
        errors: [],
        indexedComponentIds: [component.id],
      });

      // Mock de la réponse createResponse
      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: true,
        data: {
          indexedCount: 1,
          indexedComponentIds: [component.id],
          errors: [],
        },
        message: 'Composant indexé avec succès',
      });

      // Act
      const res = await app.request(`/tenant/${tenantId}/component`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(component),
      });

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();

      // Vérifier les champs retournés par la route
      expect(data.success).toBe(true);
      expect(data.data.indexedCount).toBe(1);
      expect(data.data.indexedComponentIds).toContain(component.id);
      expect(data.data.errors).toEqual([]);

      // Vérifier que execute a été appelé et inspecter finement l'argument pour tolérer les 2 variantes
      expect(mockIndexComponentsUseCase.execute).toHaveBeenCalledTimes(1);
      const callArg = mockIndexComponentsUseCase.execute.mock.calls[0][0];
      expect(callArg.tenantId).toBe(tenantId);
      expect(callArg.projectId).toBeUndefined();
      expect(Array.isArray(callArg.components)).toBe(true);
      const compArg = callArg.components[0];
      expect(compArg.id).toBe(component.id);
      expect(compArg.name).toBe(component.name);
      expect(compArg.category).toBe(component.category);
      expect(compArg.subcategory).toBe(component.subcategory);
      expect(compArg.tags).toEqual(component.tags);
      expect(compArg.useCases).toEqual(component.useCases);
      expect(compArg.filePath).toBe(component.file_path);
      // Tolérer soit compArg.aiMetadata, soit compArg.metadata.ai_metadata
      const aiMetaTop = compArg.aiMetadata;
      const aiMetaNested = compArg.metadata?.ai_metadata;
      expect(aiMetaTop ?? aiMetaNested).toEqual(component.ai_metadata);
    });

    it('should handle validation errors for invalid component', async () => {
      // Arrange
      const invalidComponent = {
        // Missing required fields (id and name are required)
        description: 'Invalid component',
      };

      const tenantId = 'tenant-123';

      // Act
      const res = await app.request(`/tenant/${tenantId}/component`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidComponent),
      });

      // Assert
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      // Hono zValidator returns error in data.error.message or similar structure
      expect(data.error ?? data.message).toBeDefined();
    });

    it('should handle use case execution errors', async () => {
      // Arrange
      const component = {
        id: 'comp-1',
        name: 'Test Component',
        description: 'A test component',
      };

      const tenantId = 'tenant-123';
      const errorMessage = "Erreur lors de l'indexation du composant";

      // Le use case rejette une erreur
      mockIndexComponentsUseCase.execute.mockRejectedValue(new Error(errorMessage));

      // Mock de la réponse d'erreur
      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: false,
        data: null,
        message: `Erreur lors de l'indexation du composant: ${errorMessage}`,
        error: `Erreur lors de l'indexation du composant: ${errorMessage}`,
      });

      // Act
      const res = await app.request(`/tenant/${tenantId}/component`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(component),
      });

      // Assert
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain("Erreur lors de l'indexation du composant");
      expect(data.error).toBeDefined();
    });
  });

  describe('DELETE /tenant/:tenantId/component/:componentId', () => {
    it('should delete a component successfully', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const componentId = 'comp-1';

      // Mock du deleteComponentUseCase
      mockDeleteComponentUseCase.execute.mockResolvedValue({
        success: true,
        message: `Composant ${componentId} supprimé avec succès`,
        componentId,
        tenantId,
        projectId: undefined,
      });

      // Mock de la réponse createResponse
      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: true,
        data: {
          message: `Composant ${componentId} supprimé avec succès`,
          componentId,
          tenantId,
          projectId: undefined,
        },
        message: `Composant ${componentId} supprimé avec succès`,
      });

      // Act
      const res = await app.request(`/tenant/${tenantId}/component/${componentId}`, {
        method: 'DELETE',
      });

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.message).toContain('supprimé avec succès');
      expect(data.data.componentId).toBe(componentId);
      expect(data.data.tenantId).toBe(tenantId);
      expect(mockDeleteComponentUseCase.execute).toHaveBeenCalledWith({
        componentId,
        tenantId,
        projectId: undefined,
      });
    });

    it('should handle component not found', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const componentId = 'nonexistent-comp';
      const errorMessage = `Composant ${componentId} non trouvé pour le tenant ${tenantId}`;

      // Mock du deleteComponentUseCase qui rejette une erreur
      mockDeleteComponentUseCase.execute.mockRejectedValue(new Error(errorMessage));

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: false,
        data: null,
        message: errorMessage,
        error: errorMessage,
      });

      // Act
      const res = await app.request(`/tenant/${tenantId}/component/${componentId}`, {
        method: 'DELETE',
      });

      // Assert
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain('non trouvé');
    });

    it('should handle store errors during deletion', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const componentId = 'comp-1';
      const errorMessage = 'Database error';

      // Mock du deleteComponentUseCase qui rejette une erreur
      mockDeleteComponentUseCase.execute.mockRejectedValue(new Error(errorMessage));

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: false,
        data: null,
        message: `Erreur interne du serveur lors de la suppression du composant: ${errorMessage}`,
        error: `Erreur interne du serveur lors de la suppression du composant: ${errorMessage}`,
      });

      // Act
      const res = await app.request(`/tenant/${tenantId}/component/${componentId}`, {
        method: 'DELETE',
      });

      // Assert
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Erreur');
      expect(data.error).toContain('Database error');
    });
  });
});