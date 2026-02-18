# Onshape REST API -- Research Report

**Date**: 2026-02-18
**Objectif**: Cartographier l'API REST Onshape pour construire un MCP server avec 80-100 tools.

---

## 1. Authentication

Onshape supporte **deux methodes** d'authentification:

### 1.1 API Keys (HMAC-SHA256)

**Usage**: Scripts d'automatisation, applications personnelles, MCP servers.

**Creation**: `My Account > Developer > API keys` sur cad.onshape.com

**Deux niveaux de securite**:

#### A) Basic Auth (dev/test seulement)
```
Authorization: Basic base64(ACCESS_KEY:SECRET_KEY)
```

#### B) HMAC Signature (production)
Trois headers requis:
- `Date`: HTTP date (valide 5 min)
- `On-Nonce`: 16+ chars alphanumeriques, unique par requete
- `Authorization`: `On <AccessKey>:HmacSHA256:<Signature>`

**Processus de signature**:
```
signing_string = lowercase(
  method + "\n" +
  nonce + "\n" +
  date + "\n" +
  content_type + "\n" +
  url_pathname + "\n" +
  url_query + "\n"
)
signature = base64(hmac_sha256(secret_key, signing_string))
```

**Exemple Node.js**:
```javascript
const crypto = require('crypto');
const u = require('url');

function sign(method, url, nonce, date, contentType, accessKey, secretKey) {
  const urlObj = u.parse(url);
  const str = (method + '\n' + nonce + '\n' + date + '\n' + contentType + '\n' +
    urlObj.pathname + '\n' + (urlObj.query || '') + '\n').toLowerCase();
  const hmac = crypto.createHmac('sha256', secretKey).update(str).digest('base64');
  return 'On ' + accessKey + ':HmacSHA256:' + hmac;
}
```

### 1.2 OAuth2 (Authorization Code Grant)

**Usage**: Applications App Store, multi-utilisateur.

| Parametre | Valeur |
|-----------|--------|
| Authorization URL | `https://oauth.onshape.com/oauth/authorize` |
| Token URL | `https://oauth.onshape.com/oauth/token` |
| User Info URL | `https://cad.onshape.com/api/users/sessioninfo` |
| Grant Type | Authorization Code |
| Token Validity | 60 minutes |
| Refresh | `grant_type=refresh_token` |

**Scopes disponibles**:
| Scope | Description |
|-------|-------------|
| `OAuth2ReadPII` | Acces profil utilisateur |
| `OAuth2Read` | Lecture documents |
| `OAuth2Write` | Modification documents |
| `OAuth2Delete` | Suppression documents/workspaces |
| `OAuth2Purchase` | Achats au nom de l'utilisateur |
| `OAuth2Share` | Partage/departage documents |

**Redirect URIs acceptees**: HTTPS, `http://localhost:<port>`, `urn:ietf:wg:oauth:2.0:oob`

### 1.3 Recommandation pour MCP Server

**API Keys avec HMAC signature**. Raisons:
- Pas besoin de flow OAuth interactif
- Un seul utilisateur (le proprietaire des cles)
- Plus simple a configurer (2 env vars: `ONSHAPE_ACCESS_KEY`, `ONSHAPE_SECRET_KEY`)

---

## 2. Base URL et Structure des Endpoints

### 2.1 Base URL

| Type de compte | Base URL |
|----------------|----------|
| Standard | `https://cad.onshape.com/api` |
| Enterprise | `https://{companyName}.onshape.com/api` |

### 2.2 Versioning

Format: `https://cad.onshape.com/api/v{N}/...`

| Version | Date | Notes |
|---------|------|-------|
| v6 | Ancienne | Stable, largement documentee |
| v9 | 2024 | Part Studios, Assemblies |
| v10 | 2024-11-22 | Documents |
| v11 | 2025-06-06 | |
| v12 | 2025-07-18 | |
| **v13** | **2026-01-09** | **Derniere version** |

Sans version specifiee, v0 est utilise par defaut. Les versions ne sont incrementees que pour les **breaking changes**.

### 2.3 Pattern d'URL

```
{base_url}/v{N}/{resource}/d/{did}/{wvm}/{wvmid}/e/{eid}
```

| Segment | Description | Longueur |
|---------|-------------|----------|
| `d/{did}` | Document ID | 24 chars hex |
| `w/{wid}` | Workspace ID (mutable) | 24 chars hex |
| `v/{vid}` | Version ID (immutable) | 24 chars hex |
| `m/{mid}` | Microversion ID (immutable) | 24 chars hex |
| `e/{eid}` | Element ID (tab dans un doc) | 24 chars hex |

**Regle**: POST uniquement sur workspaces (`w/`), car versions et microversions sont immutables.

### 2.4 Methodes HTTP

Onshape ne supporte que **trois methodes**:
- **GET** : Lecture
- **POST** : Ecriture/Modification
- **DELETE** : Suppression

Pas de PUT, PATCH.

---

## 3. Catalogue Complet des Endpoints (390 methodes, 47 categories)

Source: OpenAPI spec du Go client officiel. Liste exhaustive.

### 3.1 Documents (DocumentApi) -- ~25 methodes

