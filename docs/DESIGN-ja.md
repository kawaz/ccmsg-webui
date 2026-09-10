# ccmsg-webui 設計

> 🇬🇧 [DESIGN.md](./DESIGN.md)

## ドメイン

このリポジトリが持つのは **契約の読み手 1 つ**。daemon が push するものを畳んで見せ、人の操作を op に変えて送る。ドメインの語彙 (セッションとは何か、分類はどう決まるか、topic はどう畳むか) は全て契約側にあり、ここには置かない。

このページは **instance の endpoint の直下に配られる** 静的サイトで、daemon が提供するのは同じ endpoint の下の WS と `/auth/*` になる (DR-0001 §2.2)。この同居が設計の起点で、次の 3 つがそこから出る。

- **接続先は自分の出所**。endpoint = `location.origin` + このビルドの base で、人に入力させるものは何も無い (`src/auth/endpoint.ts`)。passkey はページのドメインでしか使えず、refresh cookie はその prefix にしか届かないので、別の endpoint はそもそもこのブラウザが認証できない instance になる
- **入口の許可は passkey**。誰が来たかに答えるのは access token で、origin の許可集合は無い (下記「人の認証」)
- **世代が違えば話さない**。互換経路は持たず、リロードを促す (契約「版と互換」)

## 層

| 層 | ファイル | 責務 |
|---|---|---|
| 接続 | `src/connection.ts` | socket の生死、`hello`、request と reply の相関、再接続、購読の復元 |
| 畳み | `src/topic-fold.ts` | topic frame を手元の値に畳む。規則は契約の `granularity` |
| 状態 | `src/state.ts` | signal と、その唯一の書き手である関数 |
| 派生 | `src/sessions.ts` `src/route.ts` | 並び・セクション・表示名・URL 文法 (純関数) |
| base | `src/base.ts` | この成果物が配られた場所と、それを起点にした route の読み書き |
| transcript | `src/timeline/` | 型付き item を画面の並びに読む純関数層と、購読・取り寄せを束ねる `TranscriptItemsView` |
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
| 取得 | `src/timeline/items-view.ts` | `transcript_items:<sid>` の購読、`transcript_items_read` の遡り読み、`transcript_read` による生 record の取り寄せ |
| モデル | `src/timeline/items.ts` `src/timeline/item-view.ts` | 型付き item → 呼び出しと答えの結合・畳みのまとめ → `TimelineNode`、および型ごとの名乗りと中身。純関数のみ |
| 描画 | `src/ui/Timeline.tsx`, `src/markdown/` | nodes を読むだけ。スクロール位置の意味付け、Markdown の読み方、fold の見た目もここ |

**分類は instance、契約は型の語彙、webui は jsonl を読まない**。transcript は harness が自分の都合で書いている file なので、どの record がどの item かを決めるのは file を持っている側になる。webui に届くのは分類された item だけで、ここには record の形が 1 つも書かれていない — harness が file を変えても、別の harness が読まれるようになっても、この層は動かない。

**生の record は取り寄せで見る**。item が答えられない唯一の問いが「元の行は何と書いてあったか」で、item はその住所 (`source`) を持っている。各 item の下の `jsonl` を開くと `transcript_read` をその 1 record に絞って頼み、返った行を整形して出す。既定で目立つのは**汎用形で出ている item** (`system:unknown`、専用の見た目を持たない道具・添付・知らない型) — そこが分類の甘い所で、元の行を見ないと分からない所だから。1 つの record から読まれた item は同じ住所を指すので、取り寄せは record ごとに 1 度で足りる。

**購読が先、読み込みが後**。逆にすると、読み終わってから購読するまでに分類された分がどちらにも入らない。購読の snapshot は末尾 200 item を運び、同じ item が読み込みと重なっても id で数えるので二重にならない。

**画面が持つのは末尾 1 MiB 相当**。追い続ける値は伸び続けるので、上限が無ければ開きっぱなしのタブは全部を抱える。数えるのは item そのものの重さで、下限は snapshot が運ぶ 200 item (受け取った端から手放す窓は、同じものを永久に頼み続ける)。手放すのは末尾が伸びた時だけで、読み手が求めて遡った頁を、それを取ってきた read が取り上げることはない。手放した item に付いていた fold の開閉 (`fold:<item id>` / `think:<item id>` / `raw:<record id>`) も同じ契機で消す: 無いものの開閉は残しても意味を持たず、遡って戻ってきた item は読み手の既定から始まる。

