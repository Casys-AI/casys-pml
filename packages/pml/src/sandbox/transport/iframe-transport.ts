/**
 * Iframe Transport
 *
 * MessageTransport implementation for browser iframes.
 * Browser-only - uses globalThis for window access.
 *
 * @module sandbox/transport/iframe-transport
 */

import { BaseTransport } from "./base-transport.ts";

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
export class IframeTransport extends BaseTransport {
  private handler?: (message: unknown) => void;
  // deno-lint-ignore no-explicit-any
  private readonly boundHandleMessage: (e: any) => void;

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
    super();

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
   */
  protected doSend(message: unknown): void {
    this.iframe.contentWindow?.postMessage(message, this.targetOrigin);
  }

  /**
   * Register handler for messages from the iframe.
   */
  onMessage(handler: (message: unknown) => void): void {
    this.handler = handler;
  }

  // Note: onError() uses the BaseTransport default implementation which logs
  // a warning. Iframes don't have explicit error events - errors must be
  // detected through RPC timeouts.

  /**
   * Remove event listener and cleanup.
   */
  protected doClose(): void {
    // Browser-only: removeEventListener for "message" events
    (globalThis as unknown as EventTarget).removeEventListener(
      "message",
      this.boundHandleMessage as EventListener,
    );
    this.handler = undefined;
  }
}
