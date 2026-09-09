# ccmsg-webui

> 🇬🇧 [README.md](./README.md)

ccmsg の web UI。daemon とは契約 (`@ccmsg/protocol`) だけで話す静的サイトで、daemon から配信されない別 origin のページとして動く。

## いま動くもの

Sessions 一覧: 稼働セッション (`peers`)、ハーネス側のセッション (`agents`)、前回稼働 (`last_live`)、セッションのエラー (`session_errors`)。並び順の切り替えは localStorage に残る。行を押すと `/s/<sid>/<tab>` に遷移する (中身は未実装)。

## 使い方

```sh
bun install
just dev          # http://localhost:5173
```

画面上部のバーに daemon の WebSocket URL (例 `ws://127.0.0.1:39847/ws`) と entry token を入れて接続する。`#url=…&token=…` の fragment を付けた URL を開いても同じで、値は localStorage に保存され、fragment はアドレスバーから消える (fragment はサーバに送られないので、token を載せてよいのはここだけ)。

daemon 側には 2 つの設定が要る。

- `entry` を持つ instance であること (WebSocket を待ち受ける)。entry token は state ディレクトリの `entry.token`
- `entry.origins` にこのページの origin (dev なら `http://localhost:5173`) を入れること。空の origins は「誰でも」ではなく「ブラウザは誰も」の意味で、`Origin` を名乗る接続は 403 になる

## 開発

```sh
just ci     # lint / typecheck / test
just build  # dist/ に静的サイトを出す
```

## ライセンス

MIT