| Methode | HTTP | Path | Description |
|---------|------|------|-------------|
| CreateDocument | POST | `/documents` | Creer un document |
| GetDocument | GET | `/documents/{did}` | Obtenir un document |
| GetDocuments | GET | `/documents` | Lister/rechercher documents |
| DeleteDocument | DELETE | `/documents/{did}` | Supprimer un document |
| UpdateDocumentAttributes | POST | `/documents/{did}` | Modifier nom/description |
| CreateVersion | POST | `/documents/d/{did}/versions` | Creer une version |
| GetDocumentVersions | GET | `/documents/d/{did}/versions` | Lister versions |
| GetVersion | GET | `/documents/d/{did}/versions/{vid}` | Obtenir une version |
| CreateWorkspace | POST | `/documents/d/{did}/workspaces` | Creer un workspace (branche) |
| DeleteWorkspace | DELETE | `/documents/d/{did}/workspaces/{wid}` | Supprimer workspace |
| GetDocumentWorkspaces | GET | `/documents/d/{did}/workspaces` | Lister workspaces |
| CopyWorkspace | POST | `/documents/d/{did}/workspaces/{wid}/copy` | Copier workspace |
| GetElementsInDocument | GET | `/documents/d/{did}/{wvm}/{wvmid}/elements` | Lister elements (tabs) |
| GetDocumentAcl | GET | `/documents/{did}/acl` | Permissions du document |
| ShareDocument | POST | `/documents/{did}/share` | Partager |
| UnShareDocument | DELETE | `/documents/{did}/share/{eid}` | Departager |
| GetDocumentHistory | GET | `/documents/d/{did}/{wm}/{wmid}/documenthistory` | Historique |
| GetCurrentMicroversion | GET | `/documents/d/{did}/{wv}/{wvid}/currentmicroversion` | Microversion courante |
| MergeIntoWorkspace | POST | `/documents/d/{did}/w/{wid}/merge` | Fusionner |
| MergePreview | GET | `/documents/d/{did}/w/{wid}/mergePreview` | Apercu fusion |
| Search | POST | `/documents/search` | Recherche avancee |
| Export2Json | GET | `/documents/d/{did}/export2Json` | Export JSON |
| MoveElementsToDocument | POST | `/documents/d/{did}/w/{wid}/moveelement` | Deplacer elements |
| GetInsertables | GET | `/documents/d/{did}/{wvm}/{wvmid}/insertables` | Insertables |
| GetUnitInfo | GET | `/documents/d/{did}/{wvm}/{wvmid}/unitinfo` | Info unites |
| RestoreFromHistory | POST | `/documents/d/{did}/w/{wid}/restore/{vm}/{vmid}` | Restaurer |
| SyncAppElements | POST | `/documents/d/{did}/w/{wid}/syncAppElements` | Sync elements app |
| UpdateAnonymousAccess | POST | `/documents/{did}/anonymousaccess` | Acces anonyme |
| UpdatePublicAccess | POST | `/documents/{did}/publicaccess` | Acces public |

### 3.2 Part Studios (PartStudioApi) -- ~25 methodes

| Methode | Description |
|---------|-------------|
| CreatePartStudio | Creer un Part Studio |
| GetPartStudioFeatures | Lister les features |
| AddPartStudioFeature | Ajouter une feature |
| UpdatePartStudioFeature | Modifier une feature |
| DeletePartStudioFeature | Supprimer une feature |
| UpdateFeatures | Modifier plusieurs features |
| UpdateRollback | Deplacer le rollback bar |
| GetPartStudioBodyDetails | Details des corps (faces, edges, vertices) |
| GetPartStudioBoundingBoxes | Bounding boxes |
| GetPartStudioEdges | Aretes |
| GetPartStudioFaces | Faces |
| GetPartStudioMassProperties | Proprietes de masse |
| GetPartStudioNamedViews | Vues nommees |
| GetPartStudioShadedViews | Vues ombrees (rendus) |
| GetPartStudioFeatureSpecs | Specs des features |
| EvalFeatureScript | Evaluer du FeatureScript |
| GetFeatureScriptRepresentation | Representation FS |
| GetFeatureScriptTable | Table FS |
| ComparePartStudios | Comparer Part Studios |
| TranslateIds | Traduire des IDs |
| ExportParasolid | Export Parasolid (sync) |
| ExportPartStudioGltf | Export glTF (sync) |
| ExportPartStudioStl | Export STL (sync) |
| CreatePartStudioExportGltf | Export glTF (async) |
| CreatePartStudioExportObj | Export OBJ (async) |
| CreatePartStudioExportSolidworks | Export SOLIDWORKS (async) |
| CreatePartStudioExportStep | Export STEP (async) |
| CreatePartStudioTranslation | Export format generique (async) |

### 3.3 Parts (PartApi) -- ~10 methodes

| Methode | Description |
|---------|-------------|
| GetPartsWMV | Lister parts dans un workspace/version |
| GetPartsWMVE | Lister parts dans un element |
| GetBodyDetails | Details du corps d'une part |
| GetBoundingBoxes | Bounding boxes |
| GetEdges | Aretes |
| GetFaces1 | Faces |
| GetMassProperties | Proprietes de masse |
| GetPartShadedViews | Vues ombrees |
| GetBendTable | Table de pliage (sheet metal) |
| ExportPS | Export Parasolid |
| ExportPartGltf | Export glTF |
| ExportStl | Export STL |

### 3.4 Assemblies (AssemblyApi) -- ~28 methodes

