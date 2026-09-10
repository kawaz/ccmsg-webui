import { Endpoint, isValid } from "@ccmsg/protocol";

/** Where this page's instance is, and where the routes below it are.
 *
 * The endpoint is a base URL naming no route of its own (contract `Endpoint`),
 * and everything an instance serves hangs under it: `<endpoint>ws` for the
 * socket, `<endpoint>auth/…` for what happens before a socket exists. It is not
 * configured: this page is served from under the endpoint (DR-0001 §2.2), a
 * passkey answers only for the domain it was made under, and the refresh cookie
 * travels only to the prefix it was set for — so where this page came from is
 * the endpoint, and anywhere else is an instance this browser has no way in to.
 */

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

/** The endpoint this page is served from: its origin, and the prefix it is
 * mounted under with the trailing slash the contract requires.
 *
 * The prefix is the build's own base rather than the current path, because a
 * path is a route this page reads and a base is where the whole of it lives. */
export function endpointFromLocation(origin: string, base: string): string | undefined {
  const url = `${origin}${base.endsWith("/") ? base : `${base}/`}`;
  return isEndpoint(url) ? url : undefined;
}
