# ccmsg-webui

> 🇬🇧 [README.md](./README.md)

ccmsg の web UI。daemon とは契約 (`@ccmsg/protocol`) だけで話す静的サイトで、instance の endpoint (base URL) の直下に配られて動く。

## いま動くもの

Sessions 一覧: 稼働セッション (`peers`)、ハーネス側のセッション (`agents`)、前回稼働 (`last_live`)、セッションのエラー (`session_errors`)。並び順の切り替えは localStorage に残る。行を押すと `/s/<sid>/<tab>` に遷移する (中身は未実装)。

## 使い方

```sh
bun install
CCMSG_DEV_DAEMON=http://127.0.0.1:39847 just dev   # http://localhost:5173
```

dev server は `/ws` `/auth` `/mesh` `/webhook` を daemon に proxy する (本番の reverse proxy と同じ位置)。したがって endpoint はこのページの出所そのもの — dev なら `http://localhost:5173/` — で、入力する URL は無い。

パス prefix 付きで配る構成を dev で試すときは prefix を名指しする: `CCMSG_DEV_BASE=/personal/ just dev` はページを `http://localhost:5173/personal/` で出し、その prefix 配下の route をパスごと proxy する (prefix 付きで配られた instance に届くのはそのパス)。ビルド側で同じことを言うのが `bun x vite build --base=/personal/`。

daemon 側に要るのは `entry` (host / port) を持つ instance だけ。入口の許可は passkey で、origin の一覧も entry token も無い。

初回は登録が要る。instance のある端末で

```sh
ccmsg daemon passkey add <unit> http://localhost:5173/ --name <ラベル>
```

を実行し、表示された `http://localhost:5173/#register=<jwt>` を開いて、CLI が出した 6 桁のコードを入力する (コードは URL に入っていないので、URL だけ漏れても登録にはならない)。以後はこのページを開けば cookie で戻り、切れたら passkey で入り直す。

## 開発

```sh
just ci     # lint / typecheck / test
just build  # dist/ に静的サイトを出す
```

## ライセンス

MIT