**遡りは上限だけを指して頼む** (`until_uuid` = 手元の先頭 item の record)。instance は範囲を**古い側から**1 頁分だけ答えるので、頁に収まらない範囲では、返った分と手元の間が空く。空いたことは `next` が手元の先頭を名指していないことで分かるので、繋がっているふりをせず画面に出す。

スクロール位置が「追う」と「読む」を分ける。末尾にいる人は起きていることを見ているので追記で view を動かし、それ以外の位置にいる人は読んでいるので動かさない。

**描くのは見えている所だけ** (`src/timeline/virtual-window.ts`)。持っている 1 MiB を全部 DOM に載せると、数行を読むために窓ぜんぶを描くことになる。DOM に載せるのは viewport とその上下 600px に掛かる group だけで、残りは上と下に積む 2 つの空白の高さになる (窓全体の長さをスクロールバーに持たせるためのもので、中身は無い)。覚えるのは**測った高さ**で、鍵は node の名前 = その先頭 item の id。測っていない行には**測った分の平均**を置く — 1 行に縮んだ道具呼び出しと畳まれていないコードブロックでは高さが桁で違うので、固定の見積もりでは空白の長さを外す。描く範囲を決め直すのは scroll のたびではなく**範囲が変わった時だけ**で、指の細かい動きで transcript を描き直さない。

**末尾に張り付いているか、1 行に錨を下ろしているかのどちらか**。追っている間は末尾が動くたびに末尾へ置き直す — 見積もりが実測に置き換わるたびに空白の高さが動くので、1 度置いて終わりにはできない。動いてもいないのに置き直さないのは、端とみなす数 px の中には末尾から離れようとしている指も居るから。読んでいる間は「最初に目に入っている行の名前と、その上端からのずれ」を覚え、遡って前に頁が足された時も、上に居る行の高さを測り直した時も、その行を同じ位置に置き直す。index ではなく名前で覚えるのは、窓が前にも後ろにも伸びるから (index は伸びるたびに別の行を指す)。窓が手放した行の高さは、その行に付いていた fold の開閉と同じ契機で忘れる。

**描かれていない行にも既存の到達手段が届く**。数えるのが「持っているか」であって「今描かれているか」ではないのは畳まれた中と同じで、↑↓ での移動は、囲む fold を開くのと同じように、まず覚えている高さからその行の位置を出して窓ごとそこへ動かし、要素が出てから真ん中に寄せ直す。見積もりで動かした先にその行が居ることは、空白の高さと移動先が同じ高さの表から出ていることが保証する。

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

**木と本文の境目は動かせる**。掴んで動かすほかに、境目自身が focus を取って ←→ でも動く (WAI-ARIA の `separator` は矢印で動く前提の役なので、掴めるだけでは足りない)。幅は instance ごとに覚える (`ccmsg.layout.split:<instance>`) — 1 つの store に複数の instance が届くという、上の「localStorage のキー規律」と同じ理由。覚えるのは指を離した時だけで、動かしている途中の幅は書かない。読めない値・範囲外は「覚えていない」と同じに扱い、CSS の既定幅に戻す。狭い画面では 2 つが上下に積まれて左右の境目が無くなるので、そこでは境目ごと消える。

**markdown の表示モードはセッション単位の「最後の選択」**。パスごとに持つと、間に `.ts` を 1 つ開いただけで選択が消える (`.ts` に「コードかプレビューか」の答えは無いので、上書きさせない)。

## 表示中のものを探す

探す対象は **この画面が今持っているもの** だけ — Timeline の読み込み済みの範囲と、開いているファイルの本文。instance には何も聞かない (DR-0022)。ブラウザの Cmd+F は畳んだ中に効かず PWA では開けないので、`/` と ⌘F はこの窓が受ける。

クエリは行内の空白が AND、改行が OR。ダブルクオートの句は 1 ワードで、句の中の連続空白は `\s+` に合わせる。`[Aa]` `[.*]` で大小の区別と正規表現に切り替える。**この文法は画面のもので契約にはない** — 契約は daemon と webui が交わす wire の取り決めで、人が窓に打つ文字列の読み方はそこに属さない。

