import { terminalUrl as compose } from "@ccmsg/protocol";

/** Where a person opens the terminal a run works in.
 *
 * Two URLs are made from the same pair — the gateway the instance named in
 * `hello`, and the terminal a run names on its row. The plain one is what a
 * link in the list opens in a tab of its own; the embedded one is what the
 * session's terminal tab puts in an iframe.
 *
 * **Composing them is the contract's** (`terminalUrl`): the handle names which
 * system's terminal it is, and only one scheme is the gateway's to serve, so
 * the rule for which handles become a URL at all lives once beside the field.
 * A handle under another scheme is opened by whoever knows that system, and
 * nothing is drawn here.
 *
 * What is left here is the one thing this build owes its own reader: the value
 * goes into an `href`, so a gateway that is not an http(s) URL yields no link.
 * Nothing is displayed for that or for a run that names no terminal — a link to
 * nowhere is worse than no link, and the caller drops the link or the tab
 * entirely. */

/** `embed=1` asks the gateway for the terminal alone, without its own header,
 * and `resize=1` lets it follow the iframe's size rather than a stored one —
 * an embedded gateway page has neither the chrome to offer the choice nor the
 * storage to remember it. */
const EMBED_QUERY = "embed=1&resize=1";

function sessionUrl(
  gateway: string | undefined,
  terminalId: string | undefined,
  query: string,
): string | undefined {
  if (gateway === undefined || gateway === "") return undefined;
  let at: URL;
  try {
    at = new URL(gateway);
  } catch {
    return undefined;
  }
  if (at.protocol !== "http:" && at.protocol !== "https:") return undefined;
  // The contract states the base without a trailing slash; one that arrives
  // with it names the same gateway and is read as such.
  const base = gateway.replace(/\/+$/, "");
  const composed = compose(base, terminalId === "" ? undefined : terminalId);
  if (composed === undefined || query === "") return composed;
  return `${composed}?${query}`;
}

/** The gateway's own page for the terminal, for a link that opens a tab. */
export function terminalUrl(
  gateway: string | undefined,
  terminalId: string | undefined,
): string | undefined {
  return sessionUrl(gateway, terminalId, "");
}

/** The same terminal, as the session's terminal tab embeds it. */
export function terminalEmbedUrl(
  gateway: string | undefined,
  terminalId: string | undefined,
): string | undefined {
  return sessionUrl(gateway, terminalId, EMBED_QUERY);
}
