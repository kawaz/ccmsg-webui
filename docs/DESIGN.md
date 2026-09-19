# ccmsg-webui design

> 🇯🇵 [DESIGN-ja.md](./DESIGN-ja.md)

## Domain

What this repository holds is **one reader of the contract**. It folds what the daemon pushes into something to look at, and turns what a person does into ops. The domain's vocabulary — what a session is, how its classification is decided, how a topic folds — lives in the contract and is not restated here.

This page is a static site published at an origin of its own, and what it dials is an instance published at a URL of its own (contract `Endpoint`) — the same host in the deployment where a daemon serves the UI behind one proxy, and a different site anywhere else. **Being two addresses rather than one is where the design starts**, and three things follow from it.

- **The instance is stated, not inferred.** Where to dial is typed at the connection bar and kept between visits, and this page's own address is only what the field starts filled in with (`src/auth/endpoint.ts`). The two are never compared with each other: a passkey answers for the origin it was made at, and which instances its holder may enter is an ownership record's answer (contract DR-0030)
- **Who may enter is a passkey.** What answers who has come is the access token; there is no origin allowlist (below)
- **A different generation is not spoken to.** There is no compatibility path; the page asks for a reload (contract, "版と互換")

## Layers

| Layer | File | Responsibility |
|---|---|---|
| connection | `src/connection.ts` | the socket's life, `hello.user`, correlating replies to requests, reconnection, restoring subscriptions |
| fold | `src/topic-fold.ts` | folding topic frames into what is held, by the contract's `granularity` |
| state | `src/state.ts` | the signals, and the functions that are their only writers |
| derived | `src/sessions.ts` `src/runs.ts` `src/route.ts` | ordering, sections, display names, what an address naming a run asks for, the URL grammar (pure) |
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

**What scrolls is the body's pane** (`src/layout/scroller.ts`). The arithmetic needs three things — where the view is, how much of it is seen, and how far it reaches — and which scroller those are read from is outside the arithmetic. They are read from the pane rather than the page, because a single page-wide scroll is set by the list standing next to it as well, and on a day the list is the longer of the two, "the end" becomes the end of the list rather than the end of the body. What scrolls is the pane itself and not a box inside it: a box closed in around the text leaves the margins around it dead to a wheel, and those margins are most of the screen, while the pane is everything the body has to work with and takes those margins with it. Two things have to be held in place for that to work: **the composer stays at the bottom of the pane** and **the search bar at the top** (`position: sticky`). Both are operated from wherever a person has scrolled to, and letting them flow away means going back to the end to type.

**The anchor is ours, and the browser's is turned off** (`overflow-anchor: none`). A browser's own scroll anchoring holds a position by holding onto an element it can see, which assumes that element stays in the DOM. Under virtualisation a line that leaves the window is removed there and then, so what was held onto disappears and the position jumps — and two mechanisms doing the same job push against each other. It is turned off, and the anchor below is placed here instead.

**Back and forward open at the end.** Restoring a position needs an element to restore against, so a line that is not drawn cannot be returned to. A restoration of our own could put back where someone was reading, but on a transcript that keeps growing that place is **no longer the same place by the time they come back**. The end — what is happening now — is what reopening means here.

**Only what is seen is drawn** (`src/timeline/virtual-window.ts`). Putting the whole held mebibyte into the DOM means drawing the whole window to read a few lines of it. What is drawn is the groups that fall within the viewport and 600px above and below it; the rest is the height of two spacers, one above and one below, which carry the length of the whole window into the scrollbar and hold nothing. What is remembered is the **measured heights**, keyed by a node's name — the id of the item it starts at. A line that has not been measured is placed at the **average of the ones that have**: a tool call shrunk to one line and an open code block differ by an order of magnitude, so a fixed guess gets the spacers wrong. The range is settled when the range changes, not on every scroll event, so the fineness of a finger does not redraw a transcript.

**Either the view is stuck to the end, or it is anchored to one line.** While following, the end is taken again whenever the end moves — a guess replaced by a measurement moves a spacer, so placing it once is not enough. It is not taken again when the end has not moved, because a finger on its way up out of the few pixels that count as the end is in there too. While reading, what is held is the name of the first line a person can see and the distance from its top, and that line is put back where it was both when a page is added above and when a line above it is measured for the first time. It is held by name rather than by index because the window grows at both ends, and an index names a different line each time it does. A height is forgotten when the window lets go of its line — the same moment that line's folds are forgotten.

**How long ago a line is, is read from one clock** (`src/now.ts`). A transcript holds hundreds of lines that each say how old they are, and a timer per line would redraw the screen many times a second to no visible end. There is one timer, and what it hands out is not the time but **the time rounded to each grain that shows**: ten seconds, a minute, an hour, a day. A line reads the one grain its own text is written in (`3m10s` reads the ten-second one, `1h40m` the minute one), so it is redrawn only when the text it shows would change; crossing a threshold moves it to the next grain up at its own next tick, once. Seconds are shown in tens because a line that ticks every second is a distraction, and the question a transcript answers is how long ago, not exactly when. A line reads its grain only **while it is on screen** (`IntersectionObserver`): most of a long transcript is not, and a clock read from there costs a redraw nobody sees.

**What could already reach a hidden line still reaches one.** Counting is about what is held rather than what is drawn, as it already is for a folded line, and moving to a match works the way opening the enclosing folds does: the line's place is taken from the remembered heights, the window is moved there, and once the element exists it is centred. That the line is there to be centred is what the spacers guarantee — the height they carry and the place moved to come from the same table.

## Nothing is wider than the window

The window decides the reading width. **What can grow sideways scrolls inside itself and never outside**: a code block and a table each own a scroll container (`.md-code`, `.md-table-scroll`), and prose wraps on `overflow-wrap`.

A `<details>` inside a flex layout has a trap in it. The browser puts an open element's contents in a `::details-content` box, and that box is a flex item carrying `min-width: auto` — an automatic minimum of min-content, so **one unbreakable thing inside it (a table, a long single line) stops it shrinking and pushes the parent wide**. The conversation bubble hit exactly this, by placing the name beside the body. The two are stacked now, so the body takes the window's width as it is given; the left gutter disappearing, and the text starting at the bubble's own edge, is the visible half of the same change.

It shows up only after scrolling back, because what pushes (a table, a code block) is in an earlier page — not because of anything the window computes. So the baseline is drawn **on a narrow screen after scrolling back** (`test/visual/phone.visual.ts`), and it measures, beside the picture, that no element is wider than the window: a broken layout is indistinguishable from an intended one in a picture, while the name of the element that overflowed says who broke it.

## Colour is a vocabulary, and a part writes only the names

The only colours a part's CSS may write are **the semantic names in `app.css`'s
`:root`** (`--bg`, `--surface`, `--border`, `--fg`, `--brand-*`, `--info-*`,
`--success-*`, `--warning-*`, `--danger-*`, `--member-*`, `--tag-*`). No raw hex, no mixes, no
translucent one-offs — a colour that is not in the vocabulary is added to the
vocabulary first (and if it cannot be, it is something to express by other means
than colour).

A step is **one role**. `--surface` is what a part stands on, `--surface-hover`
is while a finger is on it, `--border-strong` says a thing can be pressed. The
same role takes the same shape of name in every colour, so "neutral here, danger
just here" is written by swapping the name.

**Who said a line is a hue**, and the ground, the rule and the text of that line
are all read from that one hue at different steps (`--member-*`), so a line's
colours hold together as one person's. The quieter voice of the same person
(thinking) keeps the hue and drops a step. What kind of thing a line is — a
folded answer, a message not yet handed over, a notice — is said by the shape of
its rule, never mixed into the hue.

