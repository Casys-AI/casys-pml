---
title: 'Platform Adapters'
parent: mcp-apps-bridge
---

# Platform Adapters

## Telegram Mini Apps Adapter

### Prerequisites

- A Telegram Bot (created via @BotFather)
- Bot Token
- Mini App URL configured in BotFather (`/newapp` command)

### Adapter Implementation

```typescript
// adapters/telegram.ts

/// <reference types="@anthropic-ai/sdk" />

declare global {
  interface Window {
    Telegram: {
      WebApp: TelegramWebApp;
    };
  }
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: TelegramInitData;
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: TelegramThemeParams;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  safeAreaInset: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset: { top: number; bottom: number; left: number; right: number };
  MainButton: TelegramMainButton;
  BackButton: TelegramBackButton;
  ready(): void;
  expand(): void;
  close(): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  requestFullscreen(): void;
  exitFullscreen(): void;
  onEvent(eventType: string, handler: () => void): void;
  offEvent(eventType: string, handler: () => void): void;
}

export class TelegramAdapter implements PlatformAdapter {
  readonly name = 'telegram';
  private tg: TelegramWebApp;
  private lifecycleHandlers: Array<(event: LifecycleEvent) => void> = [];

  constructor() {
    if (!window.Telegram?.WebApp) {
      throw new Error(
        '[TelegramAdapter] Telegram.WebApp SDK not found. ' +
        'This adapter must run inside a Telegram Mini App webview. ' +
        'Ensure telegram-web-app.js is loaded.'
      );
    }
    this.tg = window.Telegram.WebApp;
  }

  async initialize(): Promise<HostContext> {
    this.tg.ready();
    this.tg.expand();

    // Register platform event listeners
    this.tg.onEvent('themeChanged', () => {
      this.emit({ type: 'theme-changed' });
    });

    this.tg.onEvent('viewportChanged', () => {
      this.emit({ type: 'viewport-changed' });
    });

    this.tg.onEvent('activated', () => {
      this.emit({ type: 'activated' });
    });

    this.tg.onEvent('deactivated', () => {
      this.emit({ type: 'deactivated' });
    });

    return this.buildHostContext();
  }

  getTheme(): 'light' | 'dark' {
    return this.tg.colorScheme;
  }

  getContainerDimensions(): ContainerDimensions {
    return {
      width: window.innerWidth,
      maxHeight: this.tg.viewportStableHeight,
    };
  }

  onLifecycleEvent(handler: (event: LifecycleEvent) => void): void {
    this.lifecycleHandlers.push(handler);
  }

  async openLink(url: string): Promise<void> {
    this.tg.openLink(url);
  }

  getAuthData(): Record<string, unknown> {
    return {
      platform: 'telegram',
      initData: this.tg.initData,
      initDataUnsafe: this.tg.initDataUnsafe,
    };
  }

  private buildHostContext(): HostContext {
    const tp = this.tg.themeParams;
    return {
      theme: this.tg.colorScheme,
      styles: {
        variables: {
          '--color-background-primary': tp.bg_color ?? '',
          '--color-background-secondary': tp.secondary_bg_color ?? '',
          '--color-text-primary': tp.text_color ?? '',
          '--color-text-secondary': tp.subtitle_text_color ?? '',
          '--color-border-primary': tp.section_separator_color ?? '',
          '--color-ring-primary': tp.accent_text_color ?? '',
        },
      },
      containerDimensions: this.getContainerDimensions(),
      platform: 'mobile',
      locale: navigator.language,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      safeAreaInsets: {
        top: this.tg.safeAreaInset?.top ?? 0,
        right: this.tg.safeAreaInset?.right ?? 0,
        bottom: this.tg.safeAreaInset?.bottom ?? 0,
        left: this.tg.safeAreaInset?.left ?? 0,
      },
    };
  }

  private emit(event: LifecycleEvent): void {
    for (const handler of this.lifecycleHandlers) {
      handler(event);
    }
  }
}
```

### Telegram-Specific Features

| Feature | MCP Equivalent | Implementation |
|---------|---------------|---------------|
| MainButton | No direct equivalent | Expose as custom capability, fire notification on click |
| BackButton | No direct equivalent | Expose as custom capability |
| HapticFeedback | No equivalent | Pass through to platform |
| CloudStorage | No equivalent | Not bridged (app can use directly) |
| QR Scanner | No equivalent | Not bridged (app can use directly) |
| Fullscreen | `ui/request-display-mode` | Map fullscreen mode to `requestFullscreen()` |