数えるのは「持っているか」であって「今描かれているか」ではない。畳まれた中の一致も `[N/M]` に入り、↑↓ で辿り着く時に囲む fold を開いてから出す (`fold-tree.ts` が囲む fold を答える)。かたまりの単位は **1 item** (と、その中に畳んだ答え) で、名前はその item の id — 遡って手元が前に伸びても、同じ番号が同じ item を指し続ける。ファイルでは行番号が名前になるので、件数と移動はコード表示 (番号付きの行) のもの。プレビュー表示でも光りはするが、段落は名前を持たないので移動先にはならない。

数えた一致は必ず目で追える、を保つ: 道具の呼び出しは 1 行に縮めて出しているので、探す文も**縮めた後の文**にする (`item-view.ts`)。読み込んである全文で数えると「[3/12] と出ているのに 3 番目が見つからない」が起きる。

光らせ方は 2 通りある。地の文は render の時に text を切って `<mark>` を挟む (`markdown-view.tsx` の `text`)。色付け済みのコード行は span の列なので、同じ切り方を span 側に写して切り直す (`splitSpansForHighlight`)。切り直すので、一致が色の境界をまたいでも色は消えない。どちらの形も同じ `<mark>` を出す (`ui/search-marks.tsx`) ので、ファイル本文でも markdown の中のコードでも光り方は変わらない。色が届く前の素のコードは 1 つ目の切り方で光り、届いた後は 2 つ目に変わる。

## 会話は Timeline の上にある

人がセッションに話しかけ、返事を読む画面は別に作らない。**会話の正本はセッションの transcript** で、それを読む画面は既にあるため。往復の 2 方向は transcript の中で違う形をしている。

- **人 → セッション**: `message_send { to: sid, text }`。宛先は sid ひとつで room は無い。届いた 1 通は、セッション側の user turn に `<cross-session-message>` の封筒として現れる
- **セッション → 人**: セッションが走らせる `ccmsg reply <mid> <text>`。`--to` が無い返事は人宛で、instance がそれを通知に変えて届ける

どちらの方向も、画面に届く時には `message:session:in` / `message:session:out` という 1 つの型になっている。封筒を読み戻すのも、返事の Bash コマンドから本文を取り出すのも、file を持っている instance の側の仕事 — 同じ文法の写しが 2 つあると、契約が変わっても画面は古い綴りを読み続ける。

## 端末は借りて表示する

セッションが動いている端末そのものを開ける。ただし **端末を描くのはこの画面ではない** — instance が `hello` で名乗る gateway (`terminal_gateway`) の画面を iframe に借りるだけで、端末の描画も入力もこちら側には無い。持てば、同じものの二つ目の実装を抱えることになる。

**URL は 2 つの値の合成でしかない**。gateway の base と、セッションが `agents` の行で名乗る `terminal_id` を並べて `<gateway>/sessions/<terminal_id>` にする (契約 `hello.ts`)。`/sessions/` から下は gateway の綴りで契約のものではないので、base に path が付いていればその下に足す。base の末尾の `/` は同じ gateway を指すものとして読む。http / https 以外・どちらかの値が無い場合は URL を作らない — 行き先の無いリンクは、リンクが無いより悪い。

**届かないなら出さない**。gateway を名乗らない instance のセッション、端末を名乗らないセッションでは、タブそのものを出さない (`visibleTabs`)。ただし URL の文法は端末のタブを常に読む — 届く場所で作られたリンクは届かない場所でも壊れた URL ではなく、404 ではなくその旨を言う画面に着く。

**端末を名乗るのは `agents` の行だけ**で、一覧の `agents` は稼働セッションと重複する行を落としている。なので端末の対応表は落とす前の行から作る (`terminalIdsBySid`) — 人が端末を開きたいのは、まさに今つながっているセッションであることが多い。

**埋め込みと素の URL を区別する**。タブの iframe には `?embed=1&resize=1` を付ける (gateway 側のヘッダを外し、枠の大きさに合わせて PTY を追従させる。埋め込みには設定を出す場所も覚える場所も無い)。一覧の行から開くリンクは gateway の画面そのものなので何も付けず、新しいタブに出す — 一覧を見失わずに端末を覗ける。

## 通知は残さない

`notify` topic の frame は event 粒度で、契約は 1 通も保持しない。webui もページのメモリにしか置かず、切断で捨てる。Timeline の末尾に出る通知の吹き出しは **transcript が追いつくまでの仮の姿**で、同じ返事が transcript に現れたらそちらが正 (吹き出しは破線で、確定した行と同じ重さにしない)。どのセッションを見ていても気づけるように、topbar にも直近の 1 件をトーストで出す。

## 送れない相手には送らせない

