/**
 * Onshape API Types
 *
 * Type definitions for Onshape REST API responses.
 * Based on Onshape API v10.
 *
 * @module lib/onshape/api/types
 */

/** Standard Onshape pagination response wrapper */
export interface OnshapePaginatedResponse<T> {
  items: T[];
  next?: string;
  previous?: string;
  href?: string;
}

/** Onshape document */
export interface OnshapeDocument {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  modifiedAt: string;
  createdBy: OnshapeUserInfo;
  modifiedBy: OnshapeUserInfo;
  owner: OnshapeOwner;
  defaultWorkspace?: OnshapeWorkspace;
  href: string;
  public: boolean;
  trash: boolean;
  isContainer: boolean;
  canUnshare: boolean;
  permission: string;
  totalWorkspacesUpdating?: number;
  totalWorkspacesScheduledForUpdate?: number;
}

/** Minimal user info in responses */
export interface OnshapeUserInfo {
  id: string;
  name: string;
  href: string;
}

/** Document owner */
export interface OnshapeOwner {
  id: string;
  name: string;
  type: number; // 0=user, 1=company, 2=team
  href: string;
}

/** Workspace reference */
export interface OnshapeWorkspace {
  id: string;
  name: string;
  href: string;
}

/** Version reference */
export interface OnshapeVersion {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  modifiedAt: string;
  creator: OnshapeUserInfo;
  microversion: string;
  parent?: string;
  href: string;
}

/** Element within a document */
export interface OnshapeElement {
  id: string;
  name: string;
  elementType: string; // "PARTSTUDIO", "ASSEMBLY", "DRAWING", "BLOB", "APPLICATION"
  dataType?: string;
  microversionId: string;
}

/** Assembly definition */
export interface OnshapeAssemblyDefinition {
  rootAssembly: OnshapeAssemblyInstance;
  subAssemblies?: OnshapeAssemblyInstance[];
  parts?: OnshapePart[];
}

/** Assembly instance */
export interface OnshapeAssemblyInstance {
  instances: OnshapeInstance[];
  features?: OnshapeFeature[];
  occurrences?: OnshapeOccurrence[];
}

/** Instance in an assembly */
export interface OnshapeInstance {
  id: string;
  name: string;
  type: string; // "Part", "Assembly", etc.
  suppressed: boolean;
  documentId?: string;
  elementId?: string;
  partId?: string;
}

/** Feature (mate, pattern, etc.) */
export interface OnshapeFeature {
  id: string;
  type: string;
  name: string;
  suppressed: boolean;
  message?: Record<string, unknown>;
}

/** Occurrence in assembly */
export interface OnshapeOccurrence {
  path: string[];
  transform: number[];
  fixed: boolean;
  hidden: boolean;
}

/** Part info */
export interface OnshapePart {
  partId: string;
  name: string;
  bodyType: string;
  material?: OnshapeMaterial;
  appearance?: OnshapeAppearance;
  customProperties?: Record<string, string>;
  state?: string;
}

/** Material definition */
export interface OnshapeMaterial {
  id: string;
  displayName: string;
  properties?: OnshapeMaterialProperty[];
}

/** Material property */
export interface OnshapeMaterialProperty {
  name: string;
  value: number;
  units: string;
  description?: string;
}

/** Appearance (color) */
export interface OnshapeAppearance {
  color: { red: number; green: number; blue: number };
  opacity: number;
}

/** Mass properties */
export interface OnshapeMassProperties {
  bodies: Record<string, OnshapeBodyMassProperties>;
  hasMass?: boolean;
  massMissingCount?: number;
}

/** Mass properties for a body */
export interface OnshapeBodyMassProperties {
  mass: [number, number]; // [value, units]
  volume: [number, number];
  centroid: number[];
  inertia: number[];
  hasMass: boolean;
}

/** BOM table from assembly */
export interface OnshapeBOM {
  bomTable: {
    headers: OnshapeBOMHeader[];
    items: OnshapeBOMItem[];
    formatVersion: string;
  };
}

/** BOM header */
export interface OnshapeBOMHeader {
  id: string;
  name: string;
  propertyName?: string;
  visible: boolean;
}

