# ccmsg-webui design

> 🇯🇵 [DESIGN-ja.md](./DESIGN-ja.md)

## Domain

What this repository holds is **one reader of the contract**. It folds what the daemon pushes into something to look at, and turns what a person does into ops. The domain's vocabulary — what a session is, how its classification is decided, how a topic folds — lives in the contract and is not restated here.

This page is a static site served **from under an instance's endpoint** (DR-0001 §2.2), and what the daemon offers under that same endpoint is the WebSocket and `/auth/*`. Sharing an origin is where the design starts, and three things follow from it.

- **The endpoint is where this page came from.** It is `location.origin` plus this build's base, and nothing about it is typed in (`src/auth/endpoint.ts`). A passkey answers only for the domain of the page asking and a refresh cookie travels only to the prefix it was set for, so another endpoint is an instance this browser cannot authenticate to at all
- **Who may enter is a passkey.** What answers who has come is the access token; there is no origin allowlist (below)
- **A different generation is not spoken to.** There is no compatibility path; the page asks for a reload (contract, "版と互換")

## Layers

| Layer | File | Responsibility |
|---|---|---|
| connection | `src/connection.ts` | the socket's life, `hello`, correlating replies to requests, reconnection, restoring subscriptions |
| fold | `src/topic-fold.ts` | folding topic frames into what is held, by the contract's `granularity` |
| state | `src/state.ts` | the signals, and the functions that are their only writers |
| derived | `src/sessions.ts` `src/route.ts` | ordering, sections, display names, the URL grammar (pure) |
| base | `src/base.ts` | where this build was published, and the routes read and written against it |
| transcript | `src/timeline/` | the pure jsonl-to-events model, and the `TranscriptView` that gathers its fetching |
| screens | `src/ui/` | reading only |

The state layer is `@preact/signals`: an action is an update function gathered into the state module, and there is no `useMemo` or `memo` (DR-0032 §2.1).

## The fold is read from the contract

`TopicFold` asks the contract's `topicGranularity()` about a topic name and folds accordingly. There is no table here of which topic behaves how, so a topic added to the contract needs no change to this file.

What a fold holds is always a list of **(instance, payload) slots**, which makes `whole` and `per_instance_whole` the same operation with a different key — one slot per topic against one slot per instance. A reader has one shape to read. `union()` concatenates across instances, which is the contract's "what the subscriber holds is the union across instances".

`append` does not fold into slots. What is held is not a value an instance states whole but **one contiguous stretch** of a value that keeps growing, so `AppendFold` holds it separately: a window (`start`/`end`/`lines`) and the size the instance last stated. The window fills from two directions — frames add to its end, reads add to its start — and a part that is neither adjacent nor overlapping is a **gap**, which is refused rather than closed by pretending. The offsets are bytes, the same ones the contract's read pages by, so what arrives live and what is read back join without anything being counted twice.

**`element` is not folded.** No screen subscribes to it yet, and a topic that cannot be folded must not be subscribed to and then read as empty, so `isFoldable` refuses at subscription.

When a connection to an instance drops, what that instance said is dropped with it: a stopped value is indistinguishable from a live one.

## The Timeline's three layers

A transcript is fetched, read, and drawn, and those are three layers.

| Layer | File | Responsibility |
|---|---|---|
| fetch | `src/timeline/transcript-view.ts` | the `transcript:<sid>` subscription and the backwards `transcript_read`, gathered into one `AppendFold` |
| model | `src/timeline/transcript-model.ts` and neighbours | jsonl line to `ParsedLine`, joining tool_use with tool_result and pairing queued turns, then `TimelineGroup`. Pure functions only |
| draw | `src/ui/Timeline.tsx`, `src/markdown/` | reading the groups, what a scroll position means, how Markdown is read, and how a fold looks |

**Subscribe first, read second.** The other order loses whatever is appended between the end of the read and the start of the subscription. The snapshot says only where the file ends now, and that is where the first read of the tail begins.

The model layer splits into a pure **per-line** map (`incremental-line-map`) and a **cross-line** one (`incremental-cross-line`). The second recomputes the whole window every time and then hands back the previous objects wherever they are equal: appending a tool_result can rewrite a tool_use thousands of lines back, and a delivered user turn cancels a queued copy that appeared earlier, so a "recompute the tail only" scheme cannot reproduce that reach.