composer が有効なのは、instance が今つながっていると言っているセッションだけ。止まったセッション宛の `message_send` は instance が断るので、断られてから理由を読ませるのではなく、送れないことと理由 (終了した / 居なくなった / 未接続) を先に書く。

送れた場合の応答は 2 つの成功に分かれる: 今届いたか、inbox に積まれたか。積まれた方も失敗ではないので、文言は「待つ / 別のセッションに送り直す / 諦める」のどれなのかを言う (`src/conversation/send-outcome.ts`)。

大きすぎる 1 通も送らせない。契約の `MAX_FRAME_BYTES` は **送る側が守る上限**で、超えた行は instance が `bad_request` で断り接続はそのまま続く。断りに書けるのは大きさのことだけなので、送ってから読ませずに、これから送る行そのものを byte で測って止める (`src/frame-limit.ts`)。分けるかファイルに書くかは送る人が決めることなので、勧めるに留めて選ばない。

## 人には inbox が見えない

契約の `TOPIC_ATTRIBUTES` は `inbox` を `["session", "user"]` に開いているので、人としてつないだ接続も購読できる。**購読は通るが frame は 1 つも来ない** (v0.0.29 で実機確認: `topic_subscribe` は ok、snapshot も delta も無し)。daemon 側の理由は明快で、この topic が運ぶのは「そのセッションに宛てて言われたこと」であり、人はセッションではない — snapshot は接続の sid で引かれ、配送の push も宛先 sid の接続に絞られる。

`peers` の行にも未配送の件数は無い。つまり **instance の inbox が何通抱えているかを人が知る術は、この世代の契約には無い**。

出せるのは「この画面が送って、まだ渡っていない 1 通」だけ。`message_send` の応答 (`delivered: false` と理由) が唯一の一次情報なので、送った時にその場で書き留め、セッション一覧のバッジと Timeline 上部の一覧に出す (`conversation/held-messages.ts`)。ページのメモリにだけ置き、切断で捨てる: 渡ったかを確かめる術が無い以上、書き留めて残せば「もう届いているのに残っている古い控え」を作ることになる。一覧の「消す」も届いた印ではなく、人が気にしないと決めたということ。

`topic-fold.ts` に `element` の畳み方は足していない。畳む相手が無いのが 1 つ、契約の `InboxMessage` に削除を表す印が無いのがもう 1 つ — `element` 粒度は「削除は印付きの要素で来る」と定めているが、`inbox` の payload にその印を書く場所が無い。畳み方だけ先に用意しても、何を消すかを書けない。

## 人の認証 (passkey)

正本は daemon の DR-0001。ここに書くのは **ページが何をどこに持つか**だけ。

| もの | 置き場 | 理由 |
|---|---|---|
| access token | **ページのメモリだけ** (`src/auth/session.ts`) | WS を開ける秘密。store に置けば、この origin で走る全ての script が読める |
| refresh token | **httpOnly cookie** (ページからは読めない) | 読み書きするのは instance で、ページは「送られること」しか関与しない |
| endpoint | **どこにも持たない** (`location` から読む) | ページの出所そのもの。保存した値は location と食い違いうるだけで、`https://h/` と `https://h/personal/` は別の endpoint になる |
| passkey の rp_id | **どこにも持たない** | endpoint のホスト = ページのドメインなので、ブラウザの既定と一致する。`credentials.get()` に rpId は渡さない (DR-0001 §2.3) |

流れは 3 つに分かれ、入口は全て endpoint の `/auth/*` (`src/auth/client.ts`)。endpoint は末尾 `/` の base URL なので、route はその後ろに継ぐだけで引ける (`<endpoint>auth/<name>`、WS は `<endpoint>ws`)。scheme は書き換えない — WS も upgrade する HTTP 要求なので、`https:` のまま `new WebSocket()` に渡す (DR-0001 §2.7)。

- **登録**: `#register=<token>` を持って来た時だけ (`src/auth/register-link.ts`)。claims は表示のためだけに読む (署名を検証できるのは発行 instance だけ)。**6 桁のコードは URL に無い** ので入力させる — URL とコードが別経路で届くことが、URL が漏れても登録にならない根拠。端末ラベルは UA から埋めて人が書き換える (`src/auth/device-label.ts`)。fragment は読み込み時と `hashchange` の両方で読む — 既に開いているタブで登録リンクを開くと変わるのは fragment だけだから
- **認証**: access が無ければまず refresh cookie を試し、それも無ければ passkey の画面を出す。credential は名指ししない (resident な passkey が user handle で答え、誰かを引くのは instance の仕事)。求めるのは **この endpoint で登録した passkey** で、別ホスト・別パス prefix は別の登録になる
- **期限の延長**: `hello` の `auth_expires_at` が接続の期限。残り 10% で `/auth/refresh` → 同じ接続の上で `auth_refresh`。**繋ぎ直さない** — 数時間ごとに画面が瞬く理由が無い

