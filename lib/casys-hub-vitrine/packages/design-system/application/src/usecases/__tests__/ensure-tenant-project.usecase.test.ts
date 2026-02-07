import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnsureTenantProjectUseCase } from '../ensure-tenant-project.usecase';
import type {
  ProjectSeoSettingsPort,
  TenantProjectStorePort,
  UserProjectConfigPort,
} from '../../ports/out';

describe('EnsureTenantProjectUseCase', () => {
  let useCase: EnsureTenantProjectUseCase;
  let mockConfigReader: UserProjectConfigPort;
  let mockProjectSettings: ProjectSeoSettingsPort;
  let mockTenantProjectStore: TenantProjectStorePort;

  beforeEach(() => {
    mockConfigReader = {
      getProjectConfig: vi.fn().mockResolvedValue({
        name: 'Test Project',
        description: 'Project description',
      }),
    } as unknown as UserProjectConfigPort;

    mockProjectSettings = {
      getSeoProjectSettings: vi.fn().mockResolvedValue({
        businessDescription: 'Business description',
        language: 'fr',
        siteUrl: 'https://example.com',
        industry: 'Technology',
        targetAudience: 'Developers',
        contentType: 'blog',
      }),
    } as unknown as ProjectSeoSettingsPort;

    mockTenantProjectStore = {
      upsertTenant: vi.fn().mockResolvedValue(undefined),
      upsertProject: vi.fn().mockResolvedValue(undefined),
      linkTenantToProject: vi.fn().mockResolvedValue(undefined),
    } as unknown as TenantProjectStorePort;

    useCase = new EnsureTenantProjectUseCase(
      mockConfigReader,
      mockProjectSettings,
      mockTenantProjectStore
    );
  });

  describe('validation', () => {
    it('devrait rejeter si tenantId est vide', async () => {
      await expect(
        useCase.execute({ tenantId: '', projectId: 'proj1' })
      ).rejects.toThrow('[EnsureTenantProject] tenantId et projectId requis');
    });

    it('devrait rejeter si projectId est vide', async () => {
      await expect(
        useCase.execute({ tenantId: 'tenant1', projectId: '' })
      ).rejects.toThrow('[EnsureTenantProject] tenantId et projectId requis');
    });

    it('devrait rejeter si tenantId est whitespace', async () => {
      await expect(
        useCase.execute({ tenantId: '   ', projectId: 'proj1' })
      ).rejects.toThrow('[EnsureTenantProject] tenantId et projectId requis');
    });

    it('devrait rejeter si projectId est whitespace', async () => {
      await expect(
        useCase.execute({ tenantId: 'tenant1', projectId: '   ' })
      ).rejects.toThrow('[EnsureTenantProject] tenantId et projectId requis');
    });
  });

  describe('execution réussie', () => {
    it('devrait créer tenant et project avec métadonnées', async () => {
      await useCase.execute({ tenantId: 'tenant1', projectId: 'proj1' });

      // Vérifier la lecture de config
      expect(mockConfigReader.getProjectConfig).toHaveBeenCalledWith('tenant1', 'proj1');
      expect(mockProjectSettings.getSeoProjectSettings).toHaveBeenCalledWith('tenant1', 'proj1');

      // Vérifier l'upsert du tenant
      expect(mockTenantProjectStore.upsertTenant).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tenant1',
          name: 'tenant1',
        })
      );

      // Vérifier l'upsert du project
      expect(mockTenantProjectStore.upsertProject).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'proj1',
          tenantId: 'tenant1',
          name: 'Test Project',
          description: 'Business description',
          language: 'fr',
          siteUrl: 'https://example.com',
          industry: 'Technology',
          targetAudience: 'Developers',
          contentType: 'blog',
        })
      );

      // Vérifier le lien tenant-project
      expect(mockTenantProjectStore.linkTenantToProject).toHaveBeenCalledWith({
        tenantId: 'tenant1',
        projectId: 'proj1',
      });
    });

    it('devrait créer tenant avec nom par défaut = tenantId', async () => {
      await useCase.execute({ tenantId: 'my-tenant', projectId: 'proj1' });

      expect(mockTenantProjectStore.upsertTenant).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'my-tenant',
          name: 'my-tenant',
        })
      );
    });

    it('devrait enrichir project avec les SEO settings', async () => {
      (mockProjectSettings.getSeoProjectSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        businessDescription: 'SEO Agency',
        language: 'en',
        siteUrl: 'https://seo-agency.com',
        industry: 'Marketing',
        targetAudience: 'SMBs',
        contentType: 'article',
      });

      await useCase.execute({ tenantId: 'tenant1', projectId: 'proj1' });

      expect(mockTenantProjectStore.upsertProject).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'SEO Agency',
          language: 'en',
          siteUrl: 'https://seo-agency.com',
          industry: 'Marketing',
          targetAudience: 'SMBs',
          contentType: 'article',
        })
      );
    });
  });

  describe('gestion d\'erreurs', () => {
    it('devrait attraper les erreurs et logger (non bloquant)', async () => {
      (mockConfigReader.getProjectConfig as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Config error')
      );

      // Ne devrait pas throw (erreur attrapée)
      await expect(
        useCase.execute({ tenantId: 'tenant1', projectId: 'proj1' })
      ).resolves.toBeUndefined();
    });

    it('devrait continuer malgré erreur de lecture settings', async () => {
      (mockProjectSettings.getSeoProjectSettings as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Settings error')
      );

      await expect(
        useCase.execute({ tenantId: 'tenant1', projectId: 'proj1' })
      ).resolves.toBeUndefined();
    });

    it('devrait continuer malgré erreur de persistence', async () => {
      (mockTenantProjectStore.upsertTenant as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Store error')
      );

      await expect(
        useCase.execute({ tenantId: 'tenant1', projectId: 'proj1' })
      ).resolves.toBeUndefined();
    });
  });

  describe('ordre d\'exécution', () => {
    it('devrait persister tenant avant project', async () => {
      const callOrder: string[] = [];

      (mockTenantProjectStore.upsertTenant as ReturnType<typeof vi.fn>).mockImplementation(
        async () => {
          callOrder.push('tenant');
        }
      );

      (mockTenantProjectStore.upsertProject as ReturnType<typeof vi.fn>).mockImplementation(
        async () => {
          callOrder.push('project');
        }
      );

      (mockTenantProjectStore.linkTenantToProject as ReturnType<typeof vi.fn>).mockImplementation(
        async () => {
          callOrder.push('link');
        }
      );

      await useCase.execute({ tenantId: 'tenant1', projectId: 'proj1' });

      expect(callOrder).toEqual(['tenant', 'project', 'link']);
    });
  });
});
