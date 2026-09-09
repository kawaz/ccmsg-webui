import { isMarkdownPath } from "./paths.ts";

/** What the files tab remembers about one session, and how it is spelled in the
 * browser's store.
 *
 * A browser holds one store for the whole site while a person reaches several
 * instances from it, so the key names both the instance and the session
 * (DESIGN「localStorage のキー規律」). Nothing here throws on a value that has
 * been edited by hand or written by an older build: a record that does not read
 * cleanly is the same as no record. */

export type FileViewMode = "code" | "preview";

export interface FilesRecord {
  /** The file that was open, in the shape its surface implies. */
  readonly path?: string;
  /** The last choice made *for a markdown file*, which is why it is one value
   * per session rather than one per path: opening a `.ts` file in between is
   * not an answer to "code or preview", so it must not erase the answer. */
  readonly view?: FileViewMode;
  /** Where the viewer was scrolled, in pixels. */
  readonly top?: number;
  /** Absolute paths this tab has opened outside the browsable root. The
   * contract has no op that lists them — the allowlist is the session's own
   * fact and is only ever consulted about a path already in hand — so what the
   * tree can show under 「プロジェクト外」 is what this browser has reached. */
  readonly outside?: readonly string[];
}

export function filesStorageKey(instance: string, sid: string): string {
  return `ccmsg.files:${instance}:${sid}`;
}

/** How many outside paths one session keeps. Beyond it the oldest go: this is a
 * trail of what has been opened, not an archive. */
const OUTSIDE_LIMIT = 30;

export function parseFilesRecord(raw: string | undefined): FilesRecord {
  if (raw === undefined) return {};
  let held: unknown;
  try {
    held = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof held !== "object" || held === null) return {};
  const record = held as Record<string, unknown>;
  const path = typeof record["path"] === "string" ? record["path"] : undefined;
  const view =
    record["view"] === "preview" || record["view"] === "code" ? record["view"] : undefined;
  const top =
    typeof record["top"] === "number" && Number.isFinite(record["top"]) && record["top"] > 0
      ? record["top"]
      : undefined;
  const outside = Array.isArray(record["outside"])
    ? record["outside"]
        .filter((one): one is string => typeof one === "string")
        .slice(-OUTSIDE_LIMIT)
    : undefined;
  return {
    ...(path === undefined ? {} : { path }),
    ...(view === undefined ? {} : { view }),
    ...(top === undefined ? {} : { top }),
    ...(outside === undefined || outside.length === 0 ? {} : { outside }),
  };
}

export function formatFilesRecord(record: FilesRecord): string {
  return JSON.stringify(record);
}

/** Add one outside path, most recent last and each path once. */
export function withOutsidePath(record: FilesRecord, path: string): FilesRecord {
  const kept = (record.outside ?? []).filter((one) => one !== path);
  return { ...record, outside: [...kept, path].slice(-OUTSIDE_LIMIT) };
}

/** Which of code and preview a markdown file opens in.
 *
 * A named line range wins over what was remembered: whoever sent the link was
 * pointing at numbered lines, and the preview has none. Everything that is not
 * markdown has only one reading, so it never asks. */
export function resolveViewMode(
  record: FilesRecord,
  path: string,
  hasLineRange: boolean,
): FileViewMode {
  if (!isMarkdownPath(path)) return "code";
  if (hasLineRange) return "code";
  return record.view ?? "preview";
}

/** What to store after the reader chose a mode. A choice is only ever made
 * about a markdown file, so a view of anything else leaves the record alone. */
export function persistViewMode(
  record: FilesRecord,
  path: string,
  mode: FileViewMode,
): FilesRecord {
  if (!isMarkdownPath(path)) return record;
  return { ...record, view: mode };
}