再接続のたびに token を「取りに行く」形にしてある (`Connection` は値ではなく `TokenSource` を持つ)。切れた接続の向こう側で token が期限切れになっていても、その 1 箇所が refresh に落ちるだけで、他はそれを知らない。handshake を拒否された時も同じ口に「取り直し」として落ちる — 持っている token は family のものでページのものではないので、ページが読む期限は「まだ通用するか」を何も語らない。取れなければ認証の画面が出て、そこからしか戻れない。

## 同じセッションのタブは一緒に refresh する

**access token は family のもので、その人が開いている全てのタブが同じ 1 本を提示する** (DR-0001 §2.4)。タブが各自で refresh すると family を回して他のタブの足元から token を抜いてしまうので、ブラウザ側で協調する (`src/auth/tab-share.ts`)。

- refresh (`/auth/refresh` とそれに続く `auth_refresh`) は `navigator.locks.request()` の中で走る。1 セッションにつき同時に 1 タブだけ
- 得た結果は `BroadcastChannel` で他のタブへ配る。**メモリ間**で渡す (access token を store に書かないのは上の表のとおり)
- ロックを取ったタブは、refresh する前に同じ channel で**他のタブに尋ねる**。最初に返ってきた token を使う。聞く側に回るのは、ロックと message が別々の queue で渡るから — 他のタブが配ったものはまだ届いていないかもしれないし、自分が開く前に配られたものは二度と届かない。往復の間に誰も答えなければ、それがこのセッションの唯一のタブという意味なので refresh する
- handshake を拒否された時は、まず他のタブが配った最新の token を試してから refresh に落ちる
- Web Locks API が無い環境では各タブが自分で refresh する。これは協調が改善している側の挙動であって前提ではない — 別々に refresh しても収束するのは instance 側の据え置きによる

名前には **endpoint と sub** を含める (`ccmsg.auth.refresh:<endpoint>:<sub>`、`ccmsg.auth:<endpoint>:<sub>`)。理由は下の localStorage のキー規律と同じで、1 つの origin が複数の endpoint を、1 つの endpoint が複数の人を持ちうるから。まだ認証していないタブは sub を知らないので、分かるまでは endpoint だけで聞く。

## localStorage のキー規律

ブラウザの store はサイトに 1 つで、1 人が複数の instance に届く。だから **instance に属するものは instance を名前に含める**。

- **秘密も endpoint もここに置かない** (上記「人の認証」)
- session 単位で残す値: `ccmsg.<feature>:<instance>:<sid>` の 2 段 (agent の drilldown はさらに `<sid>/<agentKey>`)。sid は instance の上で 1 つのセッションを指す名前でしかない。Timeline の「自動で開く」設定 (`ccmsg.tl.autoOpen:...`) 、書きかけの本文 (`ccmsg.draft:<instance>:<sid>`)、Files タブが覚えている選択 (`ccmsg.files:<instance>:<sid>`) がこれ

## 契約の検証は契約の検証器で

届いた topic frame は `TOPIC_SCHEMAS` と契約の `isValid()` に通す。フィールドを 1 つずつ見る検査をここに書かない — 検査は契約の仕事で、通らない frame は「契約の食い違い」という 1 つの結論にしかならないため、警告バナーに落ちる。

## 観測できないもの

**ページは拒否された handshake の HTTP status を読めない。** token が通らなかった時も届かなかった時も、WebSocket API 上はどちらも詳細のない `error` イベントとして届く。ページはそのため「接続を拒否されたか、届きませんでした」としか言えない。

status 自体は消えているわけではなく、**ブラウザの console と network パネルには出る** (Chrome は `Unexpected response code: 401` と書く)。読めないのは JS であって人ではないので、切り分けはそこと daemon のログで行う。

## 契約に無いもの

access token を運ぶ subprotocol の接頭辞 (`ccmsg.token.`) と `/auth/*` のパスは、契約ではなく daemon の入口ポリシー (daemon §3.1、DR-0001 §2.7) にある。`@ccmsg/protocol` は export しないので `src/connection.ts` と `src/auth/endpoint.ts` に置いてある。