| Methode | Description |
|---------|-------------|
| CreateAssembly | Creer un assemblage |
| GetAssemblyDefinition | Definition (arbre, instances, mates) |
| Modify | Modifier assemblage (supprimer/supprimer/transformer instances) |
| CreateInstance | Inserer une instance |
| DeleteInstance | Supprimer une instance |
| AddFeature | Ajouter une feature (mate, etc.) |
| UpdateFeature | Modifier une feature |
| DeleteFeature | Supprimer une feature |
| GetFeatures | Lister les features |
| GetFeatureSpecs | Specs des features |
| GetBillOfMaterials | **BOM** -- nomenclature |
| GetOrCreateBillOfMaterialsElement | BOM element (creer si absent) |
| GetAssemblyBoundingBoxes | Bounding boxes |
| GetAssemblyMassProperties | Proprietes de masse |
| GetAssemblyShadedViews | Vues ombrees |
| GetMateValues | Valeurs des mates |
| UpdateMateValues | Modifier valeurs mates |
| GetNamedViews | Vues nommees |
| GetNamedPositions | Positions nommees |
| GetDisplayStates | Etats d'affichage |
| GetExplodedViews | Vues eclatees |
| InsertTransformedInstances | Inserer avec transformation |
| TransformOccurrences | Transformer des occurrences |
| TranslateFormat | Export format generique |
| CreateAssemblyExportGltf | Export glTF |
| CreateAssemblyExportObj | Export OBJ |
| CreateAssemblyExportSolidworks | Export SOLIDWORKS |
| CreateAssemblyExportStep | Export STEP |

### 3.5 Drawings (DrawingApi) -- 7 methodes

| Methode | Description |
|---------|-------------|
| CreateDrawingAppElement | Creer un dessin |
| GetDrawingViews1 | Lister les vues |
| GetDrawingViewJsonGeometry1 | Geometrie JSON d'une vue |
| ModifyDrawing | Modifier un dessin |
| GetModificationStatus | Statut de modification |
| CreateDrawingTranslation | Export (PDF, DXF, etc.) |
| GetDrawingTranslatorFormats | Formats disponibles |

### 3.6 Metadata (MetadataApi + MetadataCategoryApi) -- 12 methodes

| Methode | Description |
|---------|-------------|
| GetWVMetadata | Metadata d'un workspace/version |
| GetWMVEMetadata | Metadata d'un element |
| GetWMVEPMetadata | Metadata d'une part/face/edge |
| GetWMVEPsMetadata | Metadata de plusieurs parts |
| GetWMVEsMetadata | Metadata de plusieurs elements |
| GetFullAssemblyMetadata | Metadata complete d'un assemblage |
| GetVEOPStandardContentMetadata | Metadata contenu standard |
| UpdateWVMetadata | Modifier metadata workspace/version |
| UpdateWVEMetadata | Modifier metadata element |
| UpdateWVEPMetadata | Modifier metadata part |
| UpdateVEOPStandardContentPartMetadata | Modifier metadata contenu standard |
| GetCategoryProperties | Proprietes d'une categorie metadata |

### 3.7 Elements & Configurations (ElementApi) -- 7 methodes

| Methode | Description |
|---------|-------------|
| GetConfiguration | Obtenir la configuration |
| UpdateConfiguration | Modifier la configuration |
| EncodeConfigurationMap | Encoder une config en query string |
| DecodeConfiguration | Decoder une config |
| CopyElementFromSourceDocument | Copier un element |
| DeleteElement | Supprimer un element |
| UpdateReferences | Modifier les references |
| GetElementTranslatorFormatsByVersionOrWorkspace | Formats d'export |

### 3.8 Variables (VariablesApi) -- 7 methodes

| Methode | Description |
|---------|-------------|
| CreateVariableStudio | Creer un Variable Studio |
| GetVariables | Obtenir les variables |
| SetVariables | Modifier les variables |
| GetVariableStudioScope | Obtenir le scope |
| SetVariableStudioScope | Modifier le scope |
| GetVariableStudioReferences | Obtenir les references |
| SetVariableStudioReferences | Modifier les references |

### 3.9 FeatureScript (FeatureStudioApi) -- 4 methodes

| Methode | Description |
|---------|-------------|
| CreateFeatureStudio | Creer un Feature Studio |
| GetFeatureStudioContents | Obtenir le code FS |
| UpdateFeatureStudioContents | Modifier le code FS |
| GetFeatureStudioSpecs | Specs des features custom |

Note: `EvalFeatureScript` est dans PartStudioApi. Seules les **lambda expressions** sont evaluables.

### 3.10 Import & Export / Translations (TranslationApi + BlobElementApi) -- 10 methodes

| Methode | Description |
|---------|-------------|
| CreateTranslation | Import fichier (STEP, IGES, etc.) |
| GetTranslation | Statut d'un import/export |
| GetDocumentTranslations | Lister translations d'un document |
| DeleteTranslation | Supprimer une translation |
| GetAllTranslatorFormats | Tous les formats supportes |
| UploadFileCreateElement | Upload fichier (creer blob) |
| UploadFileUpdateElement | Upload fichier (maj blob) |
| CreateBlobTranslation | Traduire un blob |
| DownloadFileWorkspace | Telecharger un blob |
| UpdateUnits | Modifier les unites d'un blob |

