/// <reference types="vite/client" />

/**
 * The client's version, injected by Vite's `define` from `package.json`.
 *
 * A constant rather than an import so the value is inlined at build time and the
 * bundle never reads `package.json` at runtime.
 */
declare const __APP_VERSION__: string;