The scroll position is what separates following from reading. At the bottom a person is watching it happen, so an append moves the view; anywhere else they are reading, so it does not. A page added above is cancelled out by adding the `scrollHeight` difference, which leaves the line being read where it was.

## Drawing: Markdown and highlighting

Text an agent wrote is **read as Markdown**. The mdast tree (`mdast-util-from-markdown` plus the GFM extensions) is walked into JSX by hand, with no HTML-string stage in between. Nothing uses `innerHTML` or `dangerouslySetInnerHTML`, so escaping a body that contains `<` or `&` is what Preact's text nodes already do.

**Text a person typed is read by different rules** (restricted). `#3 の件` is not a heading and `<R G B>` is not an HTML tag. What people use on purpose is inline code, fenced code and quoted lines, so restricted reading interprets those three and shows everything else as the characters they typed. It tokenizes the source directly rather than walking the mdast tree and flattening it back, because the round trip loses the original characters (whether a `#` was eaten, the exact spacing inside `_foo_`).

**A link target lands in one of three places.** http/https/mailto open a new tab; a `#fragment` and an absolute URL naming this same origin open in the same tab; everything else — a scheme like `javascript:`, and any filesystem path — emits **no `<a>` at all**. Turning a path into an origin-relative `href` navigates to the origin serving this page with no way back (a standalone PWA has no address bar to recover with). Images take the same decision and are never auto-fetched through `<img src>`: rendering alone would send the viewer's IP and UA to a third party, so the alt text and a link are offered instead and the person chooses.

Code highlighting loads Shiki as a **lazy chunk**. The engine and every grammar are taken by `await import()` inside `getHighlighter`, so a session with no code fetches none of it. Only the language table and the size threshold are eager, and they are what lets a caller decide whether to highlight without paying for the highlighter. Each token carries both the light and the dark colour and CSS picks one, rather than tokenizing again per theme.

## Fold state lives outside the folds

Whether a fold is open is held **outside** the component drawing it (`src/timeline/fold-open.ts`). The window moves and components unmount, and a fold that came back closed for that reason reads as the app forgetting what the reader did.

**One signal per key**, not one signal holding a map. A component reads the key it draws, so opening one fold leaves the rest of the timeline alone — which is the reason the state is out there at all.

**Only folds the reader touched are recorded.** Absent means "still at the caller's default", which is how a change to the auto-open settings takes effect without the store knowing what any fold's default is: changing them drops the overrides.

**A closed fold's body is not drawn, but a body once drawn stays.** Most of a transcript lives inside a fold, so drawing every closed body would mean rendering — and highlighting — a whole session to show the few lines anyone is reading. Discarding a body on close would instead make closing a fold mean throwing away the work of having opened it.

## Files: the tree, the file, and the links

The files screen answers three things: where things are (the tree), what is in one (the file), and where a path written in some text points (the links).

**How a path is spelled is which surface it is reached through.** The contract spells `contained` paths relative to the session's root and `workspace`/`external` paths absolute (contract `files.ts`), so a leading `/` is the whole of the distinction — which is why the tree's keys, the stored selection and the URL are all the same one string. A relative path can only be `contained`; **the surface of an absolute one is asked for** with `file_stat_batch`, since `workspace` and `external` share a spelling and only the instance can say which admits it.

**The tree is asked for one level at a time**, as it is expanded (`dir_list`). What comes back is a copy of a moment rather than a subscription, so re-reading is a button. A refusal is remembered as an answer too — otherwise a row reads `loading` forever.

**The URL is the record.** `/s/<sid>/files?path=<p>&lines=<a>-<b>` names the open file and the lines being pointed at, so a link shows its reader the same thing. Opening a file is a navigation; the lines live in the query because a path contains slashes and a path segment cannot. **Named lines beat what was remembered**: whoever sent the link was pointing at lines, so both the stored view mode and the stored scroll position give way.

**There is no next page.** `file_read` answers up to the instance's read limit (512KiB) and sets `truncated`; the contract gives it no offset to ask for the rest (contract `files.ts`). So the head is shown with a banner saying why it stops there — cutting it silently would read as "that is the file".