**Formats d'export supportes**: STEP, IGES, STL, OBJ, glTF, Parasolid, SOLIDWORKS, PDF, DXF, DWG, ACIS, JT, Rhino, SVG.

**Exports synchrones** (retournent 307 redirect): STL, glTF, Parasolid pour parts et Part Studios.
**Exports asynchrones** (poll via GetTranslation): STEP, OBJ, SOLIDWORKS, format generique.

### 3.11 Release Management (ReleasePackageApi) -- 4 methodes

| Methode | Description |
|---------|-------------|
| CreateReleasePackage | Creer un package de release |
| GetReleasePackage | Obtenir un package |
| UpdateReleasePackage | Modifier un package |
| CreateObsoletionPackage | Creer un package d'obsolescence |

### 3.12 Revisions (RevisionApi) -- 9 methodes

| Methode | Description |
|---------|-------------|
| EnumerateRevisions | Lister les revisions |
| GetAllInDocument | Toutes revisions d'un document |
| GetAllInDocumentVersion | Revisions d'une version |
| GetLatestInDocumentOrCompany | Derniere revision |
| GetRevisionByPartNumber | Revision par numero de piece |
| GetRevisionHistoryInCompanyByElementId | Historique par element |
| GetRevisionHistoryInCompanyByPartId | Historique par part |
| GetRevisionHistoryInCompanyByPartNumber | Historique par numero |
| DeleteRevisionHistory | Supprimer historique |

### 3.13 Thumbnails (ThumbnailApi) -- 11 methodes

| Methode | Description |
|---------|-------------|
| GetDocumentThumbnail | Miniature d'un document |
| GetDocumentThumbnailWithSize | Miniature avec taille specifiee |
| GetElementThumbnail | Miniature d'un element |
| GetElementThumbnailWithSize | Miniature element avec taille |
| GetElementThumbnailWithApiConfiguration | Miniature avec config |
| GetThumbnailForDocument | Miniature pour document |
| GetThumbnailForDocumentAndVersion | Miniature document + version |
| GetThumbnailForDocumentAndVersionOld | (legacy) |
| GetThumbnailForDocumentOld | (legacy) |
| SetApplicationElementThumbnail | Definir miniature app |
| DeleteApplicationThumbnails | Supprimer miniatures app |

### 3.14 Comments (CommentApi) -- 9 methodes

| Methode | Description |
|---------|-------------|
| CreateComment | Creer un commentaire |
| GetComment | Obtenir un commentaire |
| GetComments | Lister les commentaires |
| UpdateComment | Modifier un commentaire |
| DeleteComment | Supprimer un commentaire |
| AddAttachment | Ajouter une piece jointe |
| GetAttachment | Obtenir une piece jointe |
| DeleteAttachments | Supprimer pieces jointes |
| Resolve | Resoudre un commentaire |
| Reopen | Rouvrir un commentaire |

### 3.15 Workflow (WorkflowApi) -- 5 methodes

| Methode | Description |
|---------|-------------|
| GetActiveWorkflows | Workflows actifs |
| GetWorkflowById | Obtenir un workflow |
| EnumerateObjectWorkflows | Enumerer workflows d'un objet |
| GetAllowedApprovers | Approbateurs autorises |
| GetAuditLog | Journal d'audit |

### 3.16 Tasks (TaskApi) -- 5 methodes

| Methode | Description |
|---------|-------------|
| CreateTask | Creer une tache |
| GetTask | Obtenir une tache |
| GetActionItems | Lister les actions |
| UpdateTask | Modifier une tache |
| TransitionTask | Transitionner une tache |

### 3.17 Users & Teams (UserApi + TeamApi + CompanyApi) -- 15 methodes

**UserApi**:
| Methode | Description |
|---------|-------------|
| SessionInfo | Info de session |
| Session | Session courante |
| GetUserSettings | Parametres utilisateur |
| GetUserSettingsCurrentLoggedInUser | Parametres utilisateur connecte |

**TeamApi**:
| Methode | Description |
|---------|-------------|
| GetTeam | Obtenir une equipe |
| GetMembers | Membres d'une equipe |
| Find | Rechercher des equipes |

**CompanyApi**:
| Methode | Description |
|---------|-------------|
| GetCompany | Obtenir la compagnie |
| FindCompany | Rechercher compagnies |
| GetDocumentsByName | Documents par nom |
| AddUserToCompany | Ajouter utilisateur |
| RemoveUserFromCompany | Retirer utilisateur |
| UpdateCompanyUser | Modifier utilisateur |
| AddGlobalPermissionsForIdentity | Ajouter permissions |
| ClearGlobalPermissions | Supprimer permissions |

### 3.18 Webhooks (WebhookApi) -- 6 methodes

| Methode | Description |
|---------|-------------|
| CreateWebhook | Creer un webhook |
| GetWebhook | Obtenir un webhook |
| GetWebhooks | Lister webhooks |
| UpdateWebhook | Modifier webhook |
| UnregisterWebhook | Supprimer webhook |
| PingWebhook | Tester webhook |

**Evenements webhook disponibles**:
- `onshape.document.lifecycle.created/shared/statechange`
- `onshape.model.lifecycle.changed/createelement/createversion/createworkspace/deleteelement/metadata`
- `onshape.model.lifecycle.changed.externalreferences`
- `onshape.model.translation.complete`
- `onshape.comment.create/delete/update`
- `onshape.revision.created`
- `onshape.workflow.transition`
- `onshape.user.lifecycle.updateappsettings`
- `webhook.register/unregister/ping`

