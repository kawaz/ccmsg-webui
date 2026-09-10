import { normalizeBase, parseRoute, type Route, routePath } from "./route.ts";

/** Where this build was published, and the one place that answer is taken from.
 *
 * A build made for `/personal/` is served under `/personal/`, so every address
 * it reads carries that prefix and every address it writes has to. The prefix
 * is the build's own `base` rather than anything read out of the current
 * pathname: a path is a route this page reads, and where the whole of it lives
 * is something only the build can state (DESIGN §Build). */
export const BASE: string = normalizeBase(import.meta.env.BASE_URL);

/** The address a link to this route points at. */
export function href(route: Route): string {
  return routePath(route, BASE);
}

/** The route the address bar names right now. */
export function locationRoute(): Route {
  return parseRoute(location.pathname, location.search, BASE);
}
