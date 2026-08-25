/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ROLE?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_INSTRUCTOR_APP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
