/// <reference types="vite/client" />

/** The package version, substituted at build time (see `vite.config.ts`). */
declare const __WEBUI_VERSION__: string;

/** 閲覧 site の host suffix。空なら閲覧 site が無い配り方 (DR-0005 FV-Q7)。 */
declare const __VIEW_SITE__: string;
