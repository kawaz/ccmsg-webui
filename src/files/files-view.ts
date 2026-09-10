import { signal } from "@preact/signals";
import type {
  DirEntry,
  DirListResult,
  FileKind,
  FileReadResult,
  FileStatBatchResult,
  Sid,
} from "@ccmsg/protocol";
import type { Connection } from "../connection.ts";
import type { FilesRecord } from "./files-store.ts";
import { withOutsidePath } from "./files-store.ts";
import { ancestorsOf, isAbsolutePath, ROOT, sortEntries } from "./paths.ts";

/** One session's file browsing: which directories are open and what is in
 * them, which file is being read, and what came back.
 *
 * Nothing is subscribed here. A tree is answered by request and a file is read
 * once — a directory does not push, so what this holds is a cache with an
 * explicit reload rather than a live value that a dropped connection would
 * make stale (which is what `TranscriptItemsView` has to worry about). */

export interface TreeState {
  /** Directories the reader has opened. */
  readonly expanded: ReadonlySet<string>;
  /** Listings already answered, sorted. */
  readonly dirs: ReadonlyMap<string, readonly DirEntry[]>;
  /** Why a listing could not be answered. A directory is "settled" once it is
   * in either map, so a refusal is remembered rather than retried on every
   * render — and never leaves a row reading 「読み込み中」 forever. */
  readonly errors: ReadonlyMap<string, string>;
  readonly loading: ReadonlySet<string>;
}

export interface OpenFile {
  readonly path: string;
  readonly kind: FileKind;
  /** Size on disk, which `content` may not carry all of. */
  readonly size: number;
  readonly truncated: boolean;
  readonly binary: boolean;
  readonly content: string;
}

const EMPTY_TREE: TreeState = {
  expanded: new Set(),
  dirs: new Map(),
  errors: new Map(),
  loading: new Set(),
};

/** How the stored record is read and written. Passed in rather than reached
 * for, because the key names the instance and an instance is only known once
 * it has greeted. */
export interface FilesMemory {
  read(): FilesRecord;
  write(record: FilesRecord): void;
}

export class FilesView {
  readonly sid: Sid;
  readonly tree = signal<TreeState>(EMPTY_TREE);
  readonly file = signal<OpenFile | undefined>(undefined);
  readonly failure = signal<string | undefined>(undefined);
  readonly reading = signal(false);
  /** Absolute paths reached outside the browsable root, oldest first. */
  readonly outside = signal<readonly string[]>([]);

  readonly #connection: Connection;
  readonly #memory: FilesMemory;
  #started = false;
  /** The path a read was last asked for, so a reply that arrives after the
   * reader has moved on is dropped instead of painted over the new file. */
  #wanted: string | undefined;

  constructor(connection: Connection, sid: Sid, memory: FilesMemory) {
    this.#connection = connection;
    this.sid = sid;
    this.#memory = memory;
  }