### 3.19 App Elements (AppElementApi) -- 26 methodes

Pour les applications personnalisees avec stockage structure dans Onshape:

| Methode | Description |
|---------|-------------|
| CreateElement | Creer un app element |
| BulkCreateElement | Creer en masse |
| GetJson | Obtenir JSON |
| GetJsonPaths | Obtenir JSON paths |
| GetSubElementContent | Contenu sub-element |
| GetSubElementContentBatch | Contenu en batch |
| GetSubelementIds | IDs sub-elements |
| UpdateAppElement | Modifier app element |
| DeleteAppElementContent | Supprimer contenu |
| DeleteAppElementContentBatch | Supprimer en batch |
| CompareAppElementJson | Comparer JSON |
| GetAppElementHistory | Historique |
| GetElementTransactions | Transactions |
| StartTransaction | Demarrer transaction |
| CommitTransactions | Valider transactions |
| AbortTransaction | Annuler transaction |
| CreateReference | Creer reference |
| UpdateReference | Modifier reference |
| DeleteReference | Supprimer reference |
| ResolveReference | Resoudre reference |
| ResolveReferences | Resoudre plusieurs |
| ResolveAllElementReferences | Resoudre toutes |
| GetBlobSubelementIds | IDs blob sub-elements |
| UploadBlobSubelement | Upload blob |
| DownloadBlobSubelement | Download blob |
| DeleteBlobSubelement | Supprimer blob |

### 3.20 Autres Categories

**AliasApi** (6): CreateAlias, DeleteAlias, GetAlias, GetAliasMembers, GetAliasesInCompany, UpdateAlias

**AppAssociativeDataApi** (4): CopyAssociativeData, DeleteAssociativeData, GetAssociativeData, PostAssociativeData

**BillingApi** (1): GetClientPlans

**AccountApi** (4): CancelPurchaseNew, ConsumePurchase, GetPlanPurchases, GetPurchases

**APIApplicationApi** (7): DeleteAppSettings, DeleteCompanyAppSettings, GetApplicableExtensionsForClient, GetCompanyAppSettings, GetUserAppSettings, UpdateAppCompanySettings, UpdateAppSettings

**EventApi** (1): FireEvent

**ExportRuleApi** (1): GetValidRuleOptions

**FolderApi** (3): GetFolderAcl, Share, UnShare

**InsertableApi** (1): GetLatestInDocument

**ItemApi** (5): CreateItem, DeleteItem, GetItem, GetItems, UpdateItem

**NumberingSchemeApi** (1): NextNumbers

**PartNumberApi** (1): UpdateNextNumbers

**PropertiesTableTemplateApi** (5): CreateTableTemplate, DeleteTableTemplate, GetByCompanyId, GetByDocumentId, GetTableTemplate

**PublicationApi** (7): AddItemToPublication, AddItemsToPublication, CreatePublication, DeletePublication, DeletePublicationItem, GetPublicationItems, UpdatePublicationAttributes

**SketchApi** (3): GetSketchBoundingBoxes, GetSketchInfo, GetTessellatedEntities

**StandardContentApi** (3): GetParameterValuesForId, GetStandardContentList, SetCustomParameters

**VersionApi** (1): GetAllVersions

**OpenApiApi** (2): GetOpenApi, GetTags

---

## 4. Rate Limits

### 4.1 Limites annuelles

| Type d'abonnement | Limite annuelle |
|--------------------|----------------|
| Enterprise / Enterprise GOV | 10,000 par utilisateur complet |
| Professional | 5,000 par utilisateur |
| **Free / Standard / EDU Student** | **2,500 par utilisateur** |
| EDU Enterprise | 10,000 par enterprise |
| EDU Educator / Pro Discovery | 2,500 par compagnie |

**Depassement**: HTTP 402 (Payment Required). Achat supplementaire via support Onshape.

### 4.2 Ce qui compte / ne compte PAS

**Compte** (si 2xx/3xx):
- Appels authentifies API key
- Applications OAuth2 privees
- API Explorer via API keys/OAuth2

**Ne compte PAS**:
- Applications App Store publiques OAuth2
- Appels navigateur/mobile natifs
- API Explorer via session Onshape
- Notifications webhook
- Requetes 4xx/5xx

### 4.3 Rate limits par endpoint

Onshape impose aussi des limites **par endpoint par fenetre de temps** (non documentees publiquement).

**Headers de reponse**:
- `X-Rate-Limit-Remaining`: Appels restants pour cet endpoint dans la fenetre
- `Retry-After` (sur 429): Secondes avant reset

### 4.4 Strategie pour MCP server

1. **Caching agressif** sur les GET (documents, parts, assemblies)
2. **Retry avec backoff exponentiel** sur 429
3. **Lire `X-Rate-Limit-Remaining`** et ralentir proactivement
4. **Batch les operations** (un seul appel Assembly Definition vs N appels individuels)
5. **Budget**: 2,500 appels/an sur free = ~7 appels/jour. Tres serré.

---

## 5. Free Plan -- Limitations

