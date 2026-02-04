/**
 * Form Viewer UI for MCP Apps
 *
 * Dynamic form generator from JSON Schema with:
 * - Auto-generated fields from schema
 * - Validation
 * - Submit handling
 *
 * @module lib/std/src/ui/form-viewer
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, VStack } from "../../styled-system/jsx";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import * as Checkbox from "../../components/ui/checkbox";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  title?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
}

interface FormData {
  schema: JsonSchema;
  values?: Record<string, unknown>;
  title?: string;
  submitLabel?: string;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Form Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Styles (minimal)
// ============================================================================

const inputErrorStyle = css({
  borderColor: "red.500!",
  _focus: { borderColor: "red.500!", shadow: "0 0 0 3px token(colors.red.500/20)!" },
});

const textareaStyle = css({
  p: "2",
  border: "1px solid",
  borderColor: "border.default",
  rounded: "md",
  bg: "bg.default",
  color: "fg.default",
  fontSize: "sm",
  outline: "none",
  resize: "vertical",
  _focus: { borderColor: "border.accent", shadow: "0 0 0 3px token(colors.blue.500/20)" },
});

const selectStyle = css({
  p: "2",
  border: "1px solid",
  borderColor: "border.default",
  rounded: "md",
  bg: "bg.default",
  color: "fg.default",
  fontSize: "sm",
  outline: "none",
  cursor: "pointer",
  _focus: { borderColor: "border.accent", shadow: "0 0 0 3px token(colors.blue.500/20)" },
});

// ============================================================================
// Field Components
// ============================================================================

function TextField({
  name,
  schema,
  value,
  onChange,
  error,
}: {
  name: string;
  schema: JsonSchema;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const isTextarea = schema.maxLength && schema.maxLength > 100;

  return (
    <VStack gap="1" alignItems="stretch">
      <Box as="label" fontWeight="medium" color="fg.default" display="flex" flexDirection="column" gap="0.5">
        {schema.title || name}
        {schema.description && (
          <Box as="span" fontSize="xs" color="fg.muted" fontWeight="normal">{schema.description}</Box>
        )}
      </Box>
      {isTextarea ? (
        <textarea
          className={`${textareaStyle} ${error ? inputErrorStyle : ""}`}
          value={value}
          onChange={(e) => onChange((e.target as HTMLTextAreaElement).value)}
          placeholder={schema.default as string || ""}
          rows={4}
        />
      ) : (
        <Input
          type={schema.format === "email" ? "email" : schema.format === "uri" ? "url" : "text"}
          value={value}
          onChange={(e) => onChange((e.target as HTMLInputElement).value)}
          placeholder={schema.default as string || ""}
          minLength={schema.minLength}
          maxLength={schema.maxLength}
          pattern={schema.pattern}
          className={error ? inputErrorStyle : undefined}
        />
      )}
      {error && <Box fontSize="xs" color={{ base: "red.600", _dark: "red.400" }}>{error}</Box>}
    </VStack>
  );
}

function NumberField({
  name,
  schema,
  value,
  onChange,
  error,
}: {
  name: string;
  schema: JsonSchema;
  value: number | "";
  onChange: (value: number | "") => void;
  error?: string;
}) {
  return (
    <VStack gap="1" alignItems="stretch">
      <Box as="label" fontWeight="medium" color="fg.default" display="flex" flexDirection="column" gap="0.5">
        {schema.title || name}
        {schema.description && <Box as="span" fontSize="xs" color="fg.muted" fontWeight="normal">{schema.description}</Box>}
      </Box>
      <Input
        type="number"
        value={value}
        onChange={(e) => {
          const v = (e.target as HTMLInputElement).value;
          onChange(v === "" ? "" : Number(v));
        }}
        min={schema.minimum}
        max={schema.maximum}
        placeholder={schema.default !== undefined ? String(schema.default) : ""}
        className={error ? inputErrorStyle : undefined}
      />
      {error && <Box fontSize="xs" color={{ base: "red.600", _dark: "red.400" }}>{error}</Box>}
    </VStack>
  );
}

function BooleanField({
  name,
  schema,
  value,
  onChange,
}: {
  name: string;
  schema: JsonSchema;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <VStack gap="1" alignItems="stretch">
      <Checkbox.Root
        checked={value}
        onCheckedChange={(details) => onChange(details.checked === true)}
      >
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Label>{schema.title || name}</Checkbox.Label>
        <Checkbox.HiddenInput />
      </Checkbox.Root>
      {schema.description && <Box fontSize="xs" color="fg.muted">{schema.description}</Box>}
    </VStack>
  );
}

function SelectField({
  name,
  schema,
  value,
  onChange,
  error,
}: {
  name: string;
  schema: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}) {
  return (
    <VStack gap="1" alignItems="stretch">
      <Box as="label" fontWeight="medium" color="fg.default" display="flex" flexDirection="column" gap="0.5">
        {schema.title || name}
        {schema.description && <Box as="span" fontSize="xs" color="fg.muted" fontWeight="normal">{schema.description}</Box>}
      </Box>
      <select
        className={`${selectStyle} ${error ? inputErrorStyle : ""}`}
        value={String(value)}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
      >
        <option value="">Select...</option>
        {schema.enum?.map((opt) => (
          <option key={String(opt)} value={String(opt)}>
            {String(opt)}
          </option>
        ))}
      </select>
      {error && <Box fontSize="xs" color={{ base: "red.600", _dark: "red.400" }}>{error}</Box>}
    </VStack>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function FormViewer() {
  const [formData, setFormData] = useState<FormData | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[form-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[form-viewer] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) return;

        const data = JSON.parse(textContent.text) as FormData;
        setFormData(data);
        setValues(data.values || getDefaultValues(data.schema));
        setErrors({});
        setSubmitted(false);
      } catch (e) {
        console.error("[form-viewer] Parse error:", e);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  const handleChange = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    notifyModel("change", { field: name, value });
  }, []);

  const handleSubmit = useCallback((e: Event) => {
    e.preventDefault();
    if (!formData?.schema.properties) return;

    const newErrors: Record<string, string> = {};
    const required = formData.schema.required || [];

    for (const [name, schema] of Object.entries(formData.schema.properties)) {
      const value = values[name];
      if (required.includes(name) && (value === undefined || value === "" || value === null)) {
        newErrors[name] = "This field is required";
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitted(true);
    notifyModel("submit", { values });
  }, [formData, values]);

  if (loading) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" maxW="500px">
        <Box p="10" textAlign="center" color="fg.muted">Loading form...</Box>
      </Box>
    );
  }

  if (!formData?.schema.properties) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" maxW="500px">
        <Box p="10" textAlign="center" color="fg.muted">No form schema provided</Box>
      </Box>
    );
  }

  if (submitted) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" maxW="500px">
        <Flex
          alignItems="center"
          gap="2"
          p="4"
          bg={{ base: "green.50", _dark: "green.950" }}
          color={{ base: "green.700", _dark: "green.300" }}
          rounded="md"
        >
          <Box fontSize="sm" fontWeight="bold">OK</Box>
          Form submitted successfully
        </Flex>
      </Box>
    );
  }

  const properties = formData.schema.properties;
  const required = formData.schema.required || [];

  return (
    <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" maxW="500px">
      {formData.title && (
        <Box as="h2" fontSize="lg" fontWeight="semibold" mb="4" color="fg.default">
          {formData.title}
        </Box>
      )}

      <VStack as="form" onSubmit={handleSubmit} gap="4" alignItems="stretch">
        {Object.entries(properties).map(([name, schema]) => {
          const isRequired = required.includes(name);
          const value = values[name];
          const error = errors[name];

          if (schema.enum) {
            return (
              <SelectField
                key={name}
                name={isRequired ? `${name} *` : name}
                schema={schema}
                value={value}
                onChange={(v) => handleChange(name, v)}
                error={error}
              />
            );
          }

          switch (schema.type) {
            case "boolean":
              return (
                <BooleanField
                  key={name}
                  name={name}
                  schema={schema}
                  value={Boolean(value)}
                  onChange={(v) => handleChange(name, v)}
                />
              );
            case "number":
            case "integer":
              return (
                <NumberField
                  key={name}
                  name={isRequired ? `${name} *` : name}
                  schema={schema}
                  value={value as number | ""}
                  onChange={(v) => handleChange(name, v)}
                  error={error}
                />
              );
            default:
              return (
                <TextField
                  key={name}
                  name={isRequired ? `${name} *` : name}
                  schema={schema}
                  value={String(value || "")}
                  onChange={(v) => handleChange(name, v)}
                  error={error}
                />
              );
          }
        })}

        <Button type="submit" mt="2">
          {formData.submitLabel || "Submit"}
        </Button>
      </VStack>
    </Box>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getDefaultValues(schema: JsonSchema): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (schema.properties) {
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (prop.default !== undefined) {
        values[name] = prop.default;
      } else if (prop.type === "boolean") {
        values[name] = false;
      }
    }
  }
  return values;
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<FormViewer />);