**How much a voice weighs is not said in colour.** There are two tiers, and the
upper one holds two voices only: this session and the person. That is where the
thread of the conversation runs; everything else drops a tier, to a smaller type
and the muted step. Within the lower tier the rule is **taken away a piece at a
time**: thinking keeps the full outline and turns it dashed (the same person
said it, more quietly, so the outline stays), a message from another session
keeps only the rule on its left, and a voice handed to a subagent or teammate
carries no rule at all. The amount of rule says how far away the party is, so
the tiers cost no hues. Which tier a line takes is `voiceOf`, a function apart
from `memberOf` — who said a line and whether a line is a place to read are
different questions.

Two hues are picked by a person: the selected session's **main** (`--h-main`)
and the user's. Every other party's hue is handed out by `src/member.ts`, which
stays 15 degrees clear of the four meanings and those two, **never uses a gap
narrower than 30 degrees** (between danger and warning only 16 degrees are left,
and a party placed there reads as a caution), starts from a wish made out of the
party's own name, and **never moves a hue once it is placed** — a colour that shifts as
people arrive is not a colour anyone can learn. The naming sits at step 12 and
the rule at step 8 because a machine places the hue: only those steps meet 4.5
and 3.0 **all the way around the circle**, which `test/color-contrast.test.ts`
checks degree by degree. Those four names are the one part of layer 2 written
outside `:root`, in a `.member` rule: a `var()` inside a custom property is
solved on the element that declares it, so written at the root they would all
read the root's hue and every line would come out the same colour.

Colours that exist only to be told apart (search bands, spend series) come from
an independent family (`--tag-*`) rather than borrowed from the meanings —
borrowed, a green series reads as "healthy".

