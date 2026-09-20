/// <reference types="vite/client" />

/** The package version, substituted at build time (see `vite.config.ts`). */
declare const __WEBUI_VERSION__: string;

/** 閲覧 site の出自。ビルド時の定数で、空なら閲覧 site が無い配り方
 * (DR-0005 FV-Q7、`src/files/view-site.ts` が読む)。 */
declare const __VIEW_ORIGIN__: string;
