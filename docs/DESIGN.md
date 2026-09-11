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
| connection | `src/connection.ts` | the socket's life, `hello.user`, correlating replies to requests, reconnection, restoring subscriptions |
| fold | `src/topic-fold.ts` | folding topic frames into what is held, by the contract's `granularity` |
| state | `src/state.ts` | the signals, and the functions that are their only writers |
| derived | `src/sessions.ts` `src/route.ts` | ordering, sections, display names, the URL grammar (pure) |
| base | `src/base.ts` | where this build was published, and the routes read and written against it |
| transcript | `src/timeline/` | the pure model that reads typed items into what is drawn, and the `TranscriptItemsView` that gathers its fetching |
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
| fetch | `src/timeline/items-view.ts` | the `transcript.items:<sid>` subscription, the backwards `transcript.items.read`, and the `transcript.read` that fetches a raw record |
| model | `src/timeline/items.ts` `src/timeline/item-view.ts` `src/timeline/display.ts` | typed items to `TimelineNode` — joining a call with its answer, gathering a run into a fold — what each type is called and says, and each type's display attributes. Pure functions only |
| draw | `src/ui/Timeline.tsx`, `src/markdown/` | reading the nodes, what a scroll position means, how Markdown is read, and how a fold looks |

**The classifying is the instance's, the contract is the vocabulary of types, and this build never reads jsonl.** A transcript is a file a harness writes in whatever shape it settles on, so deciding which record is which item belongs to whoever holds the file. What arrives here is the classified item, and the shape of a record is written nowhere in this layer — which is what lets the harness change its file, or a second harness be read at all, without this moving.

**A call and its answer are joined two ways.** An answer names its call both by the id the reader gave the item (`parent_item`) and by the key the harness paired the two under (`parent_tool_use_id`). The first is written only where the instance read the call as well, so its **absence is the ordinary case** — a read that begins part-way down a file meets answers whose call stands before where it started. The screen uses the id when it can resolve it and joins on the key when it cannot: the call is often already held from an earlier page, and then the two are put back together. An answer whose call was never read arrives as `tool.unknown` (the record does not say which tool it was), so it keeps the generic name and body and moves under its call only once the join succeeds.

**The raw record is fetched when someone asks for it.** The one question an item cannot answer is what the line behind it actually said, and the item carries that line's address (`source`). Opening `jsonl` under an item asks `transcript.read` for exactly that record and shows it formatted. It is prominent by default under items drawn in the **generic form** — `system.unknown`, a tool or attachment or type this build has no picture for — because that is where the classification is thin and the record is the only way to tell. Several items read out of one record share the address, so it is fetched once per record.

**Subscribe first, read second.** The other order loses whatever is classified between the end of the read and the start of the subscription. The subscription opens with the last 200 items, and an item that arrives twice is counted once: what identifies it is its id.

**A screen holds the last mebibyte's worth.** What it follows only grows, so without a bound a tab left open holds all of it. What is weighed is the items themselves, and the floor is the 200 the snapshot carries — a window that let go of what it was just given would ask for it forever. They are let go of only where the window grows at its end, so a page someone scrolled up for is never taken back out from under them by the read that fetched it. The open/closed state of a fold on an item that went (`fold:<item id>`, `msg:<item id>`, `think:<item id>`, `raw:<record id>`) goes at the same moment: a fold whose item is gone means nothing, and an item paged back in starts from the reader's default.

**Every read names no lower bound.** A read without one answers the **newest** of its range, with `prev` naming what stands before it, which is what lets a screen walk back a page at a time from the end. The upper bound is the **oldest item held** (`until_id`, which the read excludes) — the same item a reply hands back as `prev`, and taking it from what is held keeps it right once the window has let go of its front, where a remembered `prev` would name something dropped and leave a hole behind it. The first read, with nothing held, names no bound at all: that is the transcript's tail. A reply with no `prev` is the transcript's beginning.

The scroll position is what separates following from reading. At the bottom a person is watching it happen, so an append moves the view; anywhere else they are reading, so it does not.

**What scrolls is the page itself** (`src/timeline/page-scroll.ts`). The arithmetic needs three things — where the view is, how much of it is seen, and how far it reaches — and which scroller those are read from is outside the arithmetic. They are read from the page, because a box that scrolls inside the page leaves the margins around it dead to a wheel, and those margins are most of the screen. Two things have to be held in place for that to work: **the composer stays at the bottom of the screen** and **the search bar at the top** (`position: sticky`). Both are operated from wherever a person has scrolled to, and letting them flow away means going back to the end to type.