The values are **computed from inputs**. What a person picks is only the layer-0
block in `app.css` (the brand's hue and chroma, the neutral and semantic hues,
the identification family's spacing); the twelve steps fall out of it through
CSS's relative colour syntax — no colour is computed in JavaScript.

Being readable is **held inside the step table**: text meets 4.5 and a line meant
to be read as a boundary meets 3.0, and the check for that is
`test/color-contrast.test.ts`, which reads `app.css` and works it out (the ratio
cannot be written as a CSS expression).

A step carries **only a lightness**, and both faces sit on the same line:
`--step-9: light-dark(oklch(0.545 0 0), oklch(0.64 0 0))`. The colour is put on
afterwards from the inputs, which is why neutral and meaning ride the same
twelve steps. Which face the page stands in is then said in **one place only**
— `color-scheme`, left as `light dark` for the OS to answer and pinned by
`:root[data-theme="light|dark"]` where a person has stated one. Those two rules
carry no colour at all.

**Choosing is not separable from seeing.** Moving a hue says nothing until it is
visible where it lands, so a section stands beside a **worked example** — the
real parts, drawn in the colours being chosen: bubbles (main, the user, other
parties, thinking, a notice), buttons, links, rows, the four meanings as both a
ground and a fill, the identification family, the connection dots, a code block.
Nothing feeds it: it reads the same `:root` the rest of the page reads, so the
moment an input is written it solves again.

Choosing happens in the **colour section** of the settings screen (`/settings`), in **two tiers**: what stands out front is the face and three hues (the brand, this session, the user), and everything else is led from its default. The detail is folded away and holds **the rest** — the neutral's chroma, the four meanings' hues, the identification family. The same input is not put in both, since two controls of one value read out under one name twice. What it offers is the layer-0 inputs and the face, and nothing of the step table — being readable is held there rather than in what a person picks. The brand is picked with a colour picker and kept as a hue and a chroma, since the lightness is the step's; turning the picked colour into those two is the browser's job through relative colour syntax, not arithmetic written here.

The named sets (standard, warm, cool, plain) hand out layer-0 inputs and nothing of the step table, so being readable survives whichever one is chosen. A set carries no face — a step holds a lightness for each face on one line, so one set already has both.

**What the platform offers now is used, rather than worked around.** The
browsers this is built for are **the latest Chrome and the latest Safari** —
not Firefox, not older versions — so a feature is taken up once it works in
those two and is measured doing so, rather than waited on until it is Widely
available. `light-dark()`, relative colour syntax, `oklch()` and `color-scheme`
are what the colour system stands on.

Why it is decided this way, which features were taken up and which were turned
down, and what was measured, is in
[DR-0001](decisions/DR-0001-colour-is-computed-from-a-few-inputs.md); how the
whole thing is decided (inputs, steps, computation, checks, browser support) is
in `docs/design/color-system.md`.

## Settings are sections, and touching one is trying it

Settings are **a set of sections**, and a section is a set of inputs. There is one today (colour); what comes next is layout, words, fonts, the size of parts, which items a timeline shows — each of them "how this browser should read", not something the instance says. So the screen **asks the instance nothing**: it stands whether or not this page is connected or signed in.

**Touching an input is trying it**, and it is kept only when 保存 is pressed: leaving the screen or reloading puts back what is remembered, so a value moved in order to compare does not stay. A value is held in three shapes — what is remembered, the draft on screen, and **what it is compared against** (the chosen set, or what is remembered). Rows that differ from that base are marked and can each be put back on their own. The comparison is made in one place, and whether a row is marked is read by CSS from whether that row's 戻す can be pressed.

What is remembered lives in **one document**, `ccmsg.settings`, holding each section under its own name. A key per section would mean that clearing, moving or reading them all needs someone who knows the list of sections.

A section says what its inputs are, how they are written down, how they reach the screen, and where two values differ. The sets, the marks, the 戻す and the saving belong to machinery that knows none of that. Adding a section touches the section, the part that draws its inputs, and one line in the screen's list.

Why it is decided this way, and what was turned down, is in [DR-0002](decisions/DR-0002-settings-are-sections-tried-before-they-are-kept.md).

## An operation is an action, and a pane is where keys land

Somewhere to press and a keystroke start **one and the same action** (`src/actions/`). An action holds an id, a title and, on the dangerous ones, a mark (`catalogue.ts`) — and no implementation at all. "Can it run now" and "run it" are held by **whichever scope volunteers**, so the same id can have a different answer in each place. What a person learns is one word — "next", "search" — and where it lands is decided by what is standing.

**The scope tree is the component tree.** A part that is a pane names itself `<Pane name="tl.body">` and nesting is parenthood (`src/ui/Scope.tsx`). No diagram is kept beside it, because the diagram is what goes stale and nothing breaks when it does. There are nodes with no layout of their own (`Holder`) — a row in the list is one: a button inside the row reaches the handler that acts on **that row**, while a keystroke climbs from the pane and reaches the handler that acts on **the row under the cursor**. Same id, same title, different handler.

**What is standing is app state**, not DOM focus. Focus comes off in too many ways here — a click on the margin, an embedded terminal, an `autoFocus` field. Focus decides one thing only: whether characters are being typed, and while they are, no keystroke is offered to an action. The direction is **state → DOM**: focus is moved to the standing node because focus is the only thing that tells a screen reader which pane is live. Inside a pane a roving tabindex means tab reaches the row under the cursor and no other.

Starting an action **climbs from the inside out** and stops where a handler is found. A handler that cannot run right now passes it outward — if nothing is chosen in the transcript, the list's "next" moving is closer to what was meant than nothing moving. What must not pass outward carries the `destructive` mark and stops there instead. When no handler is found at all, **nothing happens** (no `preventDefault`), so the browser's own hand survives.

A dangerous action's whole responsibility is **opening the confirmation**. What ends the session is the decision inside it, and since a key and a button go through the same single action, no path skips it. The confirmation is a pane with a node of its own: opening it makes it the standing pane, and closing it hands the standing back to where it was.

The standing pane carries a **thin edge**, in the same colour name as the focus ring — "keys land here" is one meaning, so there is no reason for a pane's edge and an element's ring to be different colours.

The keys a pane holds as part of being that pane are not the key table: up and down in a list, deciding to open, up/down and PageUp/PageDown in the transcript body, `/` per pane. They sit where a `separator` moving under ← → sits — what closes inside a part, and so never appears in the table. In the list **← means one step outwards**: from a session to its section heading, and from a heading to folding it. The table a person bound is consulted first, so wanting up and down for something else is never blocked by a pane's own role.

The current platform is a mac if **either** `userAgentData.platform` or `navigator.platform` says so. They disagree in real setups — an automated Chromium answers `Windows` to the first while running on macOS — and reading a mac as something else resolves `CmdOrCtrl` to Control, which leaves every binding meant for ⌘ dead while taking Control's own.

**Only signals may be read by "can it run"**. Somewhere to press asks that during render, so reading anything else leaves nothing to tell it that it became pressable (a button whose props did not change is not redrawn).

Platform features are taken where they save writing it here. The confirmation is a `<dialog>` opened with `showModal()`: the rest of the page going inert, `Escape` closing it and the top layer all come with it, so no `inert` of our own is applied. The fold marker on a section heading is CSS `content`, which keeps the heading's **text** the heading's name — nothing reading it, a test or a screen reader, reads the marker. **Invoker Commands (`command` / `commandfor`) were not taken**: a button naming what it starts in an attribute fits, but `commandfor` points at an **element**, and what is needed here is "climb from the standing pane and find the handler". Pressability and the title are read off the action as well, so the path goes through JS regardless.

Why it was decided this way, and what was turned down, is in [DR-0003](decisions/DR-0003-an-action-is-what-a-key-and-a-button-both-reach.md).

## Key bindings are one settings section

The key table is one settings section (`src/actions/keys.ts`) holding **a spelling → an action id**. The table knows nothing of the actions themselves, so an id this build no longer has costs that one row and nothing else. What the settings screen lists is **the actions** — a person looks for "I want a key for this", not "what was this key again" — and the titles come from the actions, so adding one costs the screen nothing.

One keystroke has three shapes. **What is stored is `{ code, modifiers }`**: `code` is `KeyboardEvent.code`, the physical position a layout cannot move, and the modifiers are a set, which is where order and duplication are normalised. **What a person writes is `CmdOrCtrl` / `Cmd` / `Ctrl` / `Alt` / `Shift`.** `CmdOrCtrl` **resolves to one modifier** on the current platform; it is a substitution, not a disjunction — on a mac, Control belongs to terminals, Emacs-style hands and VoiceOver, and firing on both would take those too. **What is shown** is the resolved shape (`⌘⇧K` on a mac, `Ctrl+Shift+K` elsewhere). The settings field keeps the spelling itself with the resolution beside it: symbols alone cannot be copied into a setting, a spelling alone does not say which key, and the resolution shown beside it is what makes the substitution visible.

A binding can be **limited to one platform** — not because a key is missing. Whether a key can be pressed is decided by the keyboard in front of the person, and a key that is not there is never pressed, so nothing has to be said about it. What needs the limit is **a key both platforms have that only the browsers treat differently**: `Ctrl+F` is the browser's find on Windows and nobody's on a mac. The limit applies before the clash check, so binding `Ctrl+F` on macs alone passes without touching ⌘F, and on every other platform that row simply does not exist.

A combination that clashes with the browser is **not forbidden; it is one of two things**. A **warning** says what would be lost and passes once `force` is set — there is no reason to take ⌘F away from someone who does not use it. A **reservation** is a keystroke the browser never delivers, and `force` cannot change that: rather than refusing it, the screen **says that it can be set and will not work**. When a binding does nothing, nobody can tell a typo from the browser unless the screen says which it is. The reserved list comes from **Chromium's own source** (`IsReservedCommandOrKey` and the accelerator tables); Safari is closed, so its side is the published shortcut list and the menu definitions plus a small number of observations of what reaches the page (DR-0003 §2.5). A keystroke one of the two does not deliver is treated as reserved.

**A keystroke typed while an IME is composing reaches no action.** `isComposing` and `keyCode === 229` are dropped, and since Safari delivers the Enter that settles a composition *after* `compositionend` with `isComposing: false`, the one Enter or Escape immediately following is counted as part of settling too. The gate is one for the whole page (`src/actions/ime.ts`), and what closes inside a field (sending) consults the same one — asked twice about one keystroke it answers the same, because consuming the mark on the first ask would make the settling keystroke look real to the second.

## The parts, and what each of them holds

So that changing one thing means touching one place, every layer states what it
**holds** and what it does not. When it is unclear where something belongs, ask
which layer would have to change if it changed.

| Part | Holds | Does not hold |
|---|---|---|
| `App` | reading the shape (`phase`) and switching on it | deciding the shape (= `src/phase.ts`), arrangement, screens, reading |
| `Shell` | the arrangement once connected: the nav, the notices, the two panes, the footer | which screen, what is read |
| `ConnectionBar` | the endpoint and 接続, **before connecting** | what is in the list or the body, ways into other screens |
| `GlobalNav` | the ways into other screens once connected, the connection's mark, the standing reload | what the connection is made of (= the account screen) |
| `Panes` (inside `Shell`) | where the two panes sit, the remembered divider, the narrow-screen slide | what is inside them |
| `Splitter` | grabbing, arrow keys, reading and writing the remembered width | what the two sides mean (its label and key are given to it) |
| `SessionList` | the sessions and what a row can do | the screens, the layout |
| `Main` | **URL to screen** | what a screen reads, the layout |
| each screen (`Timeline`, `Files`, `Status`, `Usage`, `TerminalPanel`) | what it reads (topics, ops) and how it draws it | where it has been placed |
| `Settings` | the sections and their inputs | anything the instance says — it reads none of it, but **the way in exists only once connected** (see "shape" below) |

**The list tells "not heard yet" apart from "nothing there".** The sessions and the terminals arrive separately, and a harness that has started without naming itself yet is only in the second. Until both have arrived an empty list says it is still listening rather than that there is nothing. Having heard both is on the pane as well (`data-settled`): whether the contents are still arriving is knowable only from the state, so what takes the pictures reads it too.

## The list and the body sit side by side, except where they cannot

The page is the nav along the top (`GlobalNav`) and two panes
below it: the list on the left, whatever the URL names on the right, and a
divider that can be dragged (`src/ui/Splitter.tsx` — the same part the file tree
and file body use; only the label and the key it remembers differ).

**The body has no maximum width.** A wide desk reads wide and a small device
reads narrow: capping it would be a claim about the right width to read at, and
that is the reader's to make.

Both panes are as tall as the window and **scroll separately**. Sharing one scroll lets the longer of the two set the height of the shorter — on a day the list is the longer one, the body's "end" becomes the end of the list.

On a narrow screen they are **not** side by side. The two stay in a row and the
row slides to whichever is being read (90ms — the shortest slide that still
shows which way it went). Which one that is comes from the **URL**: the list
while the list is what is named, the body otherwise, so no second piece of state
has to agree with it.

The nav's 一覧 means different things at different widths: fold or unfold the
left pane where they are side by side, and go back to the list where they are
not. **Which of the two is the CSS's to say** (the width threshold lives in one
place and is read at the moment of the press). Whether it is folded and where
the divider sits are remembered in localStorage — the first is this browser's
preference, the second is per instance, since how much room one wants depends on
who is being read.

