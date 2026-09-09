# ccmsg-webui 設計

> 🇬🇧 [DESIGN.md](./DESIGN.md)

## ドメイン

このリポジトリが持つのは **契約の読み手 1 つ**。daemon が push するものを畳んで見せ、人の操作を op に変えて送る。ドメインの語彙 (セッションとは何か、分類はどう決まるか、topic はどう畳むか) は全て契約側にあり、ここには置かない。

daemon はこのページを配信しない。ページは自分の origin を持つ静的サイトで、daemon が提供するのは WS の API だけになる。この非対称が設計の起点で、次の 3 つがそこから出る。

- **接続先を推測できない**。ページの出所は daemon と無関係なので、endpoint も entry token も人が与える (`src/settings.ts`)
- **入口の許可は daemon の設定**。origin の許可集合に入っていなければ handshake は 403 で、ブラウザにはその番号が見えない (下記「観測できないもの」)
- **世代が違えば話さない**。互換経路は持たず、リロードを促す (契約「版と互換」)

## 層

| 層 | ファイル | 責務 |
|---|---|---|
| 接続 | `src/connection.ts` | socket の生死、`hello`、request と reply の相関、再接続、購読の復元 |
| 畳み | `src/topic-fold.ts` | topic frame を手元の値に畳む。規則は契約の `granularity` |
| 状態 | `src/state.ts` | signal と、その唯一の書き手である関数 |
| 派生 | `src/sessions.ts` `src/route.ts` | 並び・セクション・表示名・URL 文法 (純関数) |
| transcript | `src/timeline/` | jsonl 行 → 表示イベントの純関数層と、取得を束ねる `TranscriptView` |
| 画面 | `src/ui/` | 読むだけ |

状態層は `@preact/signals`。更新関数を state module に集約したものが action で、`useMemo` / `memo` は置かない (DR-0032 §2.1)。

## topic の畳み方は契約から引く

`TopicFold` は topic 名から契約の `topicGranularity()` を引いて畳む。webui 側にどの topic がどう畳むかの表は無く、契約に topic が増えてもこのファイルは変わらない。

畳んだ結果は常に **(instance, payload) のスロットの列**で、`whole` と `per_instance_whole` はスロットの鍵が違うだけの同じ操作になる (前者は topic に 1 つ、後者は instance に 1 つ)。読む側は 1 つの形だけを読む。instance ごとの全体を横断で足すのが `union()` で、これが契約の言う「手元の値は instance 横断の和」にあたる。

`append` は列に畳めない。手元に残るのは instance が全体として言った値ではなく、伸び続ける値の**一続きの区間**なので、`AppendFold` が別に持つ: 窓 (`start`/`end`/`lines`) と、instance が最後に言った全長 (`size`)。窓は 2 方向から埋まる — frame が末尾に足し、`transcript_read` が先頭に足す。どちらでもないもの (隣接も重複もしない区間) は**穴**で、穴は繋がっているふりをせず拒否する。offset は byte で、契約の read が刻む offset と同じものなので、生で届いたものと読んで戻したものが二重に数えられることなく繋がる。

**`element` は畳まない**。購読する画面がまだ無く、畳めない topic を購読して「空」として読ませないために、購読時点で拒否する (`isFoldable`)。

instance との接続が切れたら、その instance が言ったことは捨てる。止まった値は生きた値と見分けが付かない。

## Timeline の 3 層

transcript は「取得」「モデル」「描画」の 3 層に分ける。

| 層 | ファイル | 責務 |
|---|---|---|
| 取得 | `src/timeline/transcript-view.ts` | `transcript:<sid>` の購読と `transcript_read` の遡り読みを 1 つの `AppendFold` に集める |
| モデル | `src/timeline/transcript-model.ts` ほか | jsonl 行 → `ParsedLine` → tool_use/tool_result の結合・queue の対応付け → `TimelineGroup`。純関数のみ |
| 描画 | `src/ui/Timeline.tsx` | groups を読むだけ。スクロール位置の意味付けもここ |

**購読が先、読み込みが後**。逆にすると、読み終わってから購読するまでに追記された分がどちらにも入らない。購読の snapshot は「今どこで終わっているか」しか言わないので、そこを起点に末尾 1 ページを読む。

モデル層は**行単位の純粋な写像** (`incremental-line-map`) と**行をまたぐ写像** (`incremental-cross-line`) に分かれる。後者は毎回全窓を再計算した上で、前回と等しい部分は前回のオブジェクトを返す。tool_result の追記は数千行前の tool_use を書き換えうるし、配信済みの user turn は先に現れた queue 済みの複製を打ち消すので、「末尾だけ再計算する」方式はその到達距離を再現できない。

スクロール位置が「追う」と「読む」を分ける。末尾にいる人は起きていることを見ているので追記で view を動かし、それ以外の位置にいる人は読んでいるので動かさない。先頭に足された分は scrollHeight の差分を足して打ち消す (読んでいる行を動かさないため)。

## localStorage のキー規律

ブラウザの store はサイトに 1 つで、1 人が複数の instance に届く。だから **instance に属するものは instance を名前に含める**。

- entry: endpoint 自体は `ccmsg.entry.url`、token は `ccmsg.entry.token:<url>`。token は instance の入口資格そのものなので、素の名前で持つと最後に設定した endpoint の値を別の instance に渡しうる
- session 単位で残す値: `ccmsg.<feature>:<instance>:<sid>` の 2 段 (agent の drilldown はさらに `<sid>/<agentKey>`)。sid は instance の上で 1 つのセッションを指す名前でしかない

## 契約の検証は契約の検証器で

届いた topic frame は `TOPIC_SCHEMAS` と契約の `isValid()` に通す。フィールドを 1 つずつ見る検査をここに書かない — 検査は契約の仕事で、通らない frame は「契約の食い違い」という 1 つの結論にしかならないため、警告バナーに落ちる。

## 観測できないもの

**ページは拒否された handshake の HTTP status を読めない。** 401 (token 不一致) も 403 (origin 不許可) も、WebSocket API 上はどちらも詳細のない `error` イベントとして届く。ページはそのため「接続を拒否されたか、届きませんでした」としか言えない。

status 自体は消えているわけではなく、**ブラウザの console と network パネルには出る** (Chrome は `Unexpected response code: 403` と書く)。読めないのは JS であって人ではないので、切り分けはそこと daemon のログで行う。この曖昧さを埋めるために HTTP を先に叩くことはしない (別 origin なので CORS で同じだけ見えない)。

## 契約に無いもの

entry token を運ぶ subprotocol の接頭辞 (`ccmsg.token.`) は契約ではなく daemon の入口ポリシー (daemon §3.1) にある。`@ccmsg/protocol` は export しないので `src/connection.ts` に定数として置いてある。

## ビルド

vite + esbuild の automatic JSX (`jsxImportSource: preact`)。`@preact/preset-vite` は使っていない: 提供するのは prefresh の HMR で、そのために Babel のツールチェーン全体が依存に入る。JSX の変換自体は esbuild が同じ出力を出す。HMR が要るようになったら preset を入れる判断に戻る。
