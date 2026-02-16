/**
 * SysON Model Tools
 *
 * SysML model/document management — stereotypes, domains, root objects.
 *
 * @module lib/syson/tools/model
 */

import type { SysonTool } from "./types.ts";
import { getSysonClient } from "../api/graphql-client.ts";
import {
  GET_CHILD_CREATION_DESCRIPTIONS,
  GET_DOMAINS,
  GET_ROOT_OBJECT_CREATION_DESCRIPTIONS,
  GET_STEREOTYPES,
} from "../api/queries.ts";
import { CREATE_DOCUMENT, CREATE_ROOT_OBJECT } from "../api/mutations.ts";
import type {
  CreateDocumentResult,
  CreateRootObjectResult,
  GetChildCreationDescriptionsResult,
  GetDomainsResult,
  GetRootObjectCreationDescriptionsResult,
  GetStereotypesResult,
} from "../api/types.ts";

/**
 * Extract mutation result, throwing on ErrorPayload.
 */
function unwrapMutation<T extends object>(
  result: T,
  operationName: string,
): Record<string, unknown> {
  const payload = Object.values(result)[0] as Record<string, unknown>;
  if (payload?.__typename === "ErrorPayload") {
    throw new Error(
      `[lib/syson] ${operationName} failed: ${(payload as { message: string }).message}`,
    );
  }
  return payload;
}

