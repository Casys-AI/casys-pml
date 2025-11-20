/**
 * Deno Sandbox Executor - Production Implementation
 *
 * Provides secure code execution in an isolated Deno subprocess environment.
 * Features:
 * - Strict permission whitelisting (read-only access to temp file)
 * - Timeout enforcement (default 30s, configurable)
 * - Memory limits (default 512MB heap, configurable)
 * - Comprehensive error capturing and sanitization
 * - JSON-only result serialization
 * - Security event logging
 * - Performance metrics tracking
 *
 * Security Model:
 * - Explicit deny flags for write, net, run, ffi, env
 * - Whitelist-only read access (temp file + optional paths)
 * - No prompt mode to prevent subprocess hangs
 * - Path sanitization in error messages
 * - Automatic temp file cleanup
 *
 * @module sandbox/executor
 */

import type {
  SandboxConfig,
  ExecutionResult,
  StructuredError,
} from "./types.ts";
import { getLogger } from "../telemetry/logger.ts";

const logger = getLogger("default");

/**
 * Default configuration values
 */
const DEFAULTS = {
  TIMEOUT_MS: 30000, // 30 seconds
  MEMORY_LIMIT_MB: 512, // 512MB heap
  ALLOWED_READ_PATHS: [] as string[],
} as const;

/**
 * Marker string used to identify results in subprocess output
 */
const RESULT_MARKER = "__SANDBOX_RESULT__:";

/**
 * Deno Sandbox Executor
 *
 * Executes user-provided TypeScript code in an isolated Deno subprocess
 * with strict security controls and resource limits.
 *
 * @example
 * ```typescript
 * const sandbox = new DenoSandboxExecutor({ timeout: 5000, memoryLimit: 256 });
 * const result = await sandbox.execute("return 1 + 1");
 * console.log(result.result); // 2
 * ```
 */
export class DenoSandboxExecutor {
  private config: Required<SandboxConfig>;

  /**
   * Create a new sandbox executor
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: SandboxConfig) {
    this.config = {
      timeout: config?.timeout ?? DEFAULTS.TIMEOUT_MS,
      memoryLimit: config?.memoryLimit ?? DEFAULTS.MEMORY_LIMIT_MB,
      allowedReadPaths: config?.allowedReadPaths ?? DEFAULTS.ALLOWED_READ_PATHS,
    };

    logger.debug("Sandbox executor initialized", {
      timeout: this.config.timeout,
      memoryLimit: this.config.memoryLimit,
      allowedPathsCount: this.config.allowedReadPaths.length,
    });
  }

  /**
   * Execute TypeScript code in the sandbox
   *
   * The code is wrapped in an async IIFE and executed in a fresh Deno subprocess.
   * All results must be JSON-serializable.
   *
   * @param code - TypeScript code to execute
   * @param context - Optional context object to inject as variables into sandbox scope
   * @returns Execution result with output or structured error
   *
   * @throws Never throws - all errors are captured in ExecutionResult
   */
  async execute(code: string, context?: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = performance.now();
    let tempFile: string | null = null;

    try {
      logger.debug("Starting sandbox execution", {
        codeLength: code.length,
        contextKeys: context ? Object.keys(context) : [],
      });

      // 1. Wrap user code in execution wrapper with optional context injection
      const wrappedCode = this.wrapCode(code, context);

      // 2. Build Deno command with strict permissions
      const { command, tempFilePath } = this.buildCommand(wrappedCode);
      tempFile = tempFilePath;

      // 3. Execute with timeout enforcement
      const output = await this.executeWithTimeout(command);

      const executionTimeMs = performance.now() - startTime;

      // 4. Parse and return result
      const result: ExecutionResult = {
        success: true,
        result: output.result,
        executionTimeMs,
        memoryUsedMb: output.memoryUsedMb,
      };

      logger.info("Sandbox execution succeeded", {
        executionTimeMs: result.executionTimeMs.toFixed(2),
        memoryUsedMb: result.memoryUsedMb,
      });

      return result;
    } catch (error) {
      const executionTimeMs = performance.now() - startTime;
      const structuredError = this.parseError(error);

      // Log security-relevant errors
      if (structuredError.type === "PermissionError") {
        logger.warn("Sandbox permission violation detected", {
          errorType: structuredError.type,
          message: structuredError.message,
          executionTimeMs,
        });
      } else {
        logger.debug("Sandbox execution failed", {
          errorType: structuredError.type,
          message: structuredError.message,
          executionTimeMs,
        });
      }

      return {
        success: false,
        error: structuredError,
        executionTimeMs,
      };
    } finally {
      // Cleanup temp file (critical for preventing disk exhaustion)
      if (tempFile) {
        try {
          Deno.removeSync(tempFile);
          logger.debug("Temp file cleaned up", { path: this.sanitizePath(tempFile) });
        } catch (cleanupError) {
          logger.error("Failed to cleanup temp file", {
            path: this.sanitizePath(tempFile),
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          });
        }
      }
    }
  }