## One value decides what the whole screen is

What form the page takes is answered by `phase` alone (DR-0004). The rule is
`phaseOf` in `src/phase.ts`, and the one line handing it its material (the
signals) stands in `src/state.ts`. `App` switches on the answer and **nothing
else decides the shape** — two places deciding it means an order of precedence
nobody is checking becomes the ruling. That nothing else reads it is held by a
test rather than by prose (`test/phase.test.ts` walks `src/ui/`).

| Shape | What it is | Root of the tree |
|---|---|---|
| `offline` | there is somewhere to state an address, and nothing is connected | not connected |
| `registering` | an enrolment URL was opened | not connected |
| `authenticating` | standing where a passkey is asked for | not connected |
| `connecting` | opening the socket (the greeting included) | not connected |
| `receiving` | the socket is open, the list's snapshot is not here yet | not connected |
| `live` | there is a list, and somebody to talk to | connected |
| `stale` | there is a list, and nobody to talk to | connected |

**"Not connected" means "no list is standing yet"**, not that a line is down.

**Before connecting the bar is the whole of the page** and holds the address
and 接続 and nothing else. Settings, the account and usage are not there — every way offered
to somebody who has not connected is one more way that is not connecting.
**After connecting there is no band**: the ways into other screens are in
`GlobalNav`, what is being dialed is in the footer at the smallest size, and the
connection's state is one mark in the nav. The instance, the daemon's version,
the contract generation, who is connected and when this connection's
authorization runs out belong to **the account screen** — kept on screen always,
they would be a string taking up the width for the many hours it decides
nothing.

**The reload stands in every shape.** A PWA added to the home screen has no
reload of the browser's own, so without this one there are devices with no way
to load the page again. **When the contract generation does not match, that
button changes colour** — there is no band and no automatic reload, because what
is on screen is not this page's to hide or throw away.

**`stale` keeps both the screen and the URL.** A dropped line is retried while backing off — a refresh that never arrived (`unreachable`) is one of those, because not reaching the instance is not the same as being refused by it. Only a lost authorization (`auth_invalid`) raises a passkey over the middle of the screen. Taking it reconnects in place, and the workspace behind it never moved. **That request can be closed**: `stale` is a shape somebody can read, and an overlay with no way out holds the screen behind it inert — no disconnect, no reload. Closing it does not unsay that the authorization is gone, and the state mark is where asking again lives. **A re-authentication that is refused keeps the screen too** — waving the prompt away is "not now", not consent to throw away what was being read.

**Arriving at a connected URL while not connected dials first.** Where that
works the URL's own screen opens; the URL is rewritten to `/` only on a device
with **no remembered address** (`ccmsg.endpoint` is the test) — such a device is
nobody's yet. Where an address is remembered, the URL and the screen stay put
whether the line is down or the refresh token is spent: losing a link somebody
was sent to one failed request costs more than waiting.

## There are three disconnections, and they do three different things

Every row on screen is **something the instance is saying now**, so what a
disconnection does is a question of what is worth losing. There are three.

| The disconnection | The screen |
|---|---|
| **Nothing has been heard yet** (a first visit) | no list, no transcript, no mesh row, and an empty body: the bar alone says the state and offers the one way to connect (`src/ui/Disconnected.tsx`) |
| **Nobody asked for it** (the network went, the instance left) | what was heard stays on screen, with a band saying it is no longer current. The next snapshot replaces the same rows |
| **Someone pressed 切断** | everything held in memory goes (the lists, the transcript, the fold state, the access token), the far side is asked to revoke, every `ccmsg.` key of this origin is cleared and the page is stood up again — this is getting off the device, and coming back starts at a passkey |

**There is one way to cut the connection, and it is getting off this device**
(DR-0004 §2.6). Connecting is authenticating here, so being unconnected and
being signed off are not two states a person has reason to tell apart: the one
operation asks the contract's `auth.signout` to revoke the token family (the
cookie is HttpOnly, so the reply is the only place it can be expired) and
**clears every `ccmsg.` key of this origin by default**. There is one setting
for people who want to keep something (off by default), and what it keeps is the
preferences alone (see "localStorage keys name what they belong to"). **The
local side is cleared whether or not the far side answers** — a device somebody
decided to get off is the worse place for a trace to stay, and what did not go
through is left as one line of words. **It ends by loading the top of the page
again**: leaving no trace means the copies held in memory go too, and loading
again costs no list of things to clear one by one (preferences come back only
where the setting kept them, read off the storage that still has them). The one
line travels to that load in the URL fragment, and is taken out of the URL where
it is read. A second way that only closes the socket is not offered beside it:
two words nobody can read a difference of leave one of them as the cut that
leaves a trace, and stepping away is what closing the tab is for. It is
irreversible, so it asks once before it goes, and it sits inside the hamburger
rather than out on the nav. **An unasked-for disconnection is not this
operation** — a line that dropped is said by the mark, and a lost authorization
raises the passkey request over the screen.

The body carries neither an explanation nor a second button. The bar already
says there is no connection and already offers the way to make one; a second
place to press it only asks the reader which one is real. What stays in the body
is the one line about an enrolment URL this page cannot act on, which would
otherwise read as a press that did nothing. A contract generation that does not
match is not there — the standing reload says that by changing colour.

Nothing is framed before it is heard, because that frame is an **empty list** —
a list of no rows says "this host has no sessions" rather than "you are not
connected". So the screen arrives not when the socket opens but when **the
list's snapshot does** (`listed`); at the moment a socket opens nothing has been
heard yet.

The other way round, a drop does not empty the screen. This is carried around
and read on the move, and losing the page at every gap in the signal loses too
much: until the next snapshot overwrites them, the rows last heard are worth
reading. **Nothing on a row says when it was heard**, so the mark in the nav says it. What
is dropped is only what stops meaning anything — the connection's deadline, a
notification that said something just happened, the note of a message that left
an inbox undelivered.

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

**The way in is also where the reading is.** One setting does not mean one place
to press it: with the control only at the top of the transcript, someone reading
the end has to travel there and arrives having lost the place they were reading.
So each item's prose carries a small entry of its own, and pressing it moves the
whole screen's setting (it is not a per-item translation). It appears only on
prose that **has something to translate** — an entry on a Japanese paragraph
would be one more thing that does nothing when pressed, and a row of those hides
which one does something.

The line being read does not move when the setting changes, because the Timeline
anchors itself (`remember` / `place`): when translation changes the heights, the
first row in view is put back at the height it was.

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

## A dump is worth having because the file stays (a prototype)

The status screen carries a way to write a session's transcript to one file.
The only choice offered is **which preset** — the contract also takes a range
and a type selection, but this starts at "make one file somebody can be handed
later" (adding fields once their absence is felt is smaller than laying out
fields nobody asked for). Nothing else can list the preset names, so they are
asked for rather than typed into a free-text field for the instance to refuse.

The writing happens on **the instance's host**, and what the screen shows is
where it landed and how much of what was written. The content does not travel:
reading it is what the transcript screen is for, and the worth of this op is on
the other side — a file that stays, to be handed on.

## What a row can do (a prototype)

Three things are added to a row in the list, and nothing else: no new screen and
no new shape, since this is a prototype meant to be used and then kept or
dropped.

- **Pinning** is this browser's own memory (localStorage) and is never sent to
  the instance: which session someone is following is theirs, and no reason to
  move the list of everyone else watching the same instance. A pinned row comes
  first whatever the chosen order
- **Renaming** turns the name into a field in place. The instance types the
  session's own rename command into its terminal, so success means the
  keystrokes arrived, not that the name changed — the new name arrives later on
  the `agents` topic. It is not offered by an instance with no terminal in front
  of it (the `terminal` capability)