### Telegram Bot Setup

The resource server needs a companion Telegram Bot configuration:

```typescript
interface TelegramBotConfig {
  /** Bot token from @BotFather */
  botToken: string;

  /** Mini App URL (points to resource server) */
  webAppUrl: string;

  /** Optional: menu button configuration */
  menuButton?: {
    text: string;
    url: string;
  };
}
```

## LINE LIFF Adapter

### Prerequisites

- LINE Developers account
- LIFF app registered in LINE Developers Console
- LIFF ID

### Adapter Implementation

```typescript
// adapters/line.ts

import liff from '@line/liff';

export class LineLiffAdapter implements PlatformAdapter {
  readonly name = 'line';
  private lifecycleHandlers: Array<(event: LifecycleEvent) => void> = [];
  private liffId: string;

  constructor(liffId: string) {
    if (!liffId) {
      throw new Error(
        '[LineLiffAdapter] LIFF ID is required. ' +
        'Get it from the LINE Developers Console.'
      );
    }
    this.liffId = liffId;
  }

  async initialize(): Promise<HostContext> {
    await liff.init({ liffId: this.liffId });

    if (!liff.isLoggedIn()) {
      liff.login();
      // This will redirect, so we won't reach here
      throw new Error('[LineLiffAdapter] Redirecting to LINE login.');
    }

    // Listen for page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.emit({ type: 'deactivated' });
      } else {
        this.emit({ type: 'activated' });
      }
    });

    // Listen for beforeunload
    window.addEventListener('beforeunload', () => {
      this.emit({ type: 'teardown', reason: 'page-unload' });
    });

    return this.buildHostContext();
  }

  getTheme(): 'light' | 'dark' {
    // LIFF doesn't expose theme — default to light
    return 'light';
  }

  getContainerDimensions(): ContainerDimensions {
    return {
      width: window.innerWidth,
      maxHeight: window.innerHeight,
    };
  }

  onLifecycleEvent(handler: (event: LifecycleEvent) => void): void {
    this.lifecycleHandlers.push(handler);
  }

  async openLink(url: string): Promise<void> {
    liff.openWindow({ url, external: true });
  }

  getAuthData(): Record<string, unknown> {
    return {
      platform: 'line',
      accessToken: liff.getAccessToken(),
      userId: liff.getContext()?.userId,
      os: liff.getOS(),
    };
  }

  private buildHostContext(): HostContext {
    const os = liff.getOS();
    return {
      theme: 'light',
      containerDimensions: this.getContainerDimensions(),
      platform: (os === 'ios' || os === 'android') ? 'mobile' : 'web',
      locale: liff.getLanguage(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  private emit(event: LifecycleEvent): void {
    for (const handler of this.lifecycleHandlers) {
      handler(event);
    }
  }
}
```

### LINE-Specific Considerations

| Aspect | Detail |
|--------|--------|
| Theme | LIFF doesn't expose theme. Always returns 'light'. |
| `sendMessages()` | Fragile — fails after reload from recently-used. Not recommended for bridge. |
| External browser | LIFF features limited. Bridge should detect and warn. |
| Token expiry | Access tokens expire. Resource server should handle refresh. |
| LIFF size | `full`, `tall`, `compact` — affects viewport. |

### LIFF App Configuration

```typescript
interface LineLiffConfig {
  /** LIFF ID from LINE Developers Console */
  liffId: string;

  /** LIFF size preference */
  size?: 'full' | 'tall' | 'compact';

  /** Endpoint URL (must match LINE Developers Console) */
  endpointUrl: string;
}
```

## Adding a New Platform Adapter

To add support for a new messaging platform:

1. Create `adapters/<platform>.ts`
2. Implement `PlatformAdapter` interface
3. Map platform init to `HostContext`
4. Map platform events to `LifecycleEvent`
5. Handle `openLink` via platform SDK
6. Implement `getAuthData` for platform auth
7. Add platform to resource server's HTML injection logic
8. Add platform detection in `bridge.js`

### Adapter Checklist

```markdown
- [ ] Platform SDK detection (fail-fast if not available)
- [ ] Initialize returns valid HostContext
- [ ] Theme mapping (or default)
- [ ] Viewport/container dimensions mapping
- [ ] Safe area insets (if platform provides)
- [ ] Lifecycle events (theme, viewport, activate, deactivate, teardown)
- [ ] Open link capability
- [ ] Auth data extraction
- [ ] Platform-specific features documented
```
