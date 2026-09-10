# ccmsg-webui

> 🇯🇵 [README-ja.md](./README-ja.md)

The web UI for ccmsg. A static site that speaks to a daemon instance through the wire contract (`@ccmsg/protocol`) alone, served from under that instance's endpoint (its base URL).

## What works

The session list: connected sessions (`peers`), the harness's own view (`agents`), what was running when the instance last looked (`last_live`), and the errors sessions are stopped on (`session_errors`). The ordering a person picks is kept in `localStorage`. A row goes to `/s/<sid>/<tab>`, which is not built yet.

## Using it

```sh
bun install
CCMSG_DEV_DAEMON=http://127.0.0.1:39847 just dev   # http://localhost:5173
```

The dev server proxies `/ws`, `/auth`, `/mesh` and `/webhook` to the daemon, standing where a reverse proxy stands in a real deployment. The endpoint is therefore where this page came from — `http://localhost:5173/` in development — and there is no URL to type.

To develop against a build published under a prefix, name it: `CCMSG_DEV_BASE=/personal/ just dev` serves the page at `http://localhost:5173/personal/` and proxies the routes below that prefix, path and all — which is where an instance published under a prefix is reached. `bun x vite build --base=/personal/` is the same statement for a build.

The daemon needs an instance with an `entry` section (host and port), and nothing else: who may enter is answered by a passkey, so there is no origin list and no entry token.

A first visit has to be registered. On the machine running the instance:

```sh
ccmsg daemon passkey add <unit> http://localhost:5173/ --name <label>
```

Open the `http://localhost:5173/#register=<jwt>` it prints and type in the six digits it showed. The digits are not in the URL, so a leaked URL is not a registration. After that the cookie brings the session back, and a passkey is asked for when it does not.

## Development

```sh
just ci     # lint / typecheck / test
just build  # writes the static site to dist/
```

## License

MIT
