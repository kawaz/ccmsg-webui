import { isEndpoint } from "./auth/endpoint.ts";

/** Where this browser reaches a daemon instance.
 *
 * The endpoint is the person's to supply: the site is served from an origin the
 * daemon knows nothing about, so nothing about where an instance is can be
 * inferred from where the page came from.
 *
 * It is also the only thing kept here. What authorizes a connection is an
 * access token this page holds in memory and a refresh cookie it cannot read
 * (DR-0001 §2.4) — an address is not a secret, and a secret is not stored. */

const URL_KEY = "ccmsg.entry.url";

/** Read `#url=…` out of a location fragment. A fragment rather than a query
 * because a fragment is never sent to the server that serves this page. */
export function parseFragment(hash: string): string | undefined {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return params.get("url") ?? undefined;
}

/** Whether an endpoint is one a WebSocket can be opened on. Rejecting a wrong
 * scheme here names the mistake, where the browser would only fail to connect. */
export function isEntryUrl(url: string): boolean {
  return isEndpoint(url);
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

/** Which endpoint this page starts on: the fragment wins over what was stored,
 * and what the fragment carried is stored so a reload without it still
 * connects. */
export function loadEndpoint(store: Store, hash: string): string | undefined {
  const fragment = parseFragment(hash);
  if (fragment !== undefined && isEntryUrl(fragment)) store.set(URL_KEY, fragment);
  const stored = store.get(URL_KEY);
  if (stored !== undefined) return stored;
  // A store that remembers nothing still connects on what the link said.
  return fragment !== undefined && isEntryUrl(fragment) ? fragment : undefined;
}

export function saveEndpoint(store: Store, url: string): void {
  store.set(URL_KEY, url);
}

/** Which relying party a passkey for one endpoint was made under.
 *
 * A passkey answers for the domain it was created under and no other, and that
 * domain is the registration's to decide (it may be a registrable suffix of the
 * endpoint's host, so that a web UI on another subdomain shares it). The
 * browser would otherwise guess it from where this page is served, which is
 * exactly the value the registration was allowed to differ from. */
function rpKey(url: string): string {
  return `ccmsg.auth.rp:${url}`;
}

export function loadRpId(store: Store, url: string): string | undefined {
  return store.get(rpKey(url));
}

export function saveRpId(store: Store, url: string, rpId: string): void {
  store.set(rpKey(url), rpId);
}