| Aspect | Limitation |
|--------|-----------|
| Documents | **Tous publics** (pas de documents prives) |
| Usage commercial | **Interdit** (hobbyistes et apprenants seulement) |
| API calls/an | **2,500** |
| CAD features | Identiques au Professional |
| Storage | Illimite (mais public) |
| Export | Tous formats disponibles |
| Versions/Revisions | Supportes |

**Impact pour MCP server**: Avec 2,500 appels/an, un free plan est extremement limitant pour du dev/test. Un compte Professional (5,000/an) ou Enterprise (10,000/an) est recommande pour un usage serieux.

**Alternative**: Les appels retournant 4xx/5xx ne comptent pas, et les applications App Store publiques OAuth2 sont **exemptees**. Publier l'app sur l'App Store = appels illimites.

---

## 6. SDKs et Client Libraries

### 6.1 Clients officiels (onshape-public GitHub)

| Langage | Repo | Statut | Notes |
|---------|------|--------|-------|
| **TypeScript** | [onshape-ts-client](https://github.com/onshape-public/onshape-ts-client) | Actif | Exemples: export, revisions, webhooks |
| **Go** | [go-client](https://github.com/onshape-public/go-client) | Actif | Auto-genere depuis OpenAPI, 390 methodes |
| **Python** | [onshape-clients](https://github.com/onshape-public/onshape-clients) | Archive (2023) | Etait multi-langage |
| **Node.js (API Keys)** | [apikey](https://github.com/onshape-public/apikey) | Actif | Exemples HMAC signing |

### 6.2 Clients communautaires

| Projet | Langage | Notes |
|--------|---------|-------|
| [onpy](https://github.com/kyle-tennison/onpy) | Python | API de haut niveau pour modelisation |
| [onshape-test-client](https://pypi.org/project/onshape-test-client/) | Python | PyPI |

### 6.3 MCP Servers existants

| Projet | Langage | Tools | Notes |
|--------|---------|-------|-------|
| [hedless/onshape-mcp](https://github.com/hedless/onshape-mcp) | Python | 13 | Documents, parts, features, variables, sketches, extrudes |
| [BLamy/onshape-mcp](https://github.com/BLamy/onshape-mcp) | TypeScript | ? | Early stage, minimal docs |

### 6.4 OpenAPI Spec

L'OpenAPI spec complete est disponible a:
- **GitHub**: `onshape-public/onshape-clients/openapi.json`
- **API dynamique**: `GET https://cad.onshape.com/api/v6/openapi` (OpenApiApi.GetOpenApi)

C'est la source de verite pour generer des clients.

### 6.5 Config client unifiee

Fichier: `~/.onshape_client_config.yaml`
```yaml
default_stack: cad
stacks:
  cad:
    base_url: https://cad.onshape.com
    access_key: XXXXXXXXXXXXXXX
    secret_key: YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY
```

---

## 7. Pagination

### Pattern standard: offset/limit

```
GET /api/v10/documents?offset=0&limit=20&q=robot
```

| Parametre | Description | Default |
|-----------|-------------|---------|
| `offset` | Position de depart (0-indexed) | 0 |
| `limit` | Nombre max d'items | Variable (souvent 20) |

**Maximum**: Jusqu'a 1000 items par requete.

**Response**: Le body JSON inclut typiquement:
```json
{
  "items": [...],
  "next": "https://cad.onshape.com/api/v10/documents?offset=20&limit=20",
  "previous": null,
  "href": "https://cad.onshape.com/api/v10/documents?offset=0&limit=20"
}
```

**Endpoints pagines connus**: `GetDocuments`, `GetDocumentVersions`, `EnumerateRevisions`, `GetComments`, `GetWebhooks`.

---

## 8. Error Handling

### 8.1 Codes de reponse

| Code | Signification | Compte dans limites? |
|------|---------------|---------------------|
| **200** | OK | Oui |
| **204** | No Content (succes, body vide) | Oui |
| **307** | Redirect temporaire (exports sync) | Oui |
| **400** | Bad Request (syntaxe, params invalides) | Non |
| **401** | Unauthorized (auth echouee) | Non |
| **402** | Payment Required (limites annuelles atteintes) | Non |
| **403** | Forbidden (permissions insuffisantes) | Non |
| **404** | Not Found | Non |
| **405** | Method Not Allowed | Non |
| **406** | Not Acceptable (media type) | Non |
| **409** | Conflict (doublons) | Non |
| **415** | Unsupported Media Type | Non |
| **429** | Too Many Requests (rate limit) | Non |
| **499** | Timeout (requete trop longue) | Non |
| **500** | Internal Server Error | Non |
| **503** | Service Unavailable | Non |

### 8.2 Format d'erreur

Les erreurs retournent du JSON. Format typique:
```json
{
  "status": 404,
  "message": "Document not found",
  "moreInfoUrl": "https://onshape-public.github.io/docs/api-adv/errors/"
}
```

### 8.3 Gestion recommandee

| Code | Action |
|------|--------|
| 307 | Suivre le redirect (nouveau Authorization header requis) |
| 401 | Verifier cles API, scopes OAuth |
| 402 | Limite annuelle atteinte. Acheter plus ou attendre |
| 403 | Verifier permissions sur le document |
| 429 | Lire `Retry-After` header, attendre, retry |
| 499 | Requete trop longue, simplifier |
| 500/503 | Retry avec backoff, contacter support si persistant |

---

## 9. Proposition de MCP Server: 80-100 Tools

Basee sur l'analyse des 390 methodes API, voici une selection de **~95 tools** couvrant les cas d'usage principaux:

### 9.1 Documents (12 tools)
1. `onshape_document_create` -- CreateDocument
2. `onshape_document_get` -- GetDocument
3. `onshape_document_list` -- GetDocuments (avec search)
4. `onshape_document_delete` -- DeleteDocument
5. `onshape_document_update` -- UpdateDocumentAttributes
6. `onshape_document_elements` -- GetElementsInDocument
7. `onshape_document_history` -- GetDocumentHistory
8. `onshape_document_share` -- ShareDocument
9. `onshape_document_unshare` -- UnShareDocument
10. `onshape_document_search` -- Search
11. `onshape_document_permissions` -- GetDocumentAcl
12. `onshape_document_units` -- GetUnitInfo

### 9.2 Versions & Workspaces (8 tools)
13. `onshape_version_create` -- CreateVersion
14. `onshape_version_list` -- GetDocumentVersions
15. `onshape_version_get` -- GetVersion
16. `onshape_workspace_create` -- CreateWorkspace
17. `onshape_workspace_list` -- GetDocumentWorkspaces
18. `onshape_workspace_delete` -- DeleteWorkspace
19. `onshape_workspace_merge` -- MergeIntoWorkspace
20. `onshape_workspace_merge_preview` -- MergePreview

### 9.3 Part Studios (14 tools)
21. `onshape_partstudio_create` -- CreatePartStudio
22. `onshape_partstudio_features` -- GetPartStudioFeatures
23. `onshape_partstudio_add_feature` -- AddPartStudioFeature
24. `onshape_partstudio_update_feature` -- UpdatePartStudioFeature
25. `onshape_partstudio_delete_feature` -- DeletePartStudioFeature
26. `onshape_partstudio_body_details` -- GetPartStudioBodyDetails
27. `onshape_partstudio_mass_properties` -- GetPartStudioMassProperties
28. `onshape_partstudio_bounding_boxes` -- GetPartStudioBoundingBoxes
29. `onshape_partstudio_shaded_views` -- GetPartStudioShadedViews
30. `onshape_partstudio_named_views` -- GetPartStudioNamedViews
31. `onshape_partstudio_eval_featurescript` -- EvalFeatureScript
32. `onshape_partstudio_compare` -- ComparePartStudios
33. `onshape_partstudio_rollback` -- UpdateRollback
34. `onshape_partstudio_feature_specs` -- GetPartStudioFeatureSpecs

### 9.4 Parts (7 tools)
35. `onshape_parts_list` -- GetPartsWMVE
36. `onshape_part_body_details` -- GetBodyDetails
37. `onshape_part_mass_properties` -- GetMassProperties
38. `onshape_part_bounding_boxes` -- GetBoundingBoxes
39. `onshape_part_shaded_views` -- GetPartShadedViews
40. `onshape_part_bend_table` -- GetBendTable
41. `onshape_part_faces` -- GetFaces1

### 9.5 Assemblies (14 tools)
42. `onshape_assembly_create` -- CreateAssembly
43. `onshape_assembly_definition` -- GetAssemblyDefinition
44. `onshape_assembly_modify` -- Modify
45. `onshape_assembly_insert_instance` -- CreateInstance
46. `onshape_assembly_delete_instance` -- DeleteInstance
47. `onshape_assembly_add_feature` -- AddFeature
48. `onshape_assembly_features` -- GetFeatures
49. `onshape_assembly_bom` -- GetBillOfMaterials
50. `onshape_assembly_mass_properties` -- GetAssemblyMassProperties
51. `onshape_assembly_bounding_boxes` -- GetAssemblyBoundingBoxes
52. `onshape_assembly_mate_values` -- GetMateValues
53. `onshape_assembly_update_mates` -- UpdateMateValues
54. `onshape_assembly_shaded_views` -- GetAssemblyShadedViews
55. `onshape_assembly_exploded_views` -- GetExplodedViews

### 9.6 Drawings (5 tools)
56. `onshape_drawing_create` -- CreateDrawingAppElement
57. `onshape_drawing_views` -- GetDrawingViews1
58. `onshape_drawing_geometry` -- GetDrawingViewJsonGeometry1
59. `onshape_drawing_modify` -- ModifyDrawing
60. `onshape_drawing_export` -- CreateDrawingTranslation

### 9.7 Export & Import (10 tools)
61. `onshape_export_step` -- STEP (Part Studio ou Assembly)
62. `onshape_export_stl` -- STL (sync, Part ou Part Studio)
63. `onshape_export_gltf` -- glTF (sync ou async)
64. `onshape_export_obj` -- OBJ (async)
65. `onshape_export_solidworks` -- SOLIDWORKS (async)
66. `onshape_export_parasolid` -- Parasolid (sync)
67. `onshape_export_generic` -- Format generique via formatName
68. `onshape_import_file` -- CreateTranslation (import STEP, IGES, etc.)
69. `onshape_translation_status` -- GetTranslation (poll)
70. `onshape_translator_formats` -- GetAllTranslatorFormats

### 9.8 Configurations & Variables (6 tools)
71. `onshape_config_get` -- GetConfiguration
72. `onshape_config_update` -- UpdateConfiguration
73. `onshape_config_encode` -- EncodeConfigurationMap
74. `onshape_variables_get` -- GetVariables
75. `onshape_variables_set` -- SetVariables
76. `onshape_variable_studio_create` -- CreateVariableStudio

### 9.9 Metadata (5 tools)
77. `onshape_metadata_element` -- GetWMVEMetadata
78. `onshape_metadata_part` -- GetWMVEPMetadata
79. `onshape_metadata_assembly_full` -- GetFullAssemblyMetadata
80. `onshape_metadata_update_element` -- UpdateWVEMetadata
81. `onshape_metadata_update_part` -- UpdateWVEPMetadata

### 9.10 Release & Revisions (6 tools)
82. `onshape_release_create` -- CreateReleasePackage
83. `onshape_release_get` -- GetReleasePackage
84. `onshape_release_update` -- UpdateReleasePackage
85. `onshape_revision_list` -- EnumerateRevisions
86. `onshape_revision_by_part_number` -- GetRevisionByPartNumber
87. `onshape_revision_history` -- GetRevisionHistoryInCompanyByPartNumber

### 9.11 Thumbnails (3 tools)
88. `onshape_thumbnail_document` -- GetDocumentThumbnailWithSize
89. `onshape_thumbnail_element` -- GetElementThumbnailWithSize
90. `onshape_thumbnail_element_config` -- GetElementThumbnailWithApiConfiguration

### 9.12 Comments (4 tools)
91. `onshape_comment_create` -- CreateComment
92. `onshape_comment_list` -- GetComments
93. `onshape_comment_resolve` -- Resolve
94. `onshape_comment_delete` -- DeleteComment

### 9.13 Users & Teams (3 tools)
95. `onshape_user_session_info` -- SessionInfo
96. `onshape_team_get` -- GetTeam
97. `onshape_team_members` -- GetMembers

### 9.14 Webhooks (3 tools -- optionnel)
98. `onshape_webhook_create` -- CreateWebhook
99. `onshape_webhook_list` -- GetWebhooks
100. `onshape_webhook_delete` -- UnregisterWebhook

**Total: 100 tools**

---

## 10. Risques et Points d'Attention

### 10.1 Limite annuelle critique
2,500 appels/an sur free = **~7/jour**. Chaque appel MCP tool = 1+ appels API. Un workflow typique (list docs, get doc, get assembly, get bom) = 4 appels. On brule le budget en une semaine de dev.

**Mitigation**: Compte Professional minimum, caching aggressif, ou publication App Store (exempt).

### 10.2 Exports asynchrones
STEP/OBJ/SOLIDWORKS sont asynchrones: POST initie, GET poll le statut, 307 redirect pour download. Le MCP tool doit gerer le polling interne.

### 10.3 IDs 24 chars partout
Tout est identifie par des IDs hex 24 chars (did, wid, vid, eid). L'UX depend de `onshape_document_list` + `onshape_document_elements` pour naviguer.

### 10.4 FeatureScript: lambda only
`EvalFeatureScript` n'accepte que des lambda expressions, pas du code FS complet. Utile pour queries geometriques, pas pour creer des features complexes.

### 10.5 307 Redirects
Les exports sync retournent 307. Le client doit re-signer l'Authorization header pour la nouvelle URL.

---

## Sources

- [Onshape Developer Documentation](https://onshape-public.github.io/docs/)
- [Introduction to the Onshape REST API](https://onshape-public.github.io/docs/api-intro/)
- [Authentication](https://onshape-public.github.io/docs/auth/)
- [API Keys](https://onshape-public.github.io/docs/auth/apikeys/)
- [OAuth](https://onshape-public.github.io/docs/auth/oauth/)
- [API Limits](https://onshape-public.github.io/docs/auth/limits/)
- [Response Codes](https://onshape-public.github.io/docs/api-adv/errors/)
- [Glassworks API Explorer](https://cad.onshape.com/glassworks/explorer/)
- [Changelog](https://onshape-public.github.io/docs/changelog/)
- [Go Client README (exhaustive endpoint list)](https://github.com/onshape-public/go-client/blob/master/onshape/README.md)
- [TypeScript Client](https://github.com/onshape-public/onshape-ts-client)
- [onshape-clients (archived)](https://github.com/onshape-public/onshape-clients)
- [hedless/onshape-mcp (13 tools)](https://github.com/hedless/onshape-mcp)
- [BLamy/onshape-mcp](https://github.com/BLamy/onshape-mcp)
- [CADSharp - Rate Limits Tips](https://www.cadsharp.com/blog/onshape-api-rate-limits/)
- [Onshape Pricing](https://www.onshape.com/en/pricing)
- [Onshape Forum - API Limits](https://forum.onshape.com/discussion/29034/new-onshape-api-limits)
- [Part Studios API Guide](https://onshape-public.github.io/docs/api-adv/partstudios/)
- [Assemblies API Guide](https://onshape-public.github.io/docs/api-adv/assemblies/)
- [Import & Export Guide](https://onshape-public.github.io/docs/api-adv/translation/)
- [Configurations Guide](https://onshape-public.github.io/docs/api-adv/configs/)
- [FeatureScript Evaluation](https://onshape-public.github.io/docs/api-adv/fs/)
- [Webhooks](https://onshape-public.github.io/docs/app-dev/webhook/)
