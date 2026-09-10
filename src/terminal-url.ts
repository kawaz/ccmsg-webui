/** Where a person opens the terminal a session runs in.
 *
 * Two URLs are made from the same pair — the gateway the instance named in
 * `hello` and the terminal a session named on the `agents` topic. The plain one
 * is what a link in the list opens in a tab of its own; the embedded one is
 * what the session's terminal tab puts in an iframe. Both are
 * `<gateway>/sessions/<terminal_id>`: the path below the base is the gateway's
 * spelling, so the base's own path is kept and the segments are appended to it
 * rather than replacing it.
 *
 * Nothing is displayed for a gateway that is not an http(s) URL or for a
 * session that names no terminal: a link to nowhere is worse than no link, and
 * the caller drops the link or the tab entirely on `null`. */

/** `embed=1` asks the gateway for the terminal alone, without its own header,
 * and `resize=1` lets it follow the iframe's size rather than a stored one —
 * an embedded gateway page has neither the chrome to offer the choice nor the
 * storage to remember it. */
const EMBED_QUERY = "embed=1&resize=1";

function sessionUrl(
  gateway: string | undefined,
  terminalId: string | undefined,
  query: string,
): string | null {
  if (gateway === undefined || gateway === "" || terminalId === undefined || terminalId === "") {
    return null;
  }
  let at: URL;
  try {
    at = new URL(gateway);
  } catch {
    return null;
  }
  if (at.protocol !== "http:" && at.protocol !== "https:") return null;
  // The contract states the base without a trailing slash; one that arrives
  // with it names the same gateway and is read as such.
  at.pathname = `${at.pathname.replace(/\/+$/, "")}/sessions/${encodeURIComponent(terminalId)}`;
  at.search = query;
  at.hash = "";
  return at.toString();
}

/** The gateway's own page for the terminal, for a link that opens a tab. */
export function terminalUrl(
  gateway: string | undefined,
  terminalId: string | undefined,
): string | null {
  return sessionUrl(gateway, terminalId, "");
}

/** The same terminal, as the session's terminal tab embeds it. */
export function terminalEmbedUrl(
  gateway: string | undefined,
  terminalId: string | undefined,
): string | null {
  return sessionUrl(gateway, terminalId, EMBED_QUERY);
}
