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
| 描画 | `src/ui/Timeline.tsx`, `src/markdown/` | groups を読むだけ。スクロール位置の意味付け、Markdown の読み方、fold の見た目もここ |

**購読が先、読み込みが後**。逆にすると、読み終わってから購読するまでに追記された分がどちらにも入らない。購読の snapshot は「今どこで終わっているか」しか言わないので、そこを起点に末尾 1 ページを読む。

モデル層は**行単位の純粋な写像** (`incremental-line-map`) と**行をまたぐ写像** (`incremental-cross-line`) に分かれる。後者は毎回全窓を再計算した上で、前回と等しい部分は前回のオブジェクトを返す。tool_result の追記は数千行前の tool_use を書き換えうるし、配信済みの user turn は先に現れた queue 済みの複製を打ち消すので、「末尾だけ再計算する」方式はその到達距離を再現できない。

スクロール位置が「追う」と「読む」を分ける。末尾にいる人は起きていることを見ているので追記で view を動かし、それ以外の位置にいる人は読んでいるので動かさない。先頭に足された分は scrollHeight の差分を足して打ち消す (読んでいる行を動かさないため)。

## 描画層: Markdown とハイライト

agent が書いた text は **Markdown として読む**。mdast (`mdast-util-from-markdown` + GFM 拡張) の木を JSX へ手で歩き、HTML 文字列の段を一切通さない。`innerHTML` / `dangerouslySetInnerHTML` は使わないので、`<` や `&` を含む本文の逃がしは Preact のテキストノードがそのまま担う。

**人が打った text は別の読み方をする** (restricted)。`#3 の件` は見出しではないし `<R G B>` は HTML タグでもない。人が意図して使うのは inline code・fenced code・引用行の 3 つだけなので、restricted はその 3 つだけを解釈し、残りは打たれた文字のまま出す。mdast を歩いてから plain へ戻すのではなく source を直接字句解析するのは、木を経由すると元の文字 (`#` の有無、`_foo_` の空白) が復元できなくなるため。

**link の宛先は 3 通りにしか落ちない**。http/https/mailto は別タブ、`#fragment` と自分の origin を指す絶対 URL は同じタブ、それ以外 (`javascript:` 等の scheme、およびファイルパス形) は **`<a>` を出さない**。パス形を origin 相対の `href` にすると、このページを配っている origin へ遷移して戻る手段が無くなる (address bar の無い standalone PWA では復帰不能)。画像も同じ判定を通し、`<img src>` で自動取得はしない — 描画しただけで閲覧者の IP/UA が第三者に届くため、alt とリンクだけを出して人が選べるようにする。

コードのハイライトは Shiki を**遅延 chunk** で読む。engine と grammar は `getHighlighter` の中の `await import()` で取るので、コードの無いセッションは 1 つも取得しない。言語表と大きさの閾値だけは先に載っていて、これが「ハイライトするか」を highlighter を払わずに決められる根拠になっている。token は light/dark を同時に持たされ、どちらを使うかは CSS が決める (theme ごとの再 tokenize をしない)。

## fold の開閉

fold の開閉状態は fold を描く component の**外**に置く (`src/timeline/fold-open.ts`)。窓が動けば component は unmount されるが、そこで開閉が戻るのは「アプリが忘れた」と読める。

**key ごとに signal を 1 本**持ち、map を持つ signal 1 本にはしない。component は自分が描く key を読むので、1 つ開いても timeline の残りは再描画されない — 状態を外に出した理由そのもの。

**触られた fold だけ**を記録する。無い = 呼び出し側の既定のまま、という意味で、これが「自動で開く」設定の変更を、store が各 fold の既定を知らないまま効かせる方法になる (設定変更 = override を捨てる)。

**閉じた fold の中身は描かない。ただし一度開いたら描き続ける**。transcript の大半は fold の中にいるので、閉じた中身まで描くと数行読むためにセッション全体を描いて (ハイライトして) しまう。逆に一度開いた中身を捨てると、閉じる操作が「開いた仕事を捨てる」意味になる。

## Files: 木・本文・リンク

ファイルの画面が答えるのは 3 つ — どこに何があるか (木)、その中身 (本文)、文章の中のパスがどこを指すか (リンク)。

**パスの綴りがそのまま認可の面になる**。契約は `contained` をセッションの根からの相対、`workspace` / `external` を絶対で綴る (契約 `files.ts`) ので、先頭の `/` の有無だけが 3 面の区別になる。木の鍵も、記録した選択も、URL も同じ 1 本の文字列で足りるのはこのため。相対なら `contained` と決まり、**絶対パスの面は `file_stat_batch` に聞く** — `workspace` と `external` は綴りが同じで、どちらが admit するかを答えられるのは instance だけ。

**木は展開時に 1 段ずつ聞く** (`dir_list`)。答えは「聞いた時点の写し」で購読ではないので、再取得は明示のボタン。断られた理由も「答えが出た」側に畳んで覚える — 覚えないと `読み込み中` の行が永遠に残る。

**URL が正本**。`/s/<sid>/files?path=<p>&lines=<a>-<b>` が開いているファイルと指している行を名指しするので、リンクを送れば相手は同じものを見る。ファイルを開くことは navigation で、行は `path` に入れられない (パスは `/` を含む) ため query に置く。**行の名指しは記録より強い** — リンクを送った人は行を指しているので、覚えていた表示モードもスクロール位置も譲る。

