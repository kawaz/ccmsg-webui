# ccmsg-webui design

> 🇯🇵 [DESIGN-ja.md](./DESIGN-ja.md)

## Domain

What this repository holds is **one reader of the contract**. It folds what the daemon pushes into something to look at, and turns what a person does into ops. The domain's vocabulary — what a session is, how its classification is decided, how a topic folds — lives in the contract and is not restated here.

The daemon does not serve this page. It is a static site with an origin of its own, and the daemon offers only the WebSocket API. That asymmetry is where the design starts, and three things follow from it.

- **The endpoint cannot be inferred.** Where the page came from says nothing about the daemon, so a person supplies both the endpoint and the entry token (`src/settings.ts`)
- **Who may enter is the daemon's configuration.** A handshake from an origin outside its allowlist is refused with 403, a number the browser never shows (below)
- **A different generation is not spoken to.** There is no compatibility path; the page asks for a reload (contract, "版と互換")

## Layers

| Layer | File | Responsibility |
|---|---|---|
| connection | `src/connection.ts` | the socket's life, `hello`, correlating replies to requests, reconnection, restoring subscriptions |
| fold | `src/topic-fold.ts` | folding topic frames into what is held, by the contract's `granularity` |
| state | `src/state.ts` | the signals, and the functions that are their only writers |
| derived | `src/sessions.ts` `src/route.ts` | ordering, sections, display names, the URL grammar (pure) |
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

## localStorage keys name what they belong to

A browser holds one store for the site while one person reaches several instances through it, so **anything belonging to an instance names it**.

- entry: the endpoint under `ccmsg.entry.url`, its token under `ccmsg.entry.token:<url>`. A token is an instance's whole entry credential, and one kept under a bare name would be handed to whichever endpoint was configured last
- anything kept per session: `ccmsg.<feature>:<instance>:<sid>`, two levels (an agent drilldown adds `<sid>/<agentKey>`). A session id only names a session on one instance. The Timeline's auto-open settings (`ccmsg.tl.autoOpen:...`) and an unsent draft (`ccmsg.draft:<instance>:<sid>`) are this

## The contract validates its own frames

Every topic frame is checked against `TOPIC_SCHEMAS` with the contract's `isValid()`. No field-by-field test is written here — validating is the contract's job, and a frame that fails it has exactly one meaning, a disagreement about the contract, which lands in the warning banner.

## What cannot be observed

**The page cannot read the HTTP status of a refused handshake.** A 401 (wrong token) and a 403 (origin not allowed) both arrive through the WebSocket API as an `error` event with nothing in it, so the page can only say that the connection was refused or did not arrive.

The status is not lost, only out of the page's reach: the **browser's console and network panel do show it** (Chrome writes `Unexpected response code: 403`). What cannot read it is the script, not the person, so the two are told apart there and in the daemon's log. Probing over HTTP first would not settle it either, since a cross-origin request shows just as little.

## What the contract does not carry

The subprotocol prefix the entry token travels in (`ccmsg.token.`) belongs to the daemon's entry policy (daemon §3.1) rather than to the contract, and `@ccmsg/protocol` does not export it. It is a constant in `src/connection.ts`.

## Build

vite with esbuild's automatic JSX (`jsxImportSource: preact`). `@preact/preset-vite` is not used: what it adds is prefresh HMR, and it brings the whole Babel toolchain in for it, while esbuild emits the same JSX. Wanting HMR is what would bring the preset back.
