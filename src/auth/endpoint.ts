import { Endpoint, isValid } from "@ccmsg/protocol";

/** Where the instance this page is talking to is, and where the routes below it
 * are.
 *
 * The endpoint is a base URL naming no route of its own (contract `Endpoint`),
 * and everything an instance serves hangs under it: `<endpoint>ws` for the
 * socket, `<endpoint>auth/…` for what happens before a socket exists.
 *
 * **It is not where this page came from.** A web UI is published at a URL of
 * its own (contract `WebUi`) and dials an endpoint that may be another site
 * entirely: a credential names both, and each answers a different question —
 * the endpoint which instance a person is admitted to, the web UI which page
 * they may come from (contract DR-0029). So the endpoint is stated by the
 * person at the connection bar, and the address of this page is only the first
 * guess offered to them, for the deployment where the instance serves the UI
 * itself. */

const ROUTES = ["challenge", "register", "assert", "refresh"] as const;
export type AuthRoute = (typeof ROUTES)[number];

export function authUrl(endpoint: string, route: AuthRoute): string {
  return `${endpoint}auth/${route}`;
}

/** The socket to open, in the endpoint's own scheme.
 *
 * `https:` is not rewritten to `wss:`: a WebSocket starts as an HTTP request
 * that upgrades, the browser accepts the http(s) spelling, and one spelling is
 * what keeps the URL comparable with the endpoint it came from (DR-0001 §2.7). */
export function socketUrl(endpoint: string): string {
  return `${endpoint}ws`;
}

/** Whether a value is an endpoint at all, by the contract's own schema. */
export function isEndpoint(url: string): boolean {
  return isValid(Endpoint, url);
}

/** The endpoint to offer a person who has stated none: this page's own origin,
 * and the prefix it is mounted under with the trailing slash the contract
 * requires.
 *
 * A guess, and right in the deployment where an instance serves the web UI
 * under its own endpoint — which is what a person running one daemon behind one
 * proxy has. Where the UI is published elsewhere it is wrong, and what makes it
 * harmless is that it is only what the input starts filled in with.
 *
 * The prefix is the build's own base rather than the current path, because a
 * path is a route this page reads and a base is where the whole of it lives. */
export function endpointFromLocation(origin: string, base: string): string | undefined {
  const url = `${origin}${base.endsWith("/") ? base : `${base}/`}`;
  return isEndpoint(url) ? url : undefined;
}