**続きは読めない**。`file_read` は instance の読み取り上限 (512KiB) までを答えて `truncated` を立てるだけで、offset を渡す引数を契約が持たない (契約 `files.ts`)。だから先頭だけを出し、なぜここで切れているかをバナーで言う。黙って切ると「そういうファイル」に見える。

**プロジェクト外は履歴であって一覧ではない**。`external` の許可集合はセッションの transcript が名指したファイルで、契約にそれを列挙する op は無い (手元のパスについて admit するかを答える `file_stat_batch` だけ)。なので木に出るのは、このブラウザがそのセッションで実際に開いた絶対パスになる。

**markdown の表示モードはセッション単位の「最後の選択」**。パスごとに持つと、間に `.ts` を 1 つ開いただけで選択が消える (`.ts` に「コードかプレビューか」の答えは無いので、上書きさせない)。

## 会話は Timeline の上にある

人がセッションに話しかけ、返事を読む画面は別に作らない。**会話の正本はセッションの transcript** で、それを読む画面は既にあるため。往復の 2 方向は transcript の中で違う形をしている。

- **人 → セッション**: `message_send { to: sid, text }`。宛先は sid ひとつで room は無い。届いた 1 通は、セッション側の user turn に `<cross-session-message>` の封筒として現れる
- **セッション → 人**: セッションが走らせる `ccmsg reply <mid> <text>`。`--to` が無い返事は人宛で、instance がそれを通知に変えて届ける

封筒の読み戻しは契約の `parseDirectDelivery` がやる。webui 側に正規表現を書くと、同じ文法の写しが 2 つになり、契約が変わっても画面は古い綴りを読み続ける。`src/timeline/transcript-model.ts` が持つのは「行の中から封筒を切り出す」ところまでで、切り出しは**次の封筒の手前で最後の閉じタグ**を採る — 契約は本文に閉じタグが literal で入っていても往復すると決めているので、最初の閉じタグで切ると本文を黙って落とす。

返事の側は Bash コマンドの文字列を読む。読むのは語分割と `--name value` の並びだけで、変数展開や置換は解釈しない: 展開の結果まで読もうとすると、読めなかったものを読めたふりをすることになる。

## 通知は残さない

`notify` topic の frame は event 粒度で、契約は 1 通も保持しない。webui もページのメモリにしか置かず、切断で捨てる。Timeline の末尾に出る通知の吹き出しは **transcript が追いつくまでの仮の姿**で、同じ返事が transcript に現れたらそちらが正 (吹き出しは破線で、確定した行と同じ重さにしない)。どのセッションを見ていても気づけるように、topbar にも直近の 1 件をトーストで出す。

## 送れない相手には送らせない

composer が有効なのは、instance が今つながっていると言っているセッションだけ。止まったセッション宛の `message_send` は instance が断るので、断られてから理由を読ませるのではなく、送れないことと理由 (終了した / 居なくなった / 未接続) を先に書く。

送れた場合の応答は 2 つの成功に分かれる: 今届いたか、inbox に積まれたか。積まれた方も失敗ではないので、文言は「待つ / 別のセッションに送り直す / 諦める」のどれなのかを言う (`src/conversation/send-outcome.ts`)。

## localStorage のキー規律

ブラウザの store はサイトに 1 つで、1 人が複数の instance に届く。だから **instance に属するものは instance を名前に含める**。

- entry: endpoint 自体は `ccmsg.entry.url`、token は `ccmsg.entry.token:<url>`。token は instance の入口資格そのものなので、素の名前で持つと最後に設定した endpoint の値を別の instance に渡しうる
- session 単位で残す値: `ccmsg.<feature>:<instance>:<sid>` の 2 段 (agent の drilldown はさらに `<sid>/<agentKey>`)。sid は instance の上で 1 つのセッションを指す名前でしかない。Timeline の「自動で開く」設定 (`ccmsg.tl.autoOpen:...`) 、書きかけの本文 (`ccmsg.draft:<instance>:<sid>`)、Files タブが覚えている選択 (`ccmsg.files:<instance>:<sid>`) がこれ

## 契約の検証は契約の検証器で

届いた topic frame は `TOPIC_SCHEMAS` と契約の `isValid()` に通す。フィールドを 1 つずつ見る検査をここに書かない — 検査は契約の仕事で、通らない frame は「契約の食い違い」という 1 つの結論にしかならないため、警告バナーに落ちる。

## 観測できないもの

**ページは拒否された handshake の HTTP status を読めない。** 401 (token 不一致) も 403 (origin 不許可) も、WebSocket API 上はどちらも詳細のない `error` イベントとして届く。ページはそのため「接続を拒否されたか、届きませんでした」としか言えない。

status 自体は消えているわけではなく、**ブラウザの console と network パネルには出る** (Chrome は `Unexpected response code: 403` と書く)。読めないのは JS であって人ではないので、切り分けはそこと daemon のログで行う。この曖昧さを埋めるために HTTP を先に叩くことはしない (別 origin なので CORS で同じだけ見えない)。

## 契約に無いもの

entry token を運ぶ subprotocol の接頭辞 (`ccmsg.token.`) は契約ではなく daemon の入口ポリシー (daemon §3.1) にある。`@ccmsg/protocol` は export しないので `src/connection.ts` に定数として置いてある。

## ビルド

vite + esbuild の automatic JSX (`jsxImportSource: preact`)。`@preact/preset-vite` は使っていない: 提供するのは prefresh の HMR で、そのために Babel のツールチェーン全体が依存に入る。JSX の変換自体は esbuild が同じ出力を出す。HMR が要るようになったら preset を入れる判断に戻る。
