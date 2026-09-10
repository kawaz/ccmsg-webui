/** What this browser keeps between visits.
 *
 * Not the endpoint: this page is served from under it (DR-0001 §2.2), so where
 * to reach an instance is read from where the page came from and a stored copy
 * could only disagree with it. Not a secret either — the access token is held
 * in memory and the refresh token is a cookie this page cannot read (§2.4).
 * What is left is per-screen memory, whose keys name the endpoint they belong
 * to so that two instances behind one origin do not read each other's. */

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