  /** Load what a first look needs. Called again on a reconnection, which is
   * when a tree that could not be answered gets its second chance. */
  start(): void {
    this.outside.value = this.#memory.read().outside ?? [];
    if (this.#started) return;
    this.#started = true;
    this.#patch({ expanded: new Set([ROOT]) });
    void this.#list(ROOT);
    const wanted = this.#wanted;
    if (wanted !== undefined && this.file.peek() === undefined) void this.#read(wanted);
  }

  /** Undo `start`'s memory of having run, so the next one loads again. */
  dropped(): void {
    this.#started = false;
  }

  toggle(path: string): void {
    const held = this.tree.peek();
    const expanded = new Set(held.expanded);
    if (expanded.delete(path)) {
      this.#patch({ expanded });
      return;
    }
    expanded.add(path);
    this.#patch({ expanded });
    if (!held.dirs.has(path) && !held.errors.has(path)) void this.#list(path);
  }

  /** Ask for a listing again, whether or not it worked the first time. */
  reload(path: string): void {
    void this.#list(path);
  }

  /** Show one file, or nothing. Opens the directories above it on the way, so
   * a link into a deep file arrives with its place in the tree visible. */
  show(path: string | undefined): void {
    if (path === undefined) {
      this.#wanted = undefined;
      this.file.value = undefined;
      this.failure.value = undefined;
      return;
    }
    if (this.#wanted === path && (this.file.peek() !== undefined || this.reading.peek())) return;
    this.#wanted = path;
    this.file.value = undefined;
    this.failure.value = undefined;
    if (!isAbsolutePath(path)) this.#reveal(path);
    if (this.#started) void this.#read(path);
  }

  /** Read the open file again from disk. */
  refresh(): void {
    const wanted = this.#wanted;
    if (wanted !== undefined) void this.#read(wanted);
  }

  #reveal(path: string): void {
    const held = this.tree.peek();
    const expanded = new Set(held.expanded);
    const missing: string[] = [];
    for (const dir of ancestorsOf(path)) {
      expanded.add(dir);
      if (!held.dirs.has(dir) && !held.errors.has(dir)) missing.push(dir);
    }
    this.#patch({ expanded });
    if (this.#started) for (const dir of missing) void this.#list(dir);
  }

  #patch(next: Partial<TreeState>): void {
    this.tree.value = { ...this.tree.peek(), ...next };
  }

  async #list(path: string): Promise<void> {
    const held = this.tree.peek();
    if (held.loading.has(path)) return;
    this.#patch({ loading: new Set(held.loading).add(path) });
    try {
      const reply = (await this.#connection.request("dir_list", {
        sid: this.sid,
        kind: isAbsolutePath(path) ? "workspace" : "contained",
        path,
      })) as unknown as DirListResult;
      const dirs = new Map(this.tree.peek().dirs).set(path, sortEntries(reply.entries));
      const errors = new Map(this.tree.peek().errors);
      errors.delete(path);
      this.#patch({ dirs, errors });
    } catch (cause) {
      const errors = new Map(this.tree.peek().errors).set(path, String(cause));
      this.#patch({ errors });
    } finally {
      const loading = new Set(this.tree.peek().loading);
      loading.delete(path);
      this.#patch({ loading });
    }
  }

  /** Which surface admits an absolute path.
   *
   * Asked rather than assumed: `workspace` and `external` are two allowlists
   * with the same spelling, and the contract answers which one holds a path
   * with the very op a client uses to decide whether a path is openable at
   * all. A relative path needs no question — only `contained` is spelled that
   * way. */
  async #kindOf(path: string): Promise<FileKind | undefined> {
    if (!isAbsolutePath(path)) return "contained";
    const reply = (await this.#connection.request("file_stat_batch", {
      sid: this.sid,
      paths: [path],
    })) as unknown as FileStatBatchResult;
    return reply.results[0]?.kind;
  }

  async #read(path: string): Promise<void> {
    this.reading.value = true;
    try {
      const kind = await this.#kindOf(path);
      if (this.#wanted !== path) return;
      if (kind === undefined) {
        this.failure.value = "このセッションから開けるファイルではありません";
        return;
      }
      const reply = (await this.#connection.request("file_read", {
        sid: this.sid,
        kind,
        path,
      })) as unknown as FileReadResult;
      if (this.#wanted !== path) return;
      this.file.value = {
        path,
        kind,
        size: reply.size,
        truncated: reply.truncated,
        binary: reply.binary,
        content: reply.content,
      };
      this.failure.value = undefined;
      if (kind !== "contained") this.#remember(path);
    } catch (cause) {
      if (this.#wanted !== path) return;
      this.failure.value = String(cause);
    } finally {
      if (this.#wanted === path) this.reading.value = false;
    }
  }

  #remember(path: string): void {
    const next = withOutsidePath(this.#memory.read(), path);
    this.#memory.write(next);
    this.outside.value = next.outside ?? [];
  }
}
