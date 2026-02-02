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

import { render } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

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
    <div class={styles.field}>
      <label class={styles.label}>
        {schema.title || name}
        {schema.description && (
          <span class={styles.description}>{schema.description}</span>
        )}
      </label>
      {isTextarea ? (
        <textarea
          class={css(styles.input, error && styles.inputError)}
          value={value}
          onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
          placeholder={schema.default as string || ""}
          rows={4}
        />
      ) : (
        <input
          type={schema.format === "email" ? "email" : schema.format === "uri" ? "url" : "text"}
          class={css(styles.input, error && styles.inputError)}
          value={value}
          onInput={(e) => onChange((e.target as HTMLInputElement).value)}
          placeholder={schema.default as string || ""}
          minLength={schema.minLength}
          maxLength={schema.maxLength}
          pattern={schema.pattern}
        />
      )}
      {error && <span class={styles.error}>{error}</span>}
    </div>
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
    <div class={styles.field}>
      <label class={styles.label}>
        {schema.title || name}
        {schema.description && <span class={styles.description}>{schema.description}</span>}
      </label>
      <input
        type="number"
        class={css(styles.input, error && styles.inputError)}
        value={value}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          onChange(v === "" ? "" : Number(v));
        }}
        min={schema.minimum}
        max={schema.maximum}
        placeholder={schema.default !== undefined ? String(schema.default) : ""}
      />
      {error && <span class={styles.error}>{error}</span>}
    </div>
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
    <div class={styles.field}>
      <label class={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
          class={styles.checkbox}
        />
        <span>{schema.title || name}</span>
      </label>
      {schema.description && <span class={styles.description}>{schema.description}</span>}
    </div>
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
    <div class={styles.field}>
      <label class={styles.label}>
        {schema.title || name}
        {schema.description && <span class={styles.description}>{schema.description}</span>}
      </label>
      <select
        class={css(styles.input, styles.select, error && styles.inputError)}
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
      {error && <span class={styles.error}>{error}</span>}
    </div>
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

  // Connect to MCP host
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

  // Handle field change
  const handleChange = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    notifyModel("change", { field: name, value });
  }, []);

  // Validate and submit
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

  // Render
  if (loading) {
    return <div class={styles.container}><div class={styles.loadingText}>Loading form...</div></div>;
  }

  if (!formData?.schema.properties) {
    return <div class={styles.container}><div class={styles.empty}>No form schema provided</div></div>;
  }

  if (submitted) {
    return (
      <div class={styles.container}>
        <div class={styles.success}>
          <span class={styles.successIcon}>✓</span>
          Form submitted successfully
        </div>
      </div>
    );
  }

  const properties = formData.schema.properties;
  const required = formData.schema.required || [];

  return (
    <div class={styles.container}>
      {formData.title && <h2 class={styles.title}>{formData.title}</h2>}

      <form onSubmit={handleSubmit} class={styles.form}>
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

        <button type="submit" class={styles.submitBtn}>
          {formData.submitLabel || "Submit"}
        </button>
      </form>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: css({
    p: "4",
    fontFamily: "sans",
    fontSize: "sm",
    color: "fg.default",
    bg: "bg.canvas",
    maxW: "500px",
  }),
  title: css({
    fontSize: "lg",
    fontWeight: "semibold",
    mb: "4",
    color: "fg.default",
  }),
  form: css({
    display: "flex",
    flexDirection: "column",
    gap: "4",
  }),
  field: css({
    display: "flex",
    flexDirection: "column",
    gap: "1",
  }),
  label: css({
    fontWeight: "medium",
    color: "fg.default",
    display: "flex",
    flexDirection: "column",
    gap: "0.5",
  }),
  description: css({
    fontSize: "xs",
    color: "fg.muted",
    fontWeight: "normal",
  }),
  input: css({
    p: "2",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.default",
    color: "fg.default",
    fontSize: "sm",
    outline: "none",
    _focus: { borderColor: "border.accent", shadow: "0 0 0 3px token(colors.blue.500/20)" },
  }),
  inputError: css({
    borderColor: "red.500",
    _focus: { borderColor: "red.500", shadow: "0 0 0 3px token(colors.red.500/20)" },
  }),
  select: css({
    cursor: "pointer",
  }),
  checkbox: css({
    w: "4",
    h: "4",
    cursor: "pointer",
  }),
  checkboxLabel: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
    cursor: "pointer",
  }),
  error: css({
    fontSize: "xs",
    color: "red.600",
    _dark: { color: "red.400" },
  }),
  submitBtn: css({
    mt: "2",
    px: "4",
    py: "2.5",
    bg: "blue.600",
    color: "white",
    fontWeight: "medium",
    rounded: "md",
    border: "none",
    cursor: "pointer",
    _hover: { bg: "blue.700" },
    _active: { bg: "blue.800" },
  }),
  loadingText: css({ p: "10", textAlign: "center", color: "fg.muted" }),
  empty: css({ p: "10", textAlign: "center", color: "fg.muted" }),
  success: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
    p: "4",
    bg: "green.50",
    color: "green.700",
    rounded: "md",
    _dark: { bg: "green.950", color: "green.300" },
  }),
  successIcon: css({
    fontSize: "lg",
  }),
};

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

render(<FormViewer />, document.getElementById("app")!);
