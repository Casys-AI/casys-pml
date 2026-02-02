/**
 * Iframe Transport
 *
 * MessageTransport implementation for browser iframes.
 * Browser-only - uses globalThis for window access.
 *
 * @module sandbox/transport/iframe-transport
 */

import type { MessageTransport } from "./types.ts";

/**
 * Browser iframe element interface (subset of HTMLIFrameElement).
 * Used for Deno compatibility - browser-only code.
 */
interface IframeElement {
  contentWindow: {
    postMessage(message: unknown, targetOrigin: string): void;
  } | null;
}

/**
 * MessageTransport implementation for browser iframes.
 *
 * Wraps iframe postMessage communication to provide the MessageTransport interface.
 * Filters messages to only accept those from the target iframe's contentWindow.
 *
 * @example
 * ```ts
 * // In browser context
 * const iframe = document.getElementById('child-ui') as HTMLIFrameElement;
 * const transport = new IframeTransport(iframe);
 * const bridge = new RpcBridge(transport, onRpc, 30000, adapter);
 * ```
 */
export class IframeTransport implements MessageTransport {
  private handler?: (message: unknown) => void;
  // deno-lint-ignore no-explicit-any
  private readonly boundHandleMessage: (e: any) => void;
  private isClosed = false;

  /**
   * Create an IframeTransport for the given iframe.
   *
   * @param iframe - Target iframe element (HTMLIFrameElement in browser)
   * @param targetOrigin - Origin for postMessage (default: "*" for any origin)
   */
  constructor(
    private readonly iframe: IframeElement,
    private readonly targetOrigin: string = "*",
  ) {
    // Security warning for wildcard origin
    if (targetOrigin === "*") {
      console.warn(
        "[IframeTransport] Using targetOrigin='*' allows messages to any origin. " +
          "Consider specifying an explicit origin for production use.",
      );
    }

    this.boundHandleMessage = this.handleMessage.bind(this);
    // Browser-only: addEventListener for "message" events
    (globalThis as unknown as EventTarget).addEventListener(
      "message",
      this.boundHandleMessage as EventListener,
    );
  }

  /**
   * Handle incoming window messages.
   * Filters to only accept messages from our iframe's contentWindow.
   */
  // deno-lint-ignore no-explicit-any
  private handleMessage(e: any): void {
    if (this.isClosed) return;

    // SECURITY: Only accept messages from our iframe
    if (e.source !== this.iframe.contentWindow) return;

    // SECURITY: Validate origin when specified (additional protection)
    if (this.targetOrigin !== "*" && e.origin !== this.targetOrigin) return;

    this.handler?.(e.data);
  }

  /**
   * Send a message to the iframe via postMessage.
   *
   * @throws Error if transport has been closed
   */
  send(message: unknown): void {
    if (this.isClosed) {
      throw new Error("IframeTransport has been closed");
    }
    this.iframe.contentWindow?.postMessage(message, this.targetOrigin);
  }

  /**
   * Register handler for messages from the iframe.
   */
  onMessage(handler: (message: unknown) => void): void {
    this.handler = handler;
  }

  /**
   * Iframes don't have explicit error events.
   * This method is a no-op for compatibility.
   */
  onError(_handler: (error: Error) => void): void {
    // Iframes don't have explicit error events like Workers
    // Connection errors would need to be detected through timeouts
  }

  /**
   * Remove event listener and cleanup.
   */
  close(): void {
    if (this.isClosed) return;

    this.isClosed = true;
    // Browser-only: removeEventListener for "message" events
    (globalThis as unknown as EventTarget).removeEventListener(
      "message",
      this.boundHandleMessage as EventListener,
    );
    this.handler = undefined;
  }

  /**
   * Check if transport has been closed.
   */
  get closed(): boolean {
    return this.isClosed;
  }
}