**The anchor is ours, and the browser's is turned off** (`overflow-anchor: none`). A browser's own scroll anchoring holds a position by holding onto an element it can see, which assumes that element stays in the DOM. Under virtualisation a line that leaves the window is removed there and then, so what was held onto disappears and the position jumps — and two mechanisms doing the same job push against each other. It is turned off, and the anchor below is placed here instead.

**Back and forward open at the end.** Restoring a position needs an element to restore against, so a line that is not drawn cannot be returned to. A restoration of our own could put back where someone was reading, but on a transcript that keeps growing that place is **no longer the same place by the time they come back**. The end — what is happening now — is what reopening means here.

**Only what is seen is drawn** (`src/timeline/virtual-window.ts`). Putting the whole held mebibyte into the DOM means drawing the whole window to read a few lines of it. What is drawn is the groups that fall within the viewport and 600px above and below it; the rest is the height of two spacers, one above and one below, which carry the length of the whole window into the scrollbar and hold nothing. What is remembered is the **measured heights**, keyed by a node's name — the id of the item it starts at. A line that has not been measured is placed at the **average of the ones that have**: a tool call shrunk to one line and an open code block differ by an order of magnitude, so a fixed guess gets the spacers wrong. The range is settled when the range changes, not on every scroll event, so the fineness of a finger does not redraw a transcript.

**Either the view is stuck to the end, or it is anchored to one line.** While following, the end is taken again whenever the end moves — a guess replaced by a measurement moves a spacer, so placing it once is not enough. It is not taken again when the end has not moved, because a finger on its way up out of the few pixels that count as the end is in there too. While reading, what is held is the name of the first line a person can see and the distance from its top, and that line is put back where it was both when a page is added above and when a line above it is measured for the first time. It is held by name rather than by index because the window grows at both ends, and an index names a different line each time it does. A height is forgotten when the window lets go of its line — the same moment that line's folds are forgotten.

**What could already reach a hidden line still reaches one.** Counting is about what is held rather than what is drawn, as it already is for a folded line, and moving to a match works the way opening the enclosing folds does: the line's place is taken from the remembered heights, the window is moved there, and once the element exists it is centred. That the line is there to be centred is what the spacers guarantee — the height they carry and the place moved to come from the same table.

## Nothing is wider than the window

The window decides the reading width. **What can grow sideways scrolls inside itself and never outside**: a code block and a table each own a scroll container (`.md-code`, `.md-table-scroll`), and prose wraps on `overflow-wrap`.

A `<details>` inside a flex layout has a trap in it. The browser puts an open element's contents in a `::details-content` box, and that box is a flex item carrying `min-width: auto` — an automatic minimum of min-content, so **one unbreakable thing inside it (a table, a long single line) stops it shrinking and pushes the parent wide**. The conversation bubble hit exactly this, by placing the name beside the body. The two are stacked now, so the body takes the window's width as it is given; the left gutter disappearing, and the text starting at the bubble's own edge, is the visible half of the same change.

It shows up only after scrolling back, because what pushes (a table, a code block) is in an earlier page — not because of anything the window computes. So the baseline is drawn **on a narrow screen after scrolling back** (`test/visual/phone.visual.ts`), and it measures, beside the picture, that no element is wider than the window: a broken layout is indistinguishable from an intended one in a picture, while the name of the element that overflowed says who broke it.

## There are three disconnections, and they do three different things

Every row on screen is **something the instance is saying now**, so what a
disconnection does is a question of what is worth losing. There are three.

| The disconnection | The screen |
|---|---|
| **Nothing has been heard yet** (a first visit) | no list, no transcript, no mesh row — the connecting screen alone (`src/ui/Disconnected.tsx`) |
| **Nobody asked for it** (the network went, the instance left) | what was heard stays on screen, with a band saying it is no longer current. The next snapshot replaces the same rows |
| **Someone pressed 切断** | the equivalent of logging out: everything held in memory goes (the lists, the transcript, the fold state, the access token). The preferences in localStorage stay |

Nothing is framed before it is heard, because that frame is an **empty list** —
a list of no rows says "this host has no sessions" rather than "you are not
connected". So the screen arrives not when the socket opens but when **the
list's snapshot does** (`listed`); at the moment a socket opens nothing has been
heard yet.

