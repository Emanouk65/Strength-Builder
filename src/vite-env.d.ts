/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

// Injected by vite.config.ts `define` at build time.
declare const __BUILD_NUMBER__: string
declare const __BUILD_COMMIT__: string
declare const __BUILD_TIME__: string

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