**What is outside the project is a trail, not a listing.** The `external` allowlist is the files this session's transcript named, and the contract has no op that enumerates it (only `file_stat_batch`, which answers about a path already in hand). What the tree shows is therefore the absolute paths this browser has actually opened for that session.

**A markdown file's view mode is one last choice per session.** Kept per path it would be lost to opening a single `.ts` in between — `.ts` has no answer to "code or preview", so it must not overwrite one.

## Searching what is on screen

The search covers **what this page already holds** — the stretch of the transcript that has been read, and the file that is open. Nothing is asked of the instance (DR-0022). The browser's own Cmd+F cannot see inside a collapsed fold and does not open at all in a standalone PWA, so `/` and ⌘F are taken by this box.

Whitespace within a query line separates AND terms and newlines separate OR clauses. A double-quoted phrase is one term whose internal runs of whitespace match `\s+`. `[Aa]` and `[.*]` switch case sensitivity and regular expressions on. **That grammar belongs to the page, not to the contract**: the contract states what a daemon and a client say to each other, and how a string typed into a search box is read is not one of those things.

What is counted is what the page holds, not what is currently drawn. A match inside a closed fold is in `[N/M]`, and stepping to it opens the folds enclosing it first (`fold-tree.ts` answers which). The unit is **one line**, named by its byte offset — so reading backwards, which grows the window at the front, never makes the same number mean a different line. In a file the line number is the name, so the count and the navigation belong to the code view; the preview highlights too, but a paragraph has no name to move to.

A counted match must be a match the reader can find, so the text searched is the text as shown: a tool call is drawn as one shortened line, and that shortened line is what the query runs against (`segment-text.ts`). Searching the full text held would produce "[3/12] with no third match to look at".

Highlighting happens two ways. Prose is split at render time and `<mark>` put in (the `text` case in `markdown-view.tsx`). A highlighted code line is already a list of spans, so the same split is projected onto them and the spans are re-cut (`splitSpansForHighlight`). Code inside markdown is the one place nothing lights up: `CodeBlock` assembles it separately and there is no seam to re-cut.

## The conversation lives on the Timeline

There is no separate screen for talking to a session. **The session's own transcript is the record of the conversation**, and the screen that reads it already exists. The two directions look different in there.

- **person to session**: `message_send { to: sid, text }`. One sid is the whole address; there is no room. What arrives shows up in the session's own user turn, wrapped in a `<cross-session-message>` envelope
- **session to person**: the `ccmsg reply <mid> <text>` the session runs. A reply with no `--to` is for the person, and the instance turns it into a notification

Reading the envelope back is the contract's `parseDirectDelivery`. A regular expression written here would be a second copy of the same grammar, and the screen would keep reading the old spelling after the contract moved. What `src/timeline/transcript-model.ts` holds is cutting an envelope out of a line, and the cut takes **the last closing tag before the next envelope** — the contract states that a body containing a closing tag round-trips, so cutting at the first one would silently drop part of what was said.

The reply side reads a Bash command string. It reads word splitting and `--name value` and nothing else: interpreting expansions would mean claiming to have read what it did not.

## Nothing is kept for a notification

A `notify` frame is an event, and the contract keeps none of them. Neither does this page: they live in memory and go when the connection does. The bubble at the end of the Timeline is **the moment before the transcript catches up** — once the same answer is written there, that is the record (which is why the bubble is dashed rather than as solid as a settled line). The topbar shows the latest one as a toast, so a notification is noticed whichever session is open.

## A session that cannot be reached offers no composer

The composer is enabled for sessions the instance currently reports as connected. A `message_send` to a stopped session is refused, so the page says that it cannot be sent and why (ended / gone / not connected) rather than letting the person find out from a refusal.

A send that goes through has two successes to tell apart: handed over now, or held in the inbox. Being held is not a failure, so the wording says which of "wait", "send to another session" or "give up" this is (`src/conversation/send-outcome.ts`).

Neither is a message too large to send. The contract's `MAX_FRAME_BYTES` is a ceiling **the sender keeps to**: a line over it is answered `bad_request` and the connection stays up, and all that refusal can say is that it was too big. So the line about to be sent is measured in bytes and stopped here instead (`src/frame-limit.ts`). What to do about it — split it, write it to a file — is the sender's decision, so the page suggests and does not choose.

## A person cannot see an inbox

