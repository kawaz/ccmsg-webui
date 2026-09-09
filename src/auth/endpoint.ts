/** Where an instance's `/auth/*` routes are, given the WebSocket endpoint.
 *
 * The routes are matched at the end of a path and the prefix is not read
 * (DR-0001 §2.7), so a proxy may put an instance under a prefix of its own and
 * both `/ws` and `/auth/register` sit under that same prefix. What is derived
 * here is exactly that: the endpoint's own prefix, with the route's name after
 * it, over http where the socket was over ws. */

const ROUTES = ["challenge", "register", "assert", "refresh"] as const;
export type AuthRoute = (typeof ROUTES)[number];

export function authUrl(endpoint: string, route: AuthRoute): string {
  const url = new URL(endpoint);
  url.protocol =
    url.protocol === "wss:" ? "https:" : url.protocol === "ws:" ? "http:" : url.protocol;
  const segments = url.pathname.split("/").filter((one) => one !== "");
  // The socket's own last segment is the socket's name, not part of the prefix
  // the instance is mounted under.
  if (segments.at(-1) === "ws") segments.pop();
  url.pathname = `/${[...segments, "auth", route].join("/")}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

/** The origin a page is served from is not the instance's, so nothing about
 * where to reach one can be inferred from where this page came from. What can
 * be said is whether a value is an endpoint at all. */
export function isEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "ws:" || parsed.protocol === "wss:";
  } catch {
    return false;
  }
}
