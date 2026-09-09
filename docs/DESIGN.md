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
| screens | `src/ui/` | reading only |

The state layer is `@preact/signals`: an action is an update function gathered into the state module, and there is no `useMemo` or `memo` (DR-0032 §2.1).

## The fold is read from the contract

`TopicFold` asks the contract's `topicGranularity()` about a topic name and folds accordingly. There is no table here of which topic behaves how, so a topic added to the contract needs no change to this file.

What a fold holds is always a list of **(instance, payload) slots**, which makes `whole` and `per_instance_whole` the same operation with a different key — one slot per topic against one slot per instance. A reader has one shape to read. `union()` concatenates across instances, which is the contract's "what the subscriber holds is the union across instances".

**`append` and `element` are not folded.** No screen subscribes to them yet, and a topic that cannot be folded must not be subscribed to and then read as empty, so `isFoldable` refuses at subscription. The Timeline (`transcript`, an `append` topic) is when they get written.

When a connection to an instance drops, what that instance said is dropped with it: a stopped value is indistinguishable from a live one.

## The contract validates its own frames

Every topic frame is checked against `TOPIC_SCHEMAS` with the contract's `isValid()`. No field-by-field test is written here — validating is the contract's job, and a frame that fails it has exactly one meaning, a disagreement about the contract, which lands in the warning banner.

## What cannot be observed

**A browser cannot read the HTTP status of a refused handshake.** A 401 (wrong token) and a 403 (origin not allowed) both arrive through the WebSocket API as an `error` event with nothing in it. The page can therefore only say that it was refused or did not arrive; which of the two is read from the daemon's log or the browser's network panel. Probing over HTTP first would not settle it either, since a cross-origin request shows just as little.

## What the contract does not carry

The subprotocol prefix the entry token travels in (`ccmsg.token.`) belongs to the daemon's entry policy (daemon §3.1) rather than to the contract, and `@ccmsg/protocol` does not export it. It is a constant in `src/connection.ts`.

## Build

vite with esbuild's automatic JSX (`jsxImportSource: preact`). `@preact/preset-vite` is not used: what it adds is prefresh HMR, and it brings the whole Babel toolchain in for it, while esbuild emits the same JSX. Wanting HMR is what would bring the preset back.
