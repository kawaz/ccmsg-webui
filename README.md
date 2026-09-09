# ccmsg-webui

> 🇯🇵 [README-ja.md](./README-ja.md)

The web UI for ccmsg. A static site that speaks to a daemon instance through the wire contract (`@ccmsg/protocol`) alone, served from an origin of its own rather than by the daemon.

## What works

The session list: connected sessions (`peers`), the harness's own view (`agents`), what was running when the instance last looked (`last_live`), and the errors sessions are stopped on (`session_errors`). The ordering a person picks is kept in `localStorage`. A row goes to `/s/<sid>/<tab>`, which is not built yet.

## Using it

```sh
bun install
just dev          # http://localhost:5173
```

Type the daemon's WebSocket URL (e.g. `ws://127.0.0.1:39847/ws`) and its entry token into the bar at the top. Opening a URL with a `#url=…&token=…` fragment does the same: the values are stored in `localStorage` and the fragment is cleared from the address bar. A fragment is the only part of a link that may carry the token, because it is never sent to the server that serves this page.

The daemon needs two things:

- an instance with an `entry` section, so it listens on a WebSocket at all. Its entry token is `entry.token` in the state directory
- this page's origin in `entry.origins` (`http://localhost:5173` in development). An empty origin list does not mean "anyone": a connection presenting an `Origin` is refused with 403

## Development

```sh
just ci     # lint / typecheck / test
just build  # writes the static site to dist/
```

## License

MIT
