/** What this browser keeps between visits.
 *
 * The endpoint is one of them: this page is published at an origin of its own
 * and reaches an instance that may be another site, so where to dial is
 * something the person states and something they should not have to state
 * twice. No secret is kept — the access token is held in memory and the
 * refresh token is a cookie this page cannot read (daemon DR-0001 §2.4). The rest is
 * per-screen memory, whose keys name the instance they belong to so that two
 * instances read through one page do not read each other's. */

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