/** BOM item (row) */
export interface OnshapeBOMItem {
  itemSource: {
    documentId: string;
    elementId: string;
    partId?: string;
    wvmType?: string;
    wvmId?: string;
    configuration?: string;
  };
  headerIdToValue: Record<string, { value: string }>;
  children?: OnshapeBOMItem[];
}

/** Comment */
export interface OnshapeComment {
  id: string;
  message: string;
  state: number; // 0=open, 1=resolved
  user: OnshapeUserInfo;
  createdAt: string;
  documentId: string;
  objectId?: string;
  objectType?: number;
}

/** Webhook */
export interface OnshapeWebhook {
  id: string;
  url: string;
  events: string[];
  options?: Record<string, unknown>;
  isEnabled: boolean;
}

/** Translation (import/export) request */
export interface OnshapeTranslation {
  id: string;
  requestState: string; // "ACTIVE", "DONE", "FAILED"
  resultDocumentId?: string;
  resultElementIds?: string[];
  failureReason?: string;
  href: string;
}

/** Metadata property */
export interface OnshapeMetadataProperty {
  propertyId: string;
  name?: string;
  value: unknown;
  valueType: string; // "STRING", "BOOL", "INT", "DOUBLE", "DATE", "ENUM", etc.
  editableInUi?: boolean;
  editableByOwner?: boolean;
}

/** Metadata response */
export interface OnshapeMetadata {
  href: string;
  properties: OnshapeMetadataProperty[];
}

/** Configuration info */
export interface OnshapeConfiguration {
  configurationParameters?: OnshapeConfigParam[];
  currentConfiguration?: OnshapeConfigParam[];
}

/** Configuration parameter */
export interface OnshapeConfigParam {
  parameterId: string;
  parameterName: string;
  parameterType?: string;
  quantityType?: string;
  defaultValue?: unknown;
  rangeAndDefault?: {
    minValue?: number;
    maxValue?: number;
    defaultValue?: number;
  };
  enumValues?: Array<{
    option: string;
    optionName: string;
  }>;
}

/** Variable */
export interface OnshapeVariable {
  name: string;
  type: string;
  value: unknown;
  expression?: string;
  description?: string;
}

/** Release package */
export interface OnshapeReleasePackage {
  id: string;
  name?: string;
  description?: string;
  properties?: OnshapeMetadataProperty[];
  items?: OnshapeReleaseItem[];
  workflow?: {
    state: string;
  };
}

/** Release package item */
export interface OnshapeReleaseItem {
  documentId: string;
  elementId: string;
  partId?: string;
  versionId?: string;
  configuration?: string;
}

/** Revision */
export interface OnshapeRevision {
  id: string;
  partNumber: string;
  revision: string;
  companyId: string;
  documentId: string;
  versionId: string;
  elementId: string;
  partId?: string;
  configuration?: string;
  createdAt: string;
  description?: string;
  releasePackageId?: string;
}

/** Thumbnail info */
export interface OnshapeThumbnail {
  id: string;
  sizes: Array<{
    size: string; // "70x40", "300x170", "600x340"
    href: string;
    mediaType: string;
    renderMode?: string;
  }>;
}

/** Team */
export interface OnshapeTeam {
  id: string;
  name: string;
  description?: string;
  href: string;
}

/** Team member */
export interface OnshapeTeamMember {
  memberId: string;
  memberName: string;
  memberEmail: string;
  memberType: number;
  admin: boolean;
}

/** Session info (current user) */
export interface OnshapeSessionInfo {
  id: string;
  name: string;
  email: string;
  image?: string;
  state?: number;
  href: string;
  isGuest?: boolean;
  isLight?: boolean;
  isAdmin?: boolean;
}

/** Drawing view */
export interface OnshapeDrawingView {
  viewId: string;
  name: string;
  viewType: string;
  computeStatus?: string;
}

/** Translator format */
export interface OnshapeTranslatorFormat {
  name: string;
  translatorName: string;
  couldBeAssembly?: boolean;
  validDestinationFormat?: boolean;
}

/** Bounding box */
export interface OnshapeBoundingBox {
  lowX: number;
  lowY: number;
  lowZ: number;
  highX: number;
  highY: number;
  highZ: number;
}