- **Ending** opens a confirmation, and what asks the instance is the decision
  inside it. The forceful one appears on the row **only when that did not
  work**: it costs the session its chance to
  flush its transcript, so the screen never chooses it — the contract defines
  `force` that way and a person decides

## A session and its runs are two things

A session is the transcript and the folded state; a run is one process of it (contract DR-0001). The URL says which of the two is being looked at: `/s/<sid>` is the session and `/s/<sid>.<pid>` is one run of it.

**Where a row stands is read off the row**, by the contract's own `liveness`, `reachable` and `waiting`. Nothing on the wire says which heading a session goes under: the words are this screen's and the arithmetic is the contract's, so this build and an instance never show one row two ways. A session two processes are writing heads the list, because that is the answer to a different question — how many processes — and nothing else about such a row is worth reading until a person picks one of them. **A heading spells its section's own name** (`Duplicated`, `Waiting`, `Live`, `Unreachable`, `Paused`, `Disappeared`): those words are the vocabulary this screen shares with the contract, and translating them would give one thing two names, one on screen and one in conversation. The order descends from what needs a hand to what needs none, and **a harness that has not announced itself yet** (`起動中`) stands after all of them — the only thing to do with one is look into its terminal.

**A session two processes are writing is not shown as a session at all.** Its fold is frozen and every send, dump and file read is refused (`session_duplicated`), so what a person lands on is the runs and what can be told of each: the pid, when it started, whether it is connected, the terminal it is in, what it is waiting on. Nothing that would be refused is drawn — a composer that exists to be turned down is worse than none. Choosing a run leads to `/s/<sid>.<pid>`, which carries the same material and the one thing there is to do: end that run, naming its pid, since the sid alone no longer resolves to one process.

**A run that is gone is said to be gone.** A pid the session has no run for is answered as ended rather than quietly shown as the session: the OS hands the number out again, and the link was made about a process. A run named on a session that has only that one is no longer restricted, so the screen says so and points at the session.

**What the fold is worth is drawn wherever the fold is read** (`session_status`): `absent` says nothing has been read, `folding` says what is there is partial, `frozen` says it is the last value that could be trusted. A screen that drew a partial fold as the whole one would be saying the session has nothing to show.