The contract's `TOPIC_ATTRIBUTES` opens `inbox` to `["session", "user"]`, so a connection made as a person may subscribe. **The subscribe succeeds and no frame ever arrives** (measured against v0.0.29: `topic_subscribe` answers ok, and neither a snapshot nor a delta follows). The daemon's reason is plain — the topic carries what was said to a session, and a person is not one: the snapshot is looked up by the connection's sid, and a delivery is pushed only to connections holding the addressee's.

Nor does a `peers` row carry a count of what is waiting. In this generation of the contract there is **no way for a person to learn how much an instance's inbox is holding**.

What can be shown is what this page sent and has not seen handed over. The reply to `message_send` (`delivered: false` and its reason) is the only primary source there is, so it is written down at that moment and shown as a badge in the session list and a list above the timeline (`conversation/held-messages.ts`). It lives in the page's memory and goes with the connection: with no way to confirm delivery, persisting it would only manufacture stale notes about messages that have long since arrived. "Dismiss" on the list is a person deciding to stop caring, not evidence that it landed.

No `element` fold was added to `topic-fold.ts`. There is nothing to fold, and the contract's `InboxMessage` carries no removal mark — `element` granularity states that a removal arrives as a marked element, and the `inbox` payload has nowhere to write that mark. A fold with no way to say what was removed is a fold written ahead of its topic.

## Authenticating a person (passkey)

The daemon's DR-0001 is where this is decided. What is written here is only **what this page holds, and where**.

| Thing | Where | Why |
|---|---|---|
| access token | **in memory alone** (`src/auth/session.ts`) | the secret that opens a socket; anything in the store is readable by every script that ever runs on this origin |
| refresh token | **an httpOnly cookie**, which this page cannot read | the instance reads and writes it, and the page's whole part in it is that the browser sends it |
| the endpoint | **kept nowhere**, read from `location` | it is where the page came from. A stored copy could only disagree with it, and `https://h/` and `https://h/personal/` are two endpoints |
| the passkey's `rp_id` | **kept nowhere** | it is the endpoint's host, which is this page's own domain and what the browser assumes. No `rpId` is passed to `credentials.get()` (DR-0001 §2.3) |

Three flows, all of them entering at the endpoint's `/auth/*` (`src/auth/client.ts`). The endpoint is a base URL ending in a slash, so a route is written after it (`<endpoint>auth/<name>`, and `<endpoint>ws` for the socket). The scheme is not rewritten: a WebSocket is an HTTP request that upgrades, so the `https:` spelling is what `new WebSocket()` is given (DR-0001 §2.7).

- **Registration** happens only when a link brought `#register=<token>` (`src/auth/register-link.ts`). The claims are read for display alone — the signature is the issuing instance's to check. **The six digits are not in the URL**, so they are typed in: the two halves travelling apart is what makes a leaked URL not a registration. The device label is filled in from the user agent and rewritten by the person (`src/auth/device-label.ts`). The fragment is read on arrival and on every `hashchange`, since a link opened into a tab already showing this page changes nothing else
- **Signing in** tries the refresh cookie first and raises the passkey screen when there is none. No credential is named: a resident passkey answers with its user handle, and which subject that is is the instance's to look up. What is asked for is **a passkey registered for this endpoint**; another host or path prefix is a registration of its own
- **Extending** works off `auth_expires_at` from `hello`, which is the connection's deadline. At a tenth of it left, `/auth/refresh` mints a token and `auth_refresh` moves the deadline **on the same connection** — there is no reason for the screen to blink every few hours

The token is fetched again on every attempt to connect (`Connection` holds a `TokenSource` rather than a value). A token that expired while a connection was down turns into a refresh in that one place, and nothing else knows it happened. A handshake that was refused asks for the token again too, saying so: what the page holds is the family's token and not its own, so an expiry it reads as live tells it nothing about whether the token still stands. When there is none to be had, the sign-in screen is raised, and it is the only way back.

## Tabs of one session refresh together

**An access token belongs to the family, and every tab the person has open presents the same one** (DR-0001 §2.4). Tabs that refreshed on their own would each rotate the family and take the token out from under the others, so they coordinate in the browser (`src/auth/tab-share.ts`):