## ビルド

**endpoint のパス prefix はビルド時の `base` で決まる** (vite の `base`、既定 `/`)。ページは `location.origin` + `import.meta.env.BASE_URL` を自分の endpoint とするので、prefix 付きで配る instance には **その base でビルドした成果物**を置く (`bun x vite build --base=/personal/` を `https://h.example/personal/` に置く)。現在の `location.pathname` から prefix を推測しない — path はこのページが読む route であって、どこに配られたかを答えられるのはビルドだけ。

**route を読むのも書くのも同じ base から** (`src/base.ts`)。pathname は base を剥がしてから URL 文法に渡し、リンクは base を付けて書くので、`/personal/` に配った成果物では `/s/<sid>/timeline` が `/personal/s/<sid>/timeline` として現れる。base の外の address は unknown route — この成果物が答える場所ではない。文法そのもの (`src/route.ts`) は base を持たず引数で受け取る。リンクの意味が、成果物の置き場所で変わらないようにするため。

dev server は `/ws` `/auth` `/mesh` `/webhook` を daemon (`CCMSG_DEV_DAEMON`、既定 `http://127.0.0.1:39847`) に proxy する。本番の reverse proxy と同じ位置に立たせるためで、これが無いと endpoint がページの出所と一致せず、passkey も cookie も成立しない。

vite + esbuild の automatic JSX (`jsxImportSource: preact`)。`@preact/preset-vite` は使っていない: 提供するのは prefresh の HMR で、そのために Babel のツールチェーン全体が依存に入る。JSX の変換自体は esbuild が同じ出力を出す。HMR が要るようになったら preset を入れる判断に戻る。

## テスト

**2 つの走らせ方が 1 つの `test/` を分け合う**。`bun test` が読むのは `*.test.ts` で、純関数層 — 契約の畳み方、URL 文法、一覧の並び、jsonl の写像 — をブラウザ無しで固定する。Playwright が読むのは `*.visual.ts` (`test/visual/`) で、こちらは**描かれたもの**を基準画像と比べる。名前で分けているのは、既定の `*.spec.ts` を `bun test` も自分のものとして拾うため。

### 見た目の比較が立っているもの

見た目の比較は本物の上で走る: 使い捨ての config home に **daemon を 1 つ実際に起動**し、dev server を本番の reverse proxy と同じ位置に立たせ、ブラウザは CDP の virtual authenticator で **passkey を本当に登録する**。作り物なのは指だけで、登録も署名も daemon の検証をそのまま通る。セッションは harness を動かす代わりに、session として greeting する接続を書いてある — 本物の Claude Code は pid と時計と誰かの機械のパスを画面に載せるので、そのどれも基準画像にできない。

**同じ絵が 2 度描けることが、この比較の前提**。だから使い捨てのはずの path と port が固定してある (`test/visual/instance.ts`): 画面に出る endpoint も instance id もそこから derive されるので、乱数の付いた temp ディレクトリでは毎回違う文字列が写る。instance の id は daemon が作る前に置いてあり、transcript は時刻まで書き下した fixture で、残る 1 箇所 — 接続バーの、期限を数える所 — だけは mask で覆う。

### 基準画像は別リポにある

画像は `kawaz/ccmsg-webui-snapshots` にあり、この repo が持つのは digest だけ (`test/visual/manifest.json`)。基準画像の価値はその履歴 — 同じ画面の、version ごとの並び — で、それは source を clone する全員が払うには重い。manifest が答えるのは「今比べている基準画像は、この version が受け入れたものか」で、画面が変わったこと自体は比較の側が diff 画像付きで落ちる。

**基準画像は描いた platform のものと比べる** (`{platform}/<画面名>.png`)。mac と CI runner ではフォントも smoothing も違い、文字のある所は全部変わるので、閾値では吸収できない。container の中で 1 組だけ描く道もあるが、それは `just visual` に docker を要求する。

- `just visual` — 今の描画を基準画像と比べ、manifest と照合する
- `just visual-accept` — 今の描画を基準にし、snapshots リポに commit する (push は人がやる)。manifest は作業コピーに残るので、画面を変えた commit に一緒に入れる

`just ci` には**入れていない**。要るものが lint/typecheck/test と違う (daemon の source、browser の binary、基準画像リポ) ためで、CI では独立した job になっている。