**A harness that has started and not yet named a session is seen from the terminals rather than from the sessions** (the contract's `starting`, DR-0026). It has no id, so its row opens nothing and offers the terminal alone.

## Spend is a record of days, folded into the span being read

What the gateway holds is **per day**, and the screen folds that into days,
weeks or months (`src/llm/stats-view.ts`). A week is an ISO week number: "the
last seven days" would make the same "last week" mean a different span depending
on the day the screen is opened, and two such weeks cannot be compared.

A day's total is **the gateway's own figure** when it sent one. That is the
authoritative number — it counts what the gateway does not break out by model,
so it can legitimately exceed the sum of the parts. Only a day without one is
filled in by adding the parts up.

Changing the span asks again. Re-folding is not enough: a month needs more days
of history than a day does, and what is asked for is a little wider than what is
drawn so the oldest bucket on screen is whole rather than cut.

The bars stack by model, scaled to **the tallest bucket on screen** rather than
to an absolute amount: what is being compared is one bucket against another, and
fixing the scale flattens a quiet week into nothing. No charting library is
pulled in — when the drawing is bars and the divisions inside them, writing what
the reader sees is smaller than importing a way to write it.

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

**A file named by half its name is linked too.** An author writes `fold-from-head` for `docs/issue/2026-09-14-fold-from-head.md`. Unlike a markdown link this is a guess rather than a declaration, so what makes it work is that **only a word known to exist is ever linked** — a miss that never reaches the screen is not a miss anyone pays for. That is what lets the shape of the word stay loose: an inline code span whose whole content is one hyphenated word. The hyphen is the only brake, and it is there so an `async` written in backticks for emphasis is not carried off to be searched for. The searching is the instance's (`file.find`): a word that exists as spelled becomes one link there and then, and one whose name only matches once a date prefix and an extension are put back gets a document mark whose click lists the candidates where it stands. Relaxing the prefix and the extension is this side's doing, not the contract's — `file.find` answers whether a word appears in a path, and the word itself survives the relaxed spelling. A word that is neither shows nothing at all.

**What a word is read against is the screen showing it.** A message bubble reads it against the session's working directory, a file preview against the directory holding that file — a `sibling-notes` inside a document naming its neighbour is the markdown reading, the same rule the path links follow. **What was found does not depend on where it was written**, so a word is asked about once and what changes with the place is only which of the answers to offer. **Only words that reached the screen are asked about** (`in-view.ts`): most of the words in a document are below where its reader stops.

## Searching what is on screen

The search covers **what this page already holds** — the stretch of the transcript that has been read, and the file that is open. Nothing is asked of the instance (DR-0022). The box is opened by its 🔍 and by nothing typed (below).

### The keystrokes belong to the browser

**Nothing is bound by default.** Until a person binds one in the settings, this page takes no keystroke at all. The box is opened by its 🔍 and by the `/` the standing pane holds as part of being a pane (above).

Whitespace within a query line separates AND terms and newlines separate OR clauses. A double-quoted phrase is one term whose internal runs of whitespace match `\s+`. `[Aa]` and `[.*]` switch case sensitivity and regular expressions on. **That grammar belongs to the page, not to the contract**: the contract states what a daemon and a client say to each other, and how a string typed into a search box is read is not one of those things.

What is counted is what the page holds, not what is currently drawn. A match inside a closed fold is in `[N/M]`, and stepping to it opens the folds enclosing it first (`fold-tree.ts` answers which). The unit is **one item** (with the answer folded into it), named by its id — so reading backwards, which grows what is held at the front, never makes the same number mean a different item. In a file the line number is the name, so the count and the navigation belong to the code view; the preview highlights too, but a paragraph has no name to move to.

A counted match must be a match the reader can find, so the text searched is the text as shown: a tool call is drawn as one shortened line, and that shortened line is what the query runs against (`item-view.ts`). Searching the full text held would produce "[3/12] with no third match to look at".

Highlighting happens two ways. Prose is split at render time and `<mark>` put in (the `text` case in `markdown-view.tsx`). A highlighted code line is already a list of spans, so the same split is projected onto them and the spans are re-cut (`splitSpansForHighlight`), which is what keeps a match that crosses a colour boundary from erasing the colour. Both ways emit the same `<mark>` (`ui/search-marks.tsx`), so a file and a code block inside markdown light up alike. Code still waiting for its colours is lit the first way and switches to the second when they arrive.

## How a session starts is the instance's to say

The recipes for starting one — where it may start (`root_dirs`), which recipes
exist, which values each reads — live in the instance's config, and the screen
lays out the fields **exactly as it was told** by `launcher.config.read`
(`src/ui/Launcher.tsx`). The names of the recipes and of their parameters are
the words of whoever wrote the config, not renamed here. An instance without the
`launcher` capability is not offered the entry at all.

A recipe's command is shown as it is and can be edited: it is what a person
could type in a terminal, so there is no reason to hide it — and an unedited one
is not sent, so what runs is the recipe the instance holds. Values travel as
values and are never spliced into the command; the contract is what decided
that.

**Nothing is followed after the launch.** What comes back is how the command
went (its output, and how it ended). The session that started announces itself
to the instance and appears in the list when it does; there is no screen here
watching a process.

## Sessions that are not running are the instance's to find

The list holds the sessions an instance is watching, so the ones that ended — or
that never ran ccmsg at all — are not in it. Finding those is **the instance's
work**: the transcripts are files on its host and a browser can read none of
them (`session.search`). What the screen holds is the question and the rows that
come back.

The question is spelled the way the in-screen search spells it
(`parseSearchQuery`): spaces are AND within a line, newlines are OR, and the
words highlighted in a result come from that same parser. If the instance
searched for one thing and the screen lit up another, a row would not say where
it was hit.

Blank fields are not sent. The contract reads an absent field as "do not narrow
by this", so sending an empty string asks for whatever matches an empty string.
The default window is five days, and a spelling that cannot be read leaves **no
window at all** — a typo that quietly narrows the search is worse than a slow
search that finds the thing.

A truncated answer is not hidden. `truncated` says "there may be more", not "you
hit a cap", and reading a partial answer as the whole one costs more than
searching again.

Pressing a row opens that transcript. No live connection is needed: the ops that
read a transcript answer by sid, and the instance finds the file among its own
config homes.

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
instance with no gateway in front of it, the entry in the nav is not
there either.

The screen is in two layers.

- **Always there**: the entry in the nav once connected, coloured and marked only
  when there is **a known problem** upstream (`llm.status`'s
  `overall.severity`). Healthy and unknown say nothing — a mark that is always
  showing stops meaning anything by showing, and turning the mark red for
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

## The status is what the instance folded

What a session is **doing right now** — the workflows running, the work in the
background, the task list — is written in its transcript as tool calls and their
results. Folding that is the instance's, and the screen draws what arrives on
`session.status:<sid>` (`src/ui/Status.tsx`). Two screens reading the same
transcript agree because there is one fold, not two.

It is subscribed to **only while that tab is open**. The URL naming the screen is
the whole of what "someone is reading this" means, and no session nobody is
looking at has its status carried.

What is running comes first. The reasons for reading differ — a running thing is
"where is this now", a finished one is "what happened" — so the finished sink
into the background. What stopped the session (`api_error`) comes before all of
it: on a screen with nothing running, "idle because there is nothing to do" and
"stopped here" are different situations, and they change what the reader does
next.

## The terminals are their own list, and sessions map onto it

**A terminal is not a session's** (contract DR-0026). The window a person opened with `zsh -i` in it belongs to no session, and a terminal whose session ended is not gone — it goes back to the list. So the terminals are a list of their own here too (`/terminals`) and one terminal is a screen of its own (`/terminal/<id>`), both hanging from the root: put them below a session and there is nowhere left to write down a terminal that is no session's.

**Which session is in which terminal is derived**, and the rows say none of it. The pids are what match, and matching them is the contract's (`terminalsOf`, `unattachedTerminals`, `starting`), so an instance and this build never read the same two lists two ways. The `agents` rows read here are the ones **before the list thins them** (`runRows`): hand over the column a list has already picked its own rows out of, and the terminals of the runs it dropped read as terminals nobody is in.

**`starting` is the way in for "it was started and never arrived".** A harness is running in the terminal and no run has been seen for that pid, and with no sid yet the only name it has is the terminal's. What is happening is only visible inside that terminal, so the row heads both lists and offers the terminal and nothing else.

**The list wins, and the run's own word is what is left when there is none.** An instance with no terminal manager has no list at all, only the `terminal_id` a run read out of its state file (contract DR-0026 §2). So a screen asks the pids first and falls back to `peers.runs` only where that answers nothing (`terminalIdOfSession`).

## The terminal is borrowed, not built

A session's own terminal can be opened from here. **Drawing it is not this build's job**: the page borrows the screen of the gateway the instance names in `hello` (`terminal_gateway`) in an iframe, and holds neither the rendering nor the input. Holding them would be a second implementation of the same thing.

**The URL is put together by the contract** (`terminalUrl`). A terminal handle names which system's terminal it is — `hyoui:<id>` is the one this gateway serves — and turning the pair into `<gateway>/sessions/<id>` is the contract's, so the rule lives once beside the field rather than once per client. A handle under another scheme yields no link at all; whoever knows that system opens it. What this build adds is the one thing it owes its own reader: the value goes into an `href`, so a gateway that is not an http(s) URL yields nothing. Nothing is made where either value is missing — a link to nowhere is worse than no link.

**A tab that leads nowhere is not offered.** Where the instance fronts no gateway, or the session names no terminal, the tab itself is absent (`visibleTabs`). The URL grammar still reads it: a link made where the terminal was reachable is not a broken URL where it is not, and lands on a screen saying so rather than on a 404.

**What hangs below a session is the terminals it is running in now.** When the run goes, the derivation answers nothing and the terminal is back on the list — nothing here remembers it, so nothing here has to remove it. Which one is being looked at is offered only where there are two or more: a choice of one is not a choice.

**The embedded URL and the plain one differ.** The tab's iframe asks for `?embed=1&resize=1`: the gateway drops its own header, and follows the frame's size rather than a stored choice, an embedded page having nowhere to offer that choice and nowhere to keep it. The link on a list row is the gateway's own screen, so it carries neither and opens in a tab of its own — the terminal can be looked at without losing the list.

## Nothing is kept for a notification

A `notify` frame is an event, and the contract keeps none of them. Neither does this page: they live in memory and go when the connection does. The bubble at the end of the Timeline is **the moment before the transcript catches up** — once the same answer is written there, that is the record (which is why the bubble is dashed rather than as solid as a settled line). The topbar shows the latest one as a toast, so a notification is noticed whichever session is open.

## A session that cannot be reached offers no composer

The composer is enabled for a session some run of which can be reached (`liveness` and `reachable`). A `message.send` to a stopped session is refused, so the page says that it cannot be sent and why (ended / gone / unreachable / written by two processes at once) rather than letting the person find out from a refusal.

A send that goes through has two successes to tell apart: handed over now, or held in the inbox. Being held is not a failure, so the wording says which of "wait", "send to another session" or "give up" this is (`src/conversation/send-outcome.ts`).

Neither is a message too large to send. The contract's `MAX_FRAME_BYTES` is a ceiling **the sender keeps to**: a line over it is answered `bad_request` and the connection stays up, and all that refusal can say is that it was too big. So the line about to be sent is measured in bytes and stopped here instead (`src/frame-limit.ts`). What to do about it — split it, write it to a file — is the sender's decision, so the page suggests and does not choose.

## A person may look at an inbox

The contract's `inbox` is a topic **a person may read, and a person reading it hands nothing over** — a session's subscription is the delivery itself (what it reads leaves its inbox), where a person is only looking. A person holds every session's inbox in that one subscription, so a row names who it is addressed to (`to`).

What the page shows is therefore not a note of what it sent, but **what the instance is holding**: messages from anyone, and the moment one is handed over as the instance states it. The fold is the shared `element` one (`ElementFold`, keyed by `mid`).

A message that leaves arrives as an element marked `removed`, **with the reason apart in three**. The reason is the only thing drawn differently, so it is the only thing the page separates on:

| Reason | On screen |
|---|---|
| `delivered` | Dropped. The same message appears as an item in the recipient's transcript (`msg_id` is the `mid`) |
| `expired` / `dropped` | Kept, with its mark changed. A message still waiting and one given up on must not look alike |

The removal frame carries no text, so the text is taken from what was heard while it waited (`departedMessages`, which goes with the connection).

It is drawn **in the transcript's own order, where it was said** (`withWaiting`). Pushed to the end it would jump elsewhere the moment it is handed over and appears as an item. A dashed edge says it is not a record yet, and one that never arrived is drawn in another colour. The session list's badge counts what is waiting, and not what never arrived — that number would never come down.

## A notification leads back to what it answered

`notify` carries `reply_to`, the `mid` the line answers. The same answer reaches a person twice — as the notification and again in the transcript — so a reader needs the key that says the two are one thing. The page reads that key and moves to where the message is, as an item or as one still waiting; when it is neither, no way back is offered.

## Authenticating a person (passkey)

The daemon's DR-0001 and the contract's DR-0030 are where this is decided. What is written here is only **what this page holds, and where**.

| Thing | Where | Why |
|---|---|---|
| access token | **in memory alone** (`src/auth/session.ts`) | the secret that opens a socket; anything in the store is readable by every script that ever runs on this origin |
| refresh token | **an httpOnly cookie**, which this page cannot read | the instance reads and writes it, and the page's whole part in it is that the browser sends it |
| who is here | **in memory alone** (`user`, the contract's `UserId`) | one person is one value however many instances they reach, and it is the WebAuthn user handle itself rather than a name derived beside it (contract DR-0030 §1) |
| the endpoint | **`localStorage`** (`ccmsg.endpoint`), stated at the connection bar | this page is published at an origin of its own and dials an instance that may be another site. The address it was served from is the first guess offered, which is right where an instance serves the UI under its own endpoint |
| the passkey's relying party | **kept nowhere**, read off `location` | a credential is made at an origin and its relying party is that origin's host (contract DR-0030 §2), which is this page's own domain: `credentials.get()` is passed none, and `credentials.create()` is passed this page's host rather than anything out of the link — a value the browser would refuse anyway is not one to build a ceremony from |

**The endpoint is not where this page came from, and the two are never compared.** A passkey answers one question — which pages its holder may come from — and the instances they may enter is a separate record's answer (contract DR-0030 §§2–3). So one passkey made here reaches every instance the person owns, an instance is stated at the connection bar and kept for the next visit, and stating another one is a disconnection: a session, a list and a transcript all belong to the instance they came from. Every call to `/auth/*` is made with `credentials: "include"`, which is what carries the refresh cookie whether the instance is this page's site or another one (contract DR-0028); the headers the instance holds this exchange to — `Origin`, `Sec-Fetch-Site` — are the browser's to write and this page cannot state them.

Three flows, all of them entering at the endpoint's `/auth/*` (`src/auth/client.ts`). The endpoint is a base URL ending in a slash, so a route is written after it (`<endpoint>auth/<name>`, and `<endpoint>ws` for the socket). The scheme is not rewritten: a WebSocket is an HTTP request that upgrades, so the `https:` spelling is what `new WebSocket()` is given (DR-0001 §2.7).

- **Enrolling** happens only when a link brought `#enroll=<token>` (`src/auth/enrolment-link.ts`). The claims are read for display alone — the signature is the issuing instance's to check. **The six digits are not in the URL**, so they are typed in: the two halves travelling apart is what makes a leaked URL not an enrolment. The link says which of two things it does (contract DR-0030 §4). `create_user` **makes the person**: a passkey is created against the handle the claims carry, and the account name is the person's to settle in a field the URL's own guess is already in — it is given to the authenticator as both `name` and `displayName`, a passkey manager keeping the first and showing it wherever the key is listed. `add_owner` **hands them an instance**: the passkey they already have is asserted, nothing is created, and nothing is renamed. The claims name **an origin and an endpoint, and only the first decides anything** — the origin is where the person was sent and the one place the ceremony may be held, and a link opened anywhere else says so rather than letting the browser refuse it in words nobody can act on; the endpoint is where the answer is posted and is compared with nothing, load balancer and all. What the connection bar admits is the wider `Endpoint`: an instance is dialed over plain HTTP and at an address literal, and only the page holding a ceremony is held to the narrower `Origin`. The device label is filled in from the user agent and rewritten by the person (`src/auth/device-label.ts`) — with the touch screen read beside it, because an iPad names itself a Macintosh and a Mac is the one machine that reports no touch points. The fragment is read on arrival and on every `hashchange`, since a link opened into a tab already showing this page changes nothing else. **A URL that cannot be used says so in one wording** — spent, expired, issued by nobody reachable, or spelled the way an older contract spelled it — because telling somebody which it was tells them the URL was real (contract issue `registration-url-checked-before-the-form`)
- **Signing in** is what one press of 接続 runs through: the token in memory, then the refresh cookie, then the passkey, without stopping to be pressed again — a browser only asks for a passkey while the person's press is still live, so connecting and authenticating happen in one act. Beside the button, while the sign-in screen is up, the passkey of this page's origin is also stood in **the browser's own autofill** (`mediation: "conditional"`, hung off a field spelled `autocomplete="username webauthn"`), which is how somebody who has not been here in a while finds it without knowing which button to look for; the offer is taken back down with the screen, a standing ask outliving the component that raised it. A load runs only as far as it can without the person (a cookie connects; nothing leaves the page offering to connect), and says nothing about authenticating until an attempt has been made. Enrolling is offered **at the moment** a passkey prompt produces none, since it starts at a terminal and is not work for someone who already has one. No credential is named: a resident passkey answers with its user handle, and which person that is is the instance's to look up. What is asked for is **a passkey made at this origin**, and it answers for every instance that person owns
- **Extending** works off `auth_expires_at` from `hello`, which is the connection's deadline. At a tenth of it left, `/auth/refresh` mints a token and `auth.extend` moves the deadline **on the same connection** — there is no reason for the screen to blink every few hours

The token is fetched again on every attempt to connect (`Connection` holds a `TokenSource` rather than a value). A token that expired while a connection was down turns into a refresh in that one place, and nothing else knows it happened. A handshake that was refused asks for the token again too, saying so: what the page holds is the family's token and not its own, so an expiry it reads as live tells it nothing about whether the token still stands. When there is none to be had the attempt **stops there**: nothing a timer does opens a door that authenticating opens, so the passkey screen is raised and the next dial is the one the person asks for.

The bar's button says **whether this page means to be connected** (`wanted`); the word beside it is what the socket is doing, which passes through closed and back while a retry runs. Holding the intent apart from the state is what makes pressing the button always do the thing it says.

## The account is one picture in three parts

`/account` is what a person reads themselves back from (`src/ui/Account.tsx`, contract `auth.account.read`): **who they are, the passkeys that answer for them, and the instances they own**. The three are one screen because they are one question — whether a line is theirs and whether to let go of it — and a passkey read apart from the instances it opens does not answer it.

It is read when the screen is opened and again after anything on it is removed, and is not kept between visits: other instances write these records too, so what a page held would be a picture of a moment it cannot tell has passed. **Which line may not go is the instance's answer** (`auth_in_use`, for the instance the connection stands on and the passkey it was opened with), not a second one this screen keeps beside it — a screen that greyed the buttons out itself would be a second answer with its own way of going out of step. Removing takes two presses, because what it costs is a walk to a terminal or to another origin's browser rather than anything undoable here. Adding a passkey has no shape on the wire yet (contract issue `passkey-list-for-people`), so the screen says the command that issues one.

Unlike the settings screen, this one **asks the instance** and so only stands while connected — which is why it is an address of its own rather than a section beside the colours (DR-0002).

## Tabs of one session refresh together

**An access token belongs to the family, and every tab the person has open presents the same one** (DR-0001 §2.4). Tabs that refreshed on their own would each rotate the family and take the token out from under the others, so they coordinate in the browser (`src/auth/tab-share.ts`):

- The refresh — `/auth/refresh` and the `auth.extend` that follows it — runs inside `navigator.locks.request()`, so one tab of a session does it at a time
- What it settles on goes to the others over a `BroadcastChannel`, **in memory**: an access token is not written to a store, here as anywhere (see the table above)
- The tab holding the lock **asks the others** on the same channel before it refreshes, and takes the first token that comes back. Asking rather than only listening is what makes this reliable: the lock and a message are handed over by different queues, so what another tab broadcast may not have arrived yet — and what it broadcast before this tab was opened never will. A tab that nobody answers within the round trip is the only tab of its session, and refreshes
- A refused handshake tries the newest token another tab passed on before it refreshes at all
- Without the Web Locks API each tab refreshes for itself. That is the behaviour this improves on rather than one it depends on — the instance's standing token is what makes separate refreshes converge

Names carry **the endpoint and the person** (`ccmsg.auth.refresh:<endpoint>:<user>`, `ccmsg.auth:<endpoint>:<user>`) for the same reason the localStorage keys below do: one origin serves several endpoints and one endpoint several people, and tabs that are not the same session have nothing to agree on. A tab that has not authenticated yet knows nobody and listens on the endpoint alone until it does.

## localStorage keys name what they belong to

A browser holds one store for the site while one person reaches several instances through it, so what a key names is decided by **whose the value is**.

- **No secret is kept here** (above). The endpoint is, because it is the person's own statement of which instance they are reaching rather than something the page can read off itself
- **What would collide names its instance (and its sid)**: a lock, a channel, a session's state — values where the same name on another instance means something else. One store reaches both, so without the names apart one would read the other's.
  - per session: `ccmsg.<feature>:<instance>:<sid>`, two levels (an agent drilldown adds `<sid>/<agentKey>`). An unsent draft (`ccmsg.draft:<instance>:<sid>`) and what the files tab remembers (`ccmsg.files:<instance>:<sid>`) are this
  - per instance: `ccmsg.<feature>:<instance>`, one level. A pane's width (`ccmsg.layout.split:<instance>`) and the sessions somebody pinned (`ccmsg.sessions.pinned:<instance>`) are this — a pin lists that instance's sids, so it goes under a key that names the instance
- **A preference about reading is one for all of it**: how colour looks (`ccmsg.theme`) and a type's display attributes (`ccmsg.timeline.display:<main|sub>`) name neither an instance nor a sid. "Fold the thinking away", "stand the tools on the top level" is **how this person reads**, not a fact about which instance or session is open — splitting it per instance would mean deciding how to read again every time the same person opens another instance. What it does split by is the subject's face (main / worker), because there the reason for reading differs
- **A sign-out clears all of it by default** (DR-0004 §2.6): every `ccmsg.` key at this origin, preferences included — what is left behind on a device somebody has stepped off should not be a default. **Something stays only where a setting says so** ("keep the local settings when disconnecting", off by default), and what it keeps is **what names no user, instance or sid** (how to read, how to sort, the settings themselves, whether a pane is open). **What belongs to the authentication, the connection or a session is not kept even then**: the keys that do name one (an unsent draft, what the files tab remembers, a pane's width, the sessions somebody pinned) and the memory of what was being reached at all (`ccmsg.endpoint`). There is no list of what to keep kept beside this, because a list is the part that would go stale as keys are added — the place that makes a name says for itself that it is a preference (`keepOnSignOut`)
- What is cleared **does not include the names tabs agree on**: `ccmsg.auth:<endpoint>:<user>` and `ccmsg.auth.refresh:<endpoint>:<user>` name a BroadcastChannel and a Web Lock, and write nothing to the store

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

The dev server proxies `/ws`, `/auth`, `/mesh` and `/webhook` to a daemon (`CCMSG_DEV_DAEMON`, `http://127.0.0.1:39847` by default). It stands where a reverse proxy stands in a deployment that serves both from one origin, which is the arrangement where a same-site cookie and a `localhost` relying party are had without a certificate. Developing against an instance on another origin needs no proxy: the endpoint is typed into the connection screen like any other.

**Where this page may connect is stated as a shape rather than as a list.** The build carries one CSP directive, `connect-src 'self' https: wss:` (the development build adds the loopback origins a daemon answers on). It is not an allowlist of instances: which instance is dialed is the person's to state, and a UI published independently of the instances it reaches would need a build per deployment and another one for every instance added — which is the thing publishing it separately exists to avoid. Nothing else is stated, and a policy with no `default-src` restricts only what it names.

One consequence is worth saying plainly: **a plain-HTTP instance on another origin can be stated and will not connect.** The field admits it, because the contract's `Endpoint` does; the policy does not carry it. Nothing is lost by that — the refresh cookie is `Secure`, so such an instance could not have carried a session anyway.

vite with esbuild's automatic JSX (`jsxImportSource: preact`). `@preact/preset-vite` is not used: what it adds is prefresh HMR, and it brings the whole Babel toolchain in for it, while esbuild emits the same JSX. Wanting HMR is what would bring the preset back.

## Tests

**Two runners share one `test/` tree.** `bun test` reads `*.test.ts` and pins the pure layers — how the contract folds, the URL grammar, the ordering of the list, the jsonl mapping — with no browser. Playwright reads `*.visual.ts` (`test/visual/`) and compares **what was drawn** against a baseline image. The names differ because `bun test` claims the usual `*.spec.ts` as its own.

### What the visual comparison stands on

It runs against the real thing: **one daemon is actually started** against a disposable config home, the dev server stands where a reverse proxy stands in a real deployment, and the browser **really registers a passkey** through a CDP virtual authenticator. Only the finger is simulated — the registration and every signature go through the daemon's own verification. Sessions are connections that greet as sessions rather than a running harness: a real Claude Code puts a pid, a clock and somebody's own paths on screen, and none of those can be a baseline.

**A baseline per face.** The same tests run twice, differing only in the colour
scheme (light and dark): one screen is two drawings, and holding only one leaves
the other free to break unseen. The images live at
`<platform>/<face>/<screen>.png` and the manifest's key is that pair
(`darwin/dark`). Platforms are separated for the reason below; both colour faces
are drawn by **the same** platform, so a missing one of those fails where it is
missing.

**The whole comparison rests on the same picture being drawable twice**, which is why the disposable paths and ports are fixed (`test/visual/instance.ts`): the endpoint and the instance id on screen are derived from them, and a temp directory with a random suffix would write a different string every run. The instance's id is laid down before the daemon can make one, the transcript is a fixture with its instants written out, and the two places left — the account screen's expiry clock and the daemon's version — are masked.

**A screen is drawn with the preferences at their defaults.** A test that moves one that is kept in `localStorage` — the width of the list, say — **puts it back** once it has checked that it was remembered: the browser context is shared with the tests that follow, so a preference left behind is baked into every baseline drawn after it, and the baselines then depend on what ran before them (running that file on its own no longer matches).

### The baselines live in another repository

The images are in `kawaz/ccmsg-webui-snapshots`; what this repository keeps is their digests (`test/visual/manifest.json`). A baseline's worth is its history — the same screen, version after version — and that is too heavy for everyone who clones the source to carry. What the manifest answers is whether the baselines being compared against are the ones this version accepted; a screen that actually changed fails at the comparison itself, with a diff image.

**A baseline belongs to the platform that drew it** (`{platform}/<screen>.png`). Fonts and font smoothing differ between a mac and a CI runner, so everywhere there is text is different, and no threshold absorbs that. Drawing one set inside a container is the alternative, and it costs `just visual` a dependency on docker.

- `just visual` — compare what is drawn now against the baselines, and check them against the manifest
- `just visual-accept` — take what is drawn now as the baseline and commit it to the snapshots repository (pushing is a person's). The manifest is left in the working copy, to go into the commit that changed the screen

It is **not** part of `just ci`: what it needs is different (the daemon's source, a browser binary, the baseline repository), so CI runs it as a job of its own.