- The refresh — `/auth/refresh` and the `auth_refresh` that follows it — runs inside `navigator.locks.request()`, so one tab of a session does it at a time
- What it settles on goes to the others over a `BroadcastChannel`, **in memory**: an access token is not written to a store, here as anywhere (see the table above)
- The tab holding the lock **asks the others** on the same channel before it refreshes, and takes the first token that comes back. Asking rather than only listening is what makes this reliable: the lock and a message are handed over by different queues, so what another tab broadcast may not have arrived yet — and what it broadcast before this tab was opened never will. A tab that nobody answers within the round trip is the only tab of its session, and refreshes
- A refused handshake tries the newest token another tab passed on before it refreshes at all
- Without the Web Locks API each tab refreshes for itself. That is the behaviour this improves on rather than one it depends on — the instance's standing token is what makes separate refreshes converge

Names carry **the endpoint and the subject** (`ccmsg.auth.refresh:<endpoint>:<sub>`, `ccmsg.auth:<endpoint>:<sub>`) for the same reason the localStorage keys below do: one origin serves several endpoints and one endpoint several people, and tabs that are not the same session have nothing to agree on. A tab that has not authenticated yet knows no subject and listens on the endpoint alone until it does.

## localStorage keys name what they belong to

A browser holds one store for the site while one person reaches several instances through it, so **anything belonging to an instance names it**.

- **Neither a secret nor the endpoint is kept here** (above)
- anything kept per session: `ccmsg.<feature>:<instance>:<sid>`, two levels (an agent drilldown adds `<sid>/<agentKey>`). A session id only names a session on one instance. The Timeline's auto-open settings (`ccmsg.tl.autoOpen:...`) an unsent draft (`ccmsg.draft:<instance>:<sid>`) and what the files tab remembers (`ccmsg.files:<instance>:<sid>`) are this

## The contract validates its own frames

Every topic frame is checked against `TOPIC_SCHEMAS` with the contract's `isValid()`. No field-by-field test is written here — validating is the contract's job, and a frame that fails it has exactly one meaning, a disagreement about the contract, which lands in the warning banner.

## What cannot be observed

**The page cannot read the HTTP status of a refused handshake.** A token that was not accepted and a daemon that was not there both arrive through the WebSocket API as an `error` event with nothing in it, so the page can only say that the connection was refused or did not arrive.

The status is not lost, only out of the page's reach: the **browser's console and network panel do show it** (Chrome writes `Unexpected response code: 401`). What cannot read it is the script, not the person, so the two are told apart there and in the daemon's log.

## What the contract does not carry

The subprotocol prefix the access token travels in (`ccmsg.token.`) and the `/auth/*` paths belong to the daemon's entry policy (daemon §3.1, DR-0001 §2.7) rather than to the contract, and `@ccmsg/protocol` exports neither. They are constants in `src/connection.ts` and `src/auth/endpoint.ts`.

## Build

**The endpoint's path prefix is settled at build time by `base`** (vite's `base`, `/` by default). The page takes `location.origin` plus `import.meta.env.BASE_URL` as its endpoint, so an instance published under a prefix is given **a build made for that base** (`bun x vite build --base=/personal/`, served at `https://h.example/personal/`). The current `location.pathname` is not read for it: a path is a route this page reads, and where the build was published is something only the build can state.

**The same base is what routes are read from and written with** (`src/base.ts`). A pathname has the base taken off before the URL grammar reads it, and a link has it put back on, so `/personal/s/<sid>/timeline` is the session `/s/<sid>/timeline` names under a build published at `/personal/`. An address outside the base is an unknown route: it is not a place this build answers for. The grammar itself (`src/route.ts`) stays base-free and takes one, so that what a link means does not depend on where the build happens to live.

The dev server proxies `/ws`, `/auth`, `/mesh` and `/webhook` to a daemon (`CCMSG_DEV_DAEMON`, `http://127.0.0.1:39847` by default). It stands where a reverse proxy stands in a real deployment; without it the endpoint would not be where the page came from, and neither the passkey nor the cookie would hold.

vite with esbuild's automatic JSX (`jsxImportSource: preact`). `@preact/preset-vite` is not used: what it adds is prefresh HMR, and it brings the whole Babel toolchain in for it, while esbuild emits the same JSX. Wanting HMR is what would bring the preset back.