export const modelTools: SysonTool[] = [
  {
    name: "syson_model_stereotypes",
    description:
      "List available stereotypes (document types) for a project. " +
      "Needed to create a new SysML document via syson_model_create.",
    category: "model",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID (from syson_project_get or syson_project_create)",
        },
      },
      required: ["editing_context_id"],
    },
    handler: async ({ editing_context_id }) => {
      const client = getSysonClient();
      const data = await client.query<GetStereotypesResult>(GET_STEREOTYPES, {
        editingContextId: editing_context_id as string,
      });

      return {
        stereotypes: data.viewer.editingContext.stereotypes.edges.map((e) => ({
          id: e.node.id,
          label: e.node.label,
        })),
      };
    },
  },

  {
    name: "syson_model_child_types",
    description:
      "List the types of child elements that can be created under a given container. " +
      'Returns labels like "New PartUsage", "New RequirementUsage", "New Package", etc.',
    category: "model",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID",
        },
        container_id: {
          type: "string",
          description: "ID of the parent container element",
        },
      },
      required: ["editing_context_id", "container_id"],
    },
    handler: async ({ editing_context_id, container_id }) => {
      const client = getSysonClient();
      const data = await client.query<GetChildCreationDescriptionsResult>(
        GET_CHILD_CREATION_DESCRIPTIONS,
        {
          editingContextId: editing_context_id as string,
          containerId: container_id as string,
        },
      );

      return {
        childTypes: data.viewer.editingContext.childCreationDescriptions.map((d) => ({
          id: d.id,
          label: d.label,
          iconURL: d.iconURL ?? null,
        })),
      };
    },
  },

  {
    name: "syson_model_create",
    description:
      "Create a new SysML document in a project. " +
      "If no stereotype is specified, auto-detects the SysML v2 stereotype. " +
      "Optionally creates a root Package.",
    category: "model",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID",
        },
        name: {
          type: "string",
          description: "Document name. Default: 'SysML Model'",
        },
        stereotype_id: {
          type: "string",
          description: "Stereotype ID (from syson_model_stereotypes). Auto-detected if omitted.",
        },
        create_root_package: {
          type: "boolean",
          description: "Create a root Package in the document. Default: true",
        },
        root_package_name: {
          type: "string",
          description: "Name for the root package. Default: same as document name",
        },
      },
      required: ["editing_context_id"],
    },
    handler: async ({
      editing_context_id,
      name,
      stereotype_id,
      create_root_package,
      root_package_name: _root_package_name,
    }) => {
      const client = getSysonClient();
      const ecId = editing_context_id as string;
      const docName = (name as string) ?? "SysML Model";
      const createRoot = (create_root_package as boolean) ?? true;

      // Auto-detect stereotype if not provided
      let resolvedStereotypeId = stereotype_id as string | undefined;
      if (!resolvedStereotypeId) {
        const stereotypes = await client.query<GetStereotypesResult>(GET_STEREOTYPES, {
          editingContextId: ecId,
        });
        const sysmlStereotype = stereotypes.viewer.editingContext.stereotypes.edges.find(
          (e) =>
            e.node.label.toLowerCase().includes("sysml") ||
            e.node.label.toLowerCase().includes("syson"),
        );
        if (!sysmlStereotype) {
          throw new Error(
            "[lib/syson] syson_model_create: No SysML stereotype found. " +
              "Use syson_model_stereotypes to list available stereotypes and provide stereotype_id.",
          );
        }
        resolvedStereotypeId = sysmlStereotype.node.id;
      }

      // Create document
      const docMutationId = crypto.randomUUID();
      const docResult = await client.mutate<CreateDocumentResult>(CREATE_DOCUMENT, {
        input: {
          id: docMutationId,
          editingContextId: ecId,
          stereotypeId: resolvedStereotypeId,
          name: docName,
        },
      });

      const docPayload = unwrapMutation(docResult, "createDocument");
      const document = (docPayload as { document: { id: string; name: string; kind: string } })
        .document;

      const result: Record<string, unknown> = {
        documentId: document.id,
        documentName: document.name,
        documentKind: document.kind,
        rootPackageId: null,
      };

      // Create root package if requested
      if (createRoot) {
        // Get domains to find "sysml"
        const domains = await client.query<GetDomainsResult>(GET_DOMAINS, {
          editingContextId: ecId,
          rootDomainsOnly: true,
        });
        const sysmlDomain = domains.viewer.editingContext.domains.find(
          (d) =>
            d.id.toLowerCase().includes("sysml") ||
            d.label.toLowerCase().includes("sysml"),
        );

        if (sysmlDomain) {
          // Get root object creation descriptions for the domain
          const rootDescs = await client.query<GetRootObjectCreationDescriptionsResult>(
            GET_ROOT_OBJECT_CREATION_DESCRIPTIONS,
            { editingContextId: ecId, domainId: sysmlDomain.id, suggested: true },
          );

          const packageDesc = rootDescs.viewer.editingContext.rootObjectCreationDescriptions.find(
            (d) => d.label.toLowerCase().includes("package"),
          );

          if (packageDesc) {
            const rootMutationId = crypto.randomUUID();
            const rootResult = await client.mutate<CreateRootObjectResult>(CREATE_ROOT_OBJECT, {
              input: {
                id: rootMutationId,
                editingContextId: ecId,
                documentId: document.id,
                domainId: sysmlDomain.id,
                rootObjectCreationDescriptionId: packageDesc.id,
              },
            });

            const rootPayload = unwrapMutation(rootResult, "createRootObject");
            const rootObj =
              (rootPayload as { object: { id: string; kind: string; label: string } }).object;
            result.rootPackageId = rootObj.id;
            result.rootPackageLabel = rootObj.label;
          }
        }
      }

      return result;
    },
  },

  {
    name: "syson_model_domains",
    description: "List available metamodel domains for a project (e.g. 'sysml').",
    category: "model",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID",
        },
      },
      required: ["editing_context_id"],
    },
    handler: async ({ editing_context_id }) => {
      const client = getSysonClient();
      const data = await client.query<GetDomainsResult>(GET_DOMAINS, {
        editingContextId: editing_context_id as string,
        rootDomainsOnly: true,
      });

      return {
        domains: data.viewer.editingContext.domains.map((d) => ({
          id: d.id,
          label: d.label,
        })),
      };
    },
  },
];
