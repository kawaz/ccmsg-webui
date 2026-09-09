/** Where this browser reaches a daemon instance, and with what.
 *
 * Both values are the person's to supply: the site is served from an origin the
 * daemon knows nothing about, so nothing about the endpoint can be inferred
 * from where the page came from.
 *
 * The token is an instance's whole entry credential, so the URL fragment is the
 * only part of a link that may carry it — a fragment is never sent to the
 * server that serves this page, while a query string is. */

const URL_KEY = "ccmsg.entry.url";

/** Where one endpoint's token is kept.
 *
 * A browser holds one store for the whole site while a person reaches several
 * instances from it, so anything that belongs to one instance is stored under a
 * key naming it. A token stored under a bare name would be handed to whichever
 * endpoint was configured last — the wrong instance, with another instance's
 * whole entry credential. */
function tokenKey(url: string): string {
  return `ccmsg.entry.token:${url}`;
}

export interface Entry {
  /** The WebSocket endpoint, e.g. `ws://127.0.0.1:39847/ws`. */
  readonly url: string;
  readonly token: string;
}

export interface FragmentEntry {
  readonly url?: string;
  readonly token?: string;
}

/** Read `#url=…&token=…` out of a location fragment. Both are optional: a link
 * that carries only the token points at an endpoint already configured here. */
export function parseFragment(hash: string): FragmentEntry {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const url = params.get("url");
  const token = params.get("token");
  return { ...(url === null ? {} : { url }), ...(token === null ? {} : { token }) };
}

/** Whether an endpoint is one a WebSocket can be opened on. Rejecting a wrong
 * scheme here names the mistake, where the browser would only fail to connect. */
export function isEntryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "ws:" || parsed.protocol === "wss:";
  } catch {
    return false;
  }
}

/** A storage that answers as empty rather than throwing, which is what a
 * private window and a browser with site data blocked both look like. */
export interface Store {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

export const localStore: Store = {
  get(key) {
    try {
      return localStorage.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // A viewer who cannot persist still gets a working page for this visit.
    }
  },
};

/** What the page starts with: the fragment wins over what was stored, and what
 * the fragment carried is stored so a reload without it still connects.
 *
 * The endpoint settles first, because it is what the token is stored under. A
 * fragment carrying a token and no endpoint, with none configured either, has
 * nowhere to put it: the visit connects on it once nothing is remembered. */
export function loadEntry(store: Store, hash: string): Partial<Entry> {
  const fragment = parseFragment(hash);
  if (fragment.url !== undefined && isEntryUrl(fragment.url)) store.set(URL_KEY, fragment.url);
  const url = store.get(URL_KEY);
  if (fragment.token !== undefined && fragment.token !== "" && url !== undefined) {
    store.set(tokenKey(url), fragment.token);
  }
  const token =
    fragment.token !== undefined && fragment.token !== ""
      ? fragment.token
      : url === undefined
        ? undefined
        : store.get(tokenKey(url));
  return { url, token };
}

export function saveEntry(store: Store, entry: Entry): void {
  store.set(URL_KEY, entry.url);
  store.set(tokenKey(entry.url), entry.token);
}

/** Whether both halves are present and usable, which is what the connection
 * layer needs before it opens anything. */
export function completeEntry(entry: Partial<Entry>): Entry | undefined {
  const { url, token } = entry;
  if (url === undefined || token === undefined || token === "" || !isEntryUrl(url))
    return undefined;
  return { url, token };
}