  /**
   * Wrap user code in execution wrapper
   *
   * The wrapper:
   * - Injects context variables into scope (if provided)
   * - Wraps code in async IIFE to support top-level await
   * - Captures the return value
   * - Serializes result to JSON
   * - Captures and serializes errors
   * - Outputs result with marker for parsing
   *
   * @param code - User code to wrap
   * @param context - Optional context object to inject as variables
   * @returns Wrapped code ready for execution
   */
  private wrapCode(code: string, context?: Record<string, unknown>): string {
    // Build context injection code
    const contextInjection = context
      ? Object.entries(context)
          .map(([key, value]) => {
            // Validate variable name is safe (alphanumeric + underscore only)
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
              throw new Error(`Invalid context variable name: ${key}`);
            }
            // Serialize value to JSON and inject as const
            return `const ${key} = ${JSON.stringify(value)};`;
          })
          .join('\n    ')
      : '';

    return `
(async () => {
  try {
    // Execute user code in async context with injected context
    const __result = await (async () => {
      ${contextInjection ? contextInjection + '\n' : ''}${code}
    })();

    // Serialize result (must be JSON-compatible)
    // Convert undefined to null for proper JSON serialization
    const __serialized = JSON.stringify({
      success: true,
      result: __result === undefined ? null : __result,
    });

    console.log("${RESULT_MARKER}" + __serialized);
  } catch (error) {
    // Capture execution error
    const __serialized = JSON.stringify({
      success: false,
      error: {
        type: error?.constructor?.name || "Error",
        message: error?.message || String(error),
        stack: error?.stack,
      },
    });

    console.log("${RESULT_MARKER}" + __serialized);
  }
})();
`;
  }

  /**
   * Build Deno command with strict permission controls
   *
   * Security model:
   * - Creates temp file for code execution (required for full permission control)
   * - Whitelist-only read access: temp file + optional user paths
   * - Explicit deny flags: write, net, run, ffi, env
   * - Memory limit via V8 flags
   * - No prompt mode to prevent hangs
   *
   * @param code - Wrapped code to execute
   * @returns Command object and temp file path
   */
  private buildCommand(code: string): { command: Deno.Command; tempFilePath: string } {
    // Create secure temp file
    const tempFile = Deno.makeTempFileSync({ prefix: "sandbox-", suffix: ".ts" });
    Deno.writeTextFileSync(tempFile, code);

    logger.debug("Created temp file for sandbox execution", {
      path: this.sanitizePath(tempFile),
    });

    // Build permission arguments
    const args: string[] = ["run"];

    // Memory limit (V8 heap size)
    args.push(`--v8-flags=--max-old-space-size=${this.config.memoryLimit}`);

    // Read permissions (whitelist only)
    if (this.config.allowedReadPaths.length > 0) {
      // Allow temp file + user-specified paths
      const readPaths = [tempFile, ...this.config.allowedReadPaths].join(",");
      args.push(`--allow-read=${readPaths}`);
    } else {
      // Only allow reading the temp file itself
      args.push(`--allow-read=${tempFile}`);
    }

    // Explicit deny flags (defense in depth)
    args.push("--deny-write"); // No write access anywhere
    args.push("--deny-net"); // No network access
    args.push("--deny-run"); // No subprocess spawning
    args.push("--deny-ffi"); // No FFI/native code
    args.push("--deny-env"); // No environment variable access

    // Prevent interactive prompts (would hang subprocess)
    args.push("--no-prompt");

    // Add temp file path
    args.push(tempFile);

    // Create command
    const command = new Deno.Command("deno", {
      args,
      stdout: "piped",
      stderr: "piped",
    });

    logger.debug("Built sandbox command", {
      args: args.slice(0, -1), // Log args without temp file path
    });

    return { command, tempFilePath: tempFile };
  }

  /**
   * Execute command with timeout enforcement
   *
   * Uses AbortController to enforce timeout. Process is killed if timeout
   * is exceeded.
   *
   * @param command - Deno command to execute
   * @returns Parsed execution result
   * @throws Error if execution fails or times out
   */
  private async executeWithTimeout(
    command: Deno.Command,
  ): Promise<{ result: unknown; memoryUsedMb?: number }> {
    // Create abort controller for timeout
    const controller = new AbortController();
    let process: Deno.ChildProcess | null = null;

    // Setup timeout
    const timeoutId = setTimeout(() => {
      logger.warn("Sandbox execution timeout, killing process", {
        timeoutMs: this.config.timeout,
      });
      controller.abort();
      // Forcefully kill the process if it's still running
      if (process) {
        try {
          process.kill("SIGKILL");
        } catch {
          // Process might already be dead
        }
      }
    }, this.config.timeout);

    try {
      // Spawn subprocess
      process = command.spawn();

      // Wait for completion
      const { stdout, stderr, success, code } = await process.output();

      clearTimeout(timeoutId);

      // Check if aborted (timeout)
      if (controller.signal.aborted) {
        throw new Error("TIMEOUT");
      }

      // Decode output
      const stdoutText = new TextDecoder().decode(stdout);
      const stderrText = new TextDecoder().decode(stderr);

      logger.debug("Subprocess completed", {
        success,
        code,
        stdoutLength: stdoutText.length,
        stderrLength: stderrText.length,
      });

      // Check for errors in stderr (permission errors, runtime errors)
      if (!success || stderrText.length > 0) {
        throw new Error(`SUBPROCESS_ERROR: ${stderrText || "Non-zero exit code"}`);
      }

      // Parse result from stdout
      return this.parseOutput(stdoutText);
    } catch (error) {
      clearTimeout(timeoutId);

      // Check if timeout occurred
      if (controller.signal.aborted) {
        throw new Error("TIMEOUT");
      }

      throw error;
    }
  }

  /**
   * Parse subprocess output to extract result
   *
   * Looks for the result marker in stdout and parses the JSON payload.
   *
   * @param stdout - Raw stdout from subprocess
   * @returns Parsed result
   * @throws Error if result cannot be parsed or user code failed
   */
  private parseOutput(stdout: string): { result: unknown; memoryUsedMb?: number } {
    // Find result marker
    const resultMatch = stdout.match(new RegExp(`${RESULT_MARKER}(.*)`));

    if (!resultMatch) {
      throw new Error("PARSE_ERROR: No result marker found in output");
    }

    try {
      // Parse JSON result
      const resultJson = JSON.parse(resultMatch[1]);

      // Check if user code threw an error
      if (!resultJson.success) {
        const error = resultJson.error;
        throw new Error(`USER_ERROR: ${JSON.stringify(error)}`);
      }

      return {
        result: resultJson.result,
      };
    } catch (parseError) {
      // JSON parse failed
      if (parseError instanceof Error && parseError.message.startsWith("USER_ERROR")) {
        throw parseError; // Re-throw user errors
      }
      throw new Error(`PARSE_ERROR: Failed to parse result JSON: ${parseError}`);
    }
  }

  /**
   * Parse error into structured format
   *
   * Categorizes errors by type and sanitizes error messages to prevent
   * information leakage (e.g., host file paths).
   *
   * @param error - Raw error from execution
   * @returns Structured error object
   */
  private parseError(error: unknown): StructuredError {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Timeout error
    if (errorMessage.includes("TIMEOUT")) {
      return {
        type: "TimeoutError",
        message: `Execution exceeded timeout of ${this.config.timeout}ms`,
      };
    }

    // Memory error (OOM)
    if (
      errorMessage.toLowerCase().includes("out of memory") ||
      errorMessage.toLowerCase().includes("heap limit") ||
      errorMessage.includes("max-old-space-size")
    ) {
      return {
        type: "MemoryError",
        message: `Memory limit of ${this.config.memoryLimit}MB exceeded`,
      };
    }

    // Permission error (security event)
    if (
      errorMessage.includes("PermissionDenied") ||
      errorMessage.includes("NotCapable") ||
      errorMessage.includes("Requires") ||
      errorMessage.includes("--allow-") ||
      errorMessage.toLowerCase().includes("permission")
    ) {
      return {
        type: "PermissionError",
        message: this.sanitizeErrorMessage(errorMessage),
      };
    }

    // User code error (syntax or runtime)
    if (errorMessage.includes("USER_ERROR")) {
      try {
        const userError = JSON.parse(errorMessage.replace("USER_ERROR: ", ""));
        return {
          type: userError.type === "SyntaxError" ? "SyntaxError" : "RuntimeError",
          message: userError.message,
          stack: this.sanitizeStackTrace(userError.stack),
        };
      } catch {
        // Failed to parse user error
        return {
          type: "RuntimeError",
          message: this.sanitizeErrorMessage(errorMessage),
        };
      }
    }

    // Subprocess error
    if (errorMessage.includes("SUBPROCESS_ERROR")) {
      const cleanMessage = errorMessage.replace("SUBPROCESS_ERROR: ", "");

      // Check if it's actually a syntax error from Deno
      if (
        cleanMessage.includes("SyntaxError") ||
        cleanMessage.includes("Unexpected token") ||
        cleanMessage.includes("Unexpected identifier") ||
        cleanMessage.includes("Unexpected end of input") ||
        cleanMessage.includes("Invalid or unexpected token")
      ) {
        return {
          type: "SyntaxError",
          message: this.sanitizeErrorMessage(cleanMessage),
        };
      }

      return {
        type: "RuntimeError",
        message: this.sanitizeErrorMessage(cleanMessage),
      };
    }

    // Generic runtime error
    return {
      type: "RuntimeError",
      message: this.sanitizeErrorMessage(errorMessage),
      stack: error instanceof Error ? this.sanitizeStackTrace(error.stack) : undefined,
    };
  }

  /**
   * Sanitize error message to remove host file paths
   *
   * Replaces absolute paths with generic markers to prevent information leakage.
   *
   * @param message - Raw error message
   * @returns Sanitized error message
   */
  private sanitizeErrorMessage(message: string): string {
    // Remove absolute paths (Unix and Windows)
    return message
      .replace(/\/[^\s]+\/sandbox-[^\s]+\.ts/g, "<temp-file>")
      .replace(/[A-Z]:\\[^\s]+\\sandbox-[^\s]+\.ts/g, "<temp-file>")
      .replace(/\/home\/[^\/]+/g, "<home>")
      .replace(/[A-Z]:\\Users\\[^\\]+/g, "<home>");
  }

  /**
   * Sanitize stack trace to remove host file paths
   *
   * @param stack - Raw stack trace
   * @returns Sanitized stack trace
   */
  private sanitizeStackTrace(stack?: string): string | undefined {
    if (!stack) return undefined;
    return this.sanitizeErrorMessage(stack);
  }

  /**
   * Sanitize file path for logging (remove sensitive parts)
   *
   * @param path - File path
   * @returns Sanitized path
   */
  private sanitizePath(path: string): string {
    return path.replace(/\/home\/[^\/]+/g, "~").replace(/[A-Z]:\\Users\\[^\\]+/g, "~");
  }
}