The other way round, a drop does not empty the screen. This is carried around
and read on the move, and losing the page at every gap in the signal loses too
much: until the next snapshot overwrites them, the rows last heard are worth
reading. **Nothing on a row says when it was heard**, so the band says it. What
is dropped is only what stops meaning anything — the connection's deadline, a
notification that said something just happened, the receipt for a message sent
on that connection.

Only a press lets go of what is held. If a drop did that too, walking through a
tunnel would mean signing in again.

## Two translations, side by side, never merged

There are two ways to read an English body in Japanese — the translator this
browser has (`Translator`) and the one the instance's host has (`translate.run`,
capability `translate`). **Both are kept, and offered as a choice.**

They are not merged because they are different machines producing different
sentences: one reads like a dictionary, the other rewrites. Folding them into a
single "translation" would erase **which machine produced** a sentence that
looks wrong — the first thing a reader of a translation wants to know, and
exactly what the names on the choice (`日本語 (host)`, `日本語 (browser)`) answer.
With neither available the choice is not drawn at all: nothing offers what
cannot be pressed.

The choice is one for the screen. Someone reading an English transcript decides
"read this in Japanese" once, not per item. Translation runs only for **the
items the window is drawing**, so scrolling back does not send hundreds of items
nobody is reading.

Only an item's **prose** is translated — never a tool's arguments, never a fenced
block. Prose is the only thing that means the same after translation; an
identifier or a path names something else the moment it is translated. So a body
is cut at fences (``` / ~~~) before it is cut into paragraphs, and a fence is one
piece, blank lines inside it and all, that is never sent. Each piece carries the
separator that followed it, so rejoining moves not one character of what was not
translated.

Paragraphs are translated one by one and **shown as they arrive**. Waiting for a
long stretch of thinking to finish would leave the screen unchanged for tens of
seconds, so each paragraph is swapped in as it lands and the rest stay in the
original. A paragraph that failed stays in the original too — losing the whole
body to one failed paragraph is the worse outcome — and failures are not
remembered, so a helper that comes back is tried again the next time the item is
opened.

A paragraph that is already Japanese is never sent. The test is a **ratio**: past
a tenth of Japanese characters the paragraph counts as Japanese. "Skip anything
with one Japanese character in it" would leave a whole paragraph of English
thinking untranslated because someone was quoted in it.

## A type's display attributes

**Where an item is drawn, and how far open, is decided by its type** (`src/timeline/display.ts`). There are two axes and no more:

- **top** — whether it stands on the timeline's top level. An item that does not joins the run beside it, and a run becomes one fold (`N item`)
- **open** — whether it is open by default. For an item inside a fold that decides whether the enclosing fold opens; for an item with a body of its own (a message, a thinking block) it decides whether that body is open

**The table has two faces, one per subject** (`main` / `sub`). The same `tool.Bash` is something that happened beside the conversation when the subject is the session, and is **what the worker did** when the subject is a worker — two reasons to read, so not one default. The built-in defaults come in two faces as well: main stands the conversation and the thinking up with their bodies and folds the tools away; sub stands the tools on the top level one line each and keeps their bodies closed (a worker is opened to follow what it ran and read, and opening the bodies fills the screen with one of them). Which face applies is decided by **the subject of the transcript being read** — a sid alone is main, an agent named is sub. Inheritance is closed within a face; nothing is inherited across one.

**A setting is inherited down the type name.** Names are `.`-separated, so a value set on `tool` reaches `tool.Bash`, and a value set on `tool.Bash` overrides that one alone. A type with nothing set falls to the built-in default. **Each axis is set independently**, so `tool.Bash` can move one axis while still inheriting the other. Types are an open set the harness keeps adding to, and a flat list has nothing to say about a name it has never seen — a hierarchy always has an answer, the one its root gives.

**The values are kept per face** (`ccmsg.timeline.display:<main|sub>`). "Fold the thinking away" is how a reader reads, so it is split by neither instance nor session (see the key discipline below). A stored value that will not parse is dropped entry by entry: one type's value being unreadable is no reason to lose what was set on the others.

**The panel opens on the face in use and switches to the other with a tab**, so how a worker reads can be decided before one is opened. What it lists is the types the built-in defaults name, plus the types this screen has actually seen (and the types above them). Listing types ahead of seeing them would be rows for what this instance never emits. An inherited value is drawn faint, clicking it sets it on that type, and "継ぐ" drops it back to whatever the type above — or the built-in default — says.

## Reading one agent as the subject

What the parent's transcript holds of a worker is the brief and the answer; **what it ran and what it read is only in the worker's own transcript**. `/s/<sid>/agent/<agentId>/timeline` reads that one as the subject.

**Reading is `transcript.items.read` with `agent_id` added** and nothing else: the item types and the way a range is cut are the session's. Types are defined relative to the subject (`message.user.in` is the brief its parent gave it), so the vocabulary stays and only the subject moves. The raw record is reached the same way, by `agent_id` on `transcript.read`.

**The tail is not followed.** What carries appended items is `transcript.items:<sid>`, and that topic is **the session's**. The contract has no topic for an agent, so an agent's screen opens no subscription and only reads — subscribing would mix the parent's transcript into the worker's. The screen says so, and says that re-reading shows what has since been written.

**Only the timeline is under an agent.** The files, the terminal and the state are the session's, and an agent has none of its own. A URL naming another tab under an agent is a 404 rather than a silent fall back to the timeline, which would lose what the link that was sent actually pointed at.

**The way down and the way back are both drawn.** A row whose `message.sub.out` / `message.sub.in` / `tool.Agent` carries an `agent_id` offers to open that worker, and the worker's screen offers its parent. Which of the two items the id was written on is not the question, so both ends of the row are looked at.

## Drawing: Markdown and highlighting

Text an agent wrote is **read as Markdown**. The mdast tree (`mdast-util-from-markdown` plus the GFM extensions) is walked into JSX by hand, with no HTML-string stage in between. Nothing uses `innerHTML` or `dangerouslySetInnerHTML`, so escaping a body that contains `<` or `&` is what Preact's text nodes already do.

**Text a person typed is read by different rules** (restricted). `#3 の件` is not a heading and `<R G B>` is not an HTML tag. What people use on purpose is inline code, fenced code and quoted lines, so restricted reading interprets those three and shows everything else as the characters they typed. It tokenizes the source directly rather than walking the mdast tree and flattening it back, because the round trip loses the original characters (whether a `#` was eaten, the exact spacing inside `_foo_`).

**A link target lands in one of three places.** http/https/mailto open a new tab; a `#fragment` and an absolute URL naming this same origin open in the same tab; everything else — a scheme like `javascript:`, and any filesystem path — emits **no `<a>` at all**. Turning a path into an origin-relative `href` navigates to the origin serving this page with no way back (a standalone PWA has no address bar to recover with). Images take the same decision and are never auto-fetched through `<img src>`: rendering alone would send the viewer's IP and UA to a third party, so the alt text and a link are offered instead and the person chooses.

Code highlighting loads Shiki as a **lazy chunk**. The engine and every grammar are taken by `await import()` inside `getHighlighter`, so a session with no code fetches none of it. Only the language table and the size threshold are eager, and they are what lets a caller decide whether to highlight without paying for the highlighter. Each token carries both the light and the dark colour and CSS picks one, rather than tokenizing again per theme.

## Fold state lives outside the folds

Whether a fold is open is held **outside** the component drawing it (`src/timeline/fold-open.ts`). The window moves and components unmount, and a fold that came back closed for that reason reads as the app forgetting what the reader did.

**One signal per key**, not one signal holding a map. A component reads the key it draws, so opening one fold leaves the rest of the timeline alone — which is the reason the state is out there at all.

**Only folds the reader touched are recorded.** Absent means "still at the caller's default", which is how a change to a type's display attributes takes effect without the store knowing what any fold's default is: changing them drops the overrides.

**A closed fold's body is not drawn, but a body once drawn stays.** Most of a transcript lives inside a fold, so drawing every closed body would mean rendering — and highlighting — a whole session to show the few lines anyone is reading. Discarding a body on close would instead make closing a fold mean throwing away the work of having opened it.

## Files: the tree, the file, and the links

The files screen answers three things: where things are (the tree), what is in one (the file), and where a path written in some text points (the links).

**How a path is spelled is which surface it is reached through.** The contract spells `contained` paths relative to the session's root and `workspace`/`external` paths absolute (contract `files.ts`), so a leading `/` is the whole of the distinction — which is why the tree's keys, the stored selection and the URL are all the same one string. A relative path can only be `contained`; **the surface of an absolute one is asked for** with `file.stat`, since `workspace` and `external` share a spelling and only the instance can say which admits it.

**The tree is asked for one level at a time**, as it is expanded (`dir.list`). What comes back is a copy of a moment rather than a subscription, so re-reading is a button. A refusal is remembered as an answer too — otherwise a row reads `loading` forever.

**The URL is the record.** `/s/<sid>/files?path=<p>&lines=<a>-<b>` names the open file and the lines being pointed at, so a link shows its reader the same thing. Opening a file is a navigation; the lines live in the query because a path contains slashes and a path segment cannot. **Named lines beat what was remembered**: whoever sent the link was pointing at lines, so both the stored view mode and the stored scroll position give way.

**There is no next page.** `file.read` answers up to the instance's read limit (512KiB) and sets `truncated`; the contract gives it no offset to ask for the rest (contract `files.ts`). So the head is shown with a banner saying why it stops there — cutting it silently would read as "that is the file".

**What is outside the project is a trail, not a listing.** The `external` allowlist is the files this session's transcript named, and the contract has no op that enumerates it (only `file.stat`, which answers about a path already in hand). What the tree shows is therefore the absolute paths this browser has actually opened for that session.

**The line between the tree and the file can be moved.** It is dragged, and it also takes focus and moves with ← and → — WAI-ARIA's `separator` is a role that is expected to answer arrow keys, so being draggable is not the whole of it. The width is remembered per instance (`ccmsg.layout.split:<instance>`), for the same reason as the key discipline below: one store is reached by several instances. It is written only when the pointer is let go; the widths passed through while dragging are not worth keeping. A value that does not read cleanly, or one outside the range, is the same as none and the CSS default is used. On a narrow screen the two panes stack and there is no left-right line to move, so the handle is gone with it.

**A markdown file's view mode is one last choice per session.** Kept per path it would be lost to opening a single `.ts` in between — `.ts` has no answer to "code or preview", so it must not overwrite one.

## Searching what is on screen

The search covers **what this page already holds** — the stretch of the transcript that has been read, and the file that is open. Nothing is asked of the instance (DR-0022). The browser's own Cmd+F cannot see inside a collapsed fold and does not open at all in a standalone PWA, so `/` and ⌘F are taken by this box.

Whitespace within a query line separates AND terms and newlines separate OR clauses. A double-quoted phrase is one term whose internal runs of whitespace match `\s+`. `[Aa]` and `[.*]` switch case sensitivity and regular expressions on. **That grammar belongs to the page, not to the contract**: the contract states what a daemon and a client say to each other, and how a string typed into a search box is read is not one of those things.

What is counted is what the page holds, not what is currently drawn. A match inside a closed fold is in `[N/M]`, and stepping to it opens the folds enclosing it first (`fold-tree.ts` answers which). The unit is **one item** (with the answer folded into it), named by its id — so reading backwards, which grows what is held at the front, never makes the same number mean a different item. In a file the line number is the name, so the count and the navigation belong to the code view; the preview highlights too, but a paragraph has no name to move to.

A counted match must be a match the reader can find, so the text searched is the text as shown: a tool call is drawn as one shortened line, and that shortened line is what the query runs against (`item-view.ts`). Searching the full text held would produce "[3/12] with no third match to look at".

Highlighting happens two ways. Prose is split at render time and `<mark>` put in (the `text` case in `markdown-view.tsx`). A highlighted code line is already a list of spans, so the same split is projected onto them and the spans are re-cut (`splitSpansForHighlight`), which is what keeps a match that crosses a colour boundary from erasing the colour. Both ways emit the same `<mark>` (`ui/search-marks.tsx`), so a file and a code block inside markdown light up alike. Code still waiting for its colours is lit the first way and switches to the second when they arrive.

## The conversation lives on the Timeline

There is no separate screen for talking to a session. **The session's own transcript is the record of the conversation**, and the screen that reads it already exists. The two directions look different in there.

- **person to session**: `message.send { to: sid, text }`. One sid is the whole address; there is no room. What arrives shows up in the session's own user turn, wrapped in a `<cross-session-message>` envelope
- **session to person**: the `ccmsg reply <mid> <text>` the session runs. A reply with no `--to` is for the person, and the instance turns it into a notification

**Enter is a newline; sending is ⌘/Ctrl+Enter and the button** (`src/conversation/composer-keydown.ts`). A newline going in where it was typed matters in more places than sending in one keystroke does — on a soft keyboard most of all, where Enter-to-send turns the hand that starts a paragraph into the hand that sends. An Enter that ends an IME composition does not send even with a modifier held: it is the keystroke that settled the characters, not one that meant to send.

Both directions reach the screen as one type, `message.session.in` and `message.session.out`. Reading the envelope back, and taking the body out of the Bash command a reply is sent with, are the instance's work — it holds the file, and a second copy of the same grammar here would keep reading the old spelling after the contract moved.

## The quota is the gateway's, the ring is the session's

Everything about the LLM gateway is decided by `hello`'s `capabilities`. Without
`llm_usage` the quota op is never called; without `llm_status` or `llm_events`
those topics are never subscribed to — asking an instance for what it does not
have earns a refusal, and a refusal is not worth putting on screen. On an
instance with no gateway in front of it, the entry in the connection bar is not
there either.

The screen is in two layers.

- **Always there**: the entry in the connection bar, coloured and marked only
  when there is **a known problem** upstream (`llm.status`'s
  `overall.severity`). Healthy and unknown say nothing — a mark that is always
  showing stops meaning anything by showing, and turning the bar red for
  "unknown" would let one provider that publishes no status page make the whole
  host look broken
- **The detail** (`/usage`): the upstream services first and the quota after.
  When the numbers stop moving, upstream is the first thing asked, and how the
  quota below reads depends on the answer

**Every verdict is the gateway's.** No severity is re-derived here from the
official signal (what the provider says) or the observed one (what this gateway
saw when it called) — a second opinion would disagree with every other reader of
the same report. What this build owns is the wording and the order, and the two
signals keep separate columns: "稼働中" is a claim, "疎通" is something that was
done.

**The probe goes out only when someone presses it.** As the contract states, only
a `refresh` asks upstream again, and only it can spend upstream rate limit (an
account already at its limit answers the probe with that credential's error). The
periodic read touches nothing but the snapshot the gateway keeps — which is why
a credential's limits appear only after the press: they ride on no other answer.

A bar draws **what has been spent over how much of the window has passed**. The
share alone cannot be read for overspending: 50% with a fifth of the window gone
and 50% with nine tenths gone are different situations, and the difference is
only on the clock. Running ahead earns a colour past five points of it — usage is
bursty, and a strict comparison would light half the rows half the time and stop
meaning anything. A reading from a window that has since rolled over gets no
colour at all: the provider has said the counter reset, so a `rejected` from
before that is not a statement about now.

The prompt-cache ring (`src/llm/cache-ring.ts`) is **one CSS animation**, started
mid-flight with a negative `animation-delay`. Ticked from JavaScript it would
cost one piece of work per second per session. A full sweep is the whole window
rather than a fixed five minutes: the gateway asks for five-minute and hour-long
caches alike, and a ring that always drained in 300s would read as "expired" for
the 55 minutes an hour-long window still has. What the ring says is the
**fraction remaining**; an exact duration belongs to text. The window the
conversation built and the chain the keepalives have been rebuilding get
different colours, because what is running down is a different thing — and the
chain is drawn **only while the window is still alive**, since `cache_until_at`
is a projection of keepalives yet to be sent and a gateway that stops sending
them must not leave a ring running for the hours that projection reached.

## The terminal is borrowed, not built

A session's own terminal can be opened from here. **Drawing it is not this build's job**: the page borrows the screen of the gateway the instance names in `hello` (`terminal_gateway`) in an iframe, and holds neither the rendering nor the input. Holding them would be a second implementation of the same thing.

**The URL is two values put together.** The gateway's base and the `terminal_id` the session names on the `agents` topic make `<gateway>/sessions/<terminal_id>` (contract `hello.ts`). Everything below `/sessions/` is the gateway's spelling rather than the contract's, so a base that carries a path keeps it and the segments hang below it, and a base that arrives with a trailing slash names the same gateway. Nothing is made from a base that is not http(s) or where either value is missing — a link to nowhere is worse than no link.

**A tab that leads nowhere is not offered.** Where the instance fronts no gateway, or the session names no terminal, the tab itself is absent (`visibleTabs`). The URL grammar still reads it: a link made where the terminal was reachable is not a broken URL where it is not, and lands on a screen saying so rather than on a 404.

**Only `agents` rows name a terminal**, and the shown `agents` list drops the rows the peer list already carries. So the map is built from the rows before that is done (`terminalIdsBySid`) — the session whose terminal a person wants is very often the one that is connected right now.

**The embedded URL and the plain one differ.** The tab's iframe asks for `?embed=1&resize=1`: the gateway drops its own header, and follows the frame's size rather than a stored choice, an embedded page having nowhere to offer that choice and nowhere to keep it. The link on a list row is the gateway's own screen, so it carries neither and opens in a tab of its own — the terminal can be looked at without losing the list.

## Nothing is kept for a notification

A `notify` frame is an event, and the contract keeps none of them. Neither does this page: they live in memory and go when the connection does. The bubble at the end of the Timeline is **the moment before the transcript catches up** — once the same answer is written there, that is the record (which is why the bubble is dashed rather than as solid as a settled line). The topbar shows the latest one as a toast, so a notification is noticed whichever session is open.

## A session that cannot be reached offers no composer

The composer is enabled for sessions the instance currently reports as connected. A `message.send` to a stopped session is refused, so the page says that it cannot be sent and why (ended / gone / not connected) rather than letting the person find out from a refusal.

A send that goes through has two successes to tell apart: handed over now, or held in the inbox. Being held is not a failure, so the wording says which of "wait", "send to another session" or "give up" this is (`src/conversation/send-outcome.ts`).

Neither is a message too large to send. The contract's `MAX_FRAME_BYTES` is a ceiling **the sender keeps to**: a line over it is answered `bad_request` and the connection stays up, and all that refusal can say is that it was too big. So the line about to be sent is measured in bytes and stopped here instead (`src/frame-limit.ts`). What to do about it — split it, write it to a file — is the sender's decision, so the page suggests and does not choose.

## A person cannot see an inbox

The contract's `TOPIC_ATTRIBUTES` opens `inbox` to `["session", "user"]`, so a connection made as a person may subscribe. **The subscribe succeeds and no frame ever arrives** (measured against v0.0.29: `topic.subscribe` answers ok, and neither a snapshot nor a delta follows). The daemon's reason is plain — the topic carries what was said to a session, and a person is not one: the snapshot is looked up by the connection's sid, and a delivery is pushed only to connections holding the addressee's.

Nor does a `peers` row carry a count of what is waiting. In this generation of the contract there is **no way for a person to learn how much an instance's inbox is holding**.

What can be shown is what this page sent and has not seen handed over. The reply to `message.send` (`delivered: false` and its reason) is the only primary source there is, so it is written down at that moment and shown as a badge in the session list and a list above the timeline (`conversation/held-messages.ts`). It lives in the page's memory and goes with the connection: with no way to confirm delivery, persisting it would only manufacture stale notes about messages that have long since arrived. "Dismiss" on the list is a person deciding to stop caring, not evidence that it landed.

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
- **Signing in** is what one press of 接続 runs through: the token in memory, then the refresh cookie, then the passkey, without stopping to be pressed again — a browser only asks for a passkey while the person's press is still live, so connecting and authenticating happen in one act. A load runs only as far as it can without them (a cookie connects; nothing leaves the page offering to connect), and says nothing about authenticating until an attempt has been made. Registration is offered **at the moment** a passkey prompt produces none, since registering starts at a terminal and is not work for someone who already has one. No credential is named: a resident passkey answers with its user handle, and which subject that is is the instance's to look up. What is asked for is **a passkey registered for this endpoint**; another host or path prefix is a registration of its own
- **Extending** works off `auth_expires_at` from `hello`, which is the connection's deadline. At a tenth of it left, `/auth/refresh` mints a token and `auth.extend` moves the deadline **on the same connection** — there is no reason for the screen to blink every few hours

The token is fetched again on every attempt to connect (`Connection` holds a `TokenSource` rather than a value). A token that expired while a connection was down turns into a refresh in that one place, and nothing else knows it happened. A handshake that was refused asks for the token again too, saying so: what the page holds is the family's token and not its own, so an expiry it reads as live tells it nothing about whether the token still stands. When there is none to be had the attempt **stops there**: nothing a timer does opens a door that authenticating opens, so the passkey screen is raised and the next dial is the one the person asks for.

The bar's button says **whether this page means to be connected** (`wanted`); the word beside it is what the socket is doing, which passes through closed and back while a retry runs. Holding the intent apart from the state is what makes pressing the button always do the thing it says.

## Tabs of one session refresh together

**An access token belongs to the family, and every tab the person has open presents the same one** (DR-0001 §2.4). Tabs that refreshed on their own would each rotate the family and take the token out from under the others, so they coordinate in the browser (`src/auth/tab-share.ts`):

- The refresh — `/auth/refresh` and the `auth.extend` that follows it — runs inside `navigator.locks.request()`, so one tab of a session does it at a time
- What it settles on goes to the others over a `BroadcastChannel`, **in memory**: an access token is not written to a store, here as anywhere (see the table above)
- The tab holding the lock **asks the others** on the same channel before it refreshes, and takes the first token that comes back. Asking rather than only listening is what makes this reliable: the lock and a message are handed over by different queues, so what another tab broadcast may not have arrived yet — and what it broadcast before this tab was opened never will. A tab that nobody answers within the round trip is the only tab of its session, and refreshes
- A refused handshake tries the newest token another tab passed on before it refreshes at all
- Without the Web Locks API each tab refreshes for itself. That is the behaviour this improves on rather than one it depends on — the instance's standing token is what makes separate refreshes converge

Names carry **the endpoint and the subject** (`ccmsg.auth.refresh:<endpoint>:<sub>`, `ccmsg.auth:<endpoint>:<sub>`) for the same reason the localStorage keys below do: one origin serves several endpoints and one endpoint several people, and tabs that are not the same session have nothing to agree on. A tab that has not authenticated yet knows no subject and listens on the endpoint alone until it does.

## localStorage keys name what they belong to

A browser holds one store for the site while one person reaches several instances through it, so what a key names is decided by **whose the value is**.

- **Neither a secret nor the endpoint is kept here** (above)
- **What would collide names its instance (and its sid)**: a lock, a channel, a session's state — values where the same name on another instance means something else. One store reaches both, so without the names apart one would read the other's.
  - per session: `ccmsg.<feature>:<instance>:<sid>`, two levels (an agent drilldown adds `<sid>/<agentKey>`). An unsent draft (`ccmsg.draft:<instance>:<sid>`) and what the files tab remembers (`ccmsg.files:<instance>:<sid>`) are this
- **A preference about reading is one for all of it**: a type's display attributes (`ccmsg.timeline.display:<main|sub>`) name neither an instance nor a sid. "Fold the thinking away", "stand the tools on the top level" is **how this person reads**, not a fact about which instance or session is open — splitting it per instance would mean deciding how to read again every time the same person opens another instance. What it does split by is the subject's face (main / worker), because there the reason for reading differs

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

## Tests

**Two runners share one `test/` tree.** `bun test` reads `*.test.ts` and pins the pure layers — how the contract folds, the URL grammar, the ordering of the list, the jsonl mapping — with no browser. Playwright reads `*.visual.ts` (`test/visual/`) and compares **what was drawn** against a baseline image. The names differ because `bun test` claims the usual `*.spec.ts` as its own.

### What the visual comparison stands on

It runs against the real thing: **one daemon is actually started** against a disposable config home, the dev server stands where a reverse proxy stands in a real deployment, and the browser **really registers a passkey** through a CDP virtual authenticator. Only the finger is simulated — the registration and every signature go through the daemon's own verification. Sessions are connections that greet as sessions rather than a running harness: a real Claude Code puts a pid, a clock and somebody's own paths on screen, and none of those can be a baseline.

**The whole comparison rests on the same picture being drawable twice**, which is why the disposable paths and ports are fixed (`test/visual/instance.ts`): the endpoint and the instance id on screen are derived from them, and a temp directory with a random suffix would write a different string every run. The instance's id is laid down before the daemon can make one, the transcript is a fixture with its instants written out, and the one place left — the stretch of the connection bar counting down to an expiry — is masked.

### The baselines live in another repository

The images are in `kawaz/ccmsg-webui-snapshots`; what this repository keeps is their digests (`test/visual/manifest.json`). A baseline's worth is its history — the same screen, version after version — and that is too heavy for everyone who clones the source to carry. What the manifest answers is whether the baselines being compared against are the ones this version accepted; a screen that actually changed fails at the comparison itself, with a diff image.

**A baseline belongs to the platform that drew it** (`{platform}/<screen>.png`). Fonts and font smoothing differ between a mac and a CI runner, so everywhere there is text is different, and no threshold absorbs that. Drawing one set inside a container is the alternative, and it costs `just visual` a dependency on docker.

- `just visual` — compare what is drawn now against the baselines, and check them against the manifest
- `just visual-accept` — take what is drawn now as the baseline and commit it to the snapshots repository (pushing is a person's). The manifest is left in the working copy, to go into the commit that changed the screen

It is **not** part of `just ci`: what it needs is different (the daemon's source, a browser binary, the baseline repository), so CI runs it as a job of its own.
