# キーバインドの修飾キー表記

- Date: 2026-09-17
- Status: Concluded

## 動機

DR-0003 §5 Q4 は、設定に人が書く綴り、保存する意味、画面に見せる表記を一つの文字列で兼ねる前提になっている。`Mod` は短いが、設定を読む人には何のキーか分からず、macOS の Command と Control が別の物理キーであることも隠す。

本調査は、最新の Chrome と Safari を対象に、ブラウザが識別できる情報、既存アプリケーションの文法、OS ごとの表示慣習を分けて確認し、DR-0003 の Q4 を裁定できる選択肢を示す。

## 調査範囲

- `KeyboardEvent` と関連 Web API で判別できるキーとプラットフォーム
- エディタ、IDE、デスクトップアプリケーション、Web アプリケーションの設定文法と表示
- macOS、Windows、GNOME、KDE の表示慣習
- Command と Control の統合指定、およびブラウザ標準ショートカットとの衝突
- 内部表現、設定入力、画面表示の責務分離

対象は単発のキーバインドである。連続打鍵は DR-0003 Q5 の論点であり、本調査では文法を決めない。

## 調査メモ

### 2026-09-17: ブラウザが観測できるもの

UI Events 仕様は、`KeyboardEvent.key` を利用者の意図するキー値、`KeyboardEvent.code` を現在の配列や修飾状態に左右されない物理位置として定義する。`code` には `MetaLeft`、`MetaRight`、`ControlLeft`、`ControlRight`、`AltLeft`、`AltRight`、`ShiftLeft`、`ShiftRight` があり、左右を区別できる。`key` は配列と修飾状態を反映するため、同じ物理位置でも配列によって `"y"` と `"z"` のように変わる。

- UI Events KeyboardEvent: https://w3c.github.io/uievents/#interface-keyboardevent
- UI Events code values: https://w3c.github.io/uievents-code/
- UI Events key values: https://w3c.github.io/uievents-key/
- MDN `KeyboardEvent.code`: https://developer.mozilla.org/docs/Web/API/KeyboardEvent/code
- MDN `KeyboardEvent.key`: https://developer.mozilla.org/docs/Web/API/KeyboardEvent/key

`metaKey`、`ctrlKey`、`altKey`、`shiftKey` はそれぞれ独立した boolean である。macOS では Command が `metaKey`、Control が `ctrlKey` になり、ブラウザは両者を区別できる。DOM には「macOS なら Command、それ以外なら Control」を表す標準の集約プロパティはない。

- UI Events modifier state: https://w3c.github.io/uievents/#keys-modifier
- MDN `metaKey`: https://developer.mozilla.org/docs/Web/API/KeyboardEvent/metaKey
- MDN `ctrlKey`: https://developer.mozilla.org/docs/Web/API/KeyboardEvent/ctrlKey
- MDN `altKey`: https://developer.mozilla.org/docs/Web/API/KeyboardEvent/altKey
- MDN `shiftKey`: https://developer.mozilla.org/docs/Web/API/KeyboardEvent/shiftKey

`getModifierState()` は仕様で定めた modifier key value を名前で問い合わせる。`Control`、`Meta`、`Alt`、`Shift` に加え `AltGraph`、`CapsLock`、`NumLock` などを扱える。ただし `AltGraph` の生成方法と対応はプラットフォーム依存であり、Windows の一部配列では Ctrl+Alt と同時状態になる。したがって `AltGraph` と Ctrl+Alt を交換可能な綴りとして扱うと、文字入力をショートカットとして奪う。

- UI Events `getModifierState()`: https://w3c.github.io/uievents/#dom-keyboardevent-getmodifierstate
- MDN `getModifierState()`: https://developer.mozilla.org/docs/Web/API/KeyboardEvent/getModifierState

`navigator.platform` は HTML Standard 上で互換目的の情報であり、新しいコードでの利用は非推奨と MDN が明記する。User-Agent Client Hints の `navigator.userAgentData.platform` は User-Agent Client Hints 仕様の値だが、MDN では limited availability であり、Safari を含む全対象で使える基盤ではない。従って表示プラットフォームの判定は、`userAgentData.platform` があれば利用し、なければ `navigator.platform` を互換フォールバックにする。判定できない場合は記号へ翻訳せず語で表示する。プラットフォーム判定をキーバインドの意味そのものに混ぜない。

- HTML Standard `Navigator.platform`: https://html.spec.whatwg.org/multipage/system-state.html#dom-navigator-platform
- MDN `navigator.platform`: https://developer.mozilla.org/docs/Web/API/Navigator/platform
- User-Agent Client Hints `platform`: https://wicg.github.io/ua-client-hints/#dom-navigatoruadata-platform
- MDN `NavigatorUAData.platform`: https://developer.mozilla.org/docs/Web/API/NavigatorUAData/platform

Keyboard Map API の `navigator.keyboard.getLayoutMap()` は `code` から現在の配列で印字される文字への対応を返す。物理位置で保存したキーを人の刻印に近い文字で表示する用途に合うが、MDN では experimental かつ limited availability で、Keyboard API 仕様は secure context と権限制御を定める。Safari を含む共通の必須経路にはできない。利用できる時だけ表示を改善し、利用できない時は `code` の標準名を表示する。

- Keyboard Map API: https://wicg.github.io/keyboard-map/
- MDN `Keyboard.getLayoutMap()`: https://developer.mozilla.org/docs/Web/API/Keyboard/getLayoutMap

### 2026-09-17: 既存アプリケーションの設定文法

| 製品 | 公式文法・表記 | Command と Control の統合指定 | 観察 |
|---|---|---|---|
| VS Code | `ctrl`、`shift`、`alt`、`cmd`。OS 別の `keybindings.json` 例と、`Ctrl+K Ctrl+S` の画面表示を持つ | 共通設定で `ctrl` と `cmd` を一語にはしない。OS ごとの `isMac` 条件や OS 別既定を使う | 設定の語と表示ラベルを分離している |
| Electron | Accelerator に `Command` / `Cmd`、`Control` / `Ctrl`、`CommandOrControl` / `CmdOrCtrl`、`Alt` / `Option`、`Super`、`Meta` を持つ | `CommandOrControl` が macOS の Command、Linux/Windows の Control に解決される | 統合指定と個別指定の両方を持つ代表例 |
| Zed | JSON の `ctrl-`、`alt-`、`shift-`、`cmd-`、`fn-`、`win-`、`platform-` | `platform-` は macOS の Command、Linux/Windows の Control | 抽象名を提供しつつ具体名も受ける |
| Sublime Text | `ctrl`、`alt`、`shift`、`super` | `super` は macOS の Command、Windows の Windows key、Linux の Super であり Command-or-Control ではない | 同じ語でも Electron の集約修飾子とは意味が違う |
| JetBrains | Keymap を OS 別に提供し、UI は macOS 記号または `Ctrl+` 等で表示 | 設定用の共通テキスト修飾子より、OS 別 keymap で分ける | 既定表の分離を選ぶ例 |
| Vim | key notation に `<C-…>`、`<M-…>`、`<A-…>`、`<D-…>` | `<D-…>` は Command、`<C-…>` は Control。統合指定はない | 個別キーを明記する |
| Emacs | `C-`、`M-`、`S-`、`H-`、`s-`、`A-` | `s-` は Super、`M-` は Meta。Command-or-Control の共通指定はない | 歴史的 modifier 名を個別に扱う |

一次資料:

- VS Code keybindings: https://code.visualstudio.com/docs/configure/keybindings
- VS Code default keyboard shortcuts reference: https://code.visualstudio.com/docs/reference/default-keybindings
- Electron accelerators: https://www.electronjs.org/docs/latest/api/accelerator
- Zed key bindings: https://zed.dev/docs/key-bindings
- Sublime Text key bindings: https://www.sublimetext.com/docs/key_bindings.html
- JetBrains keyboard shortcuts: https://www.jetbrains.com/help/idea/keyboard-shortcuts.html
- Vim key notation: https://vimhelp.org/intro.txt.html#key-notation
- Emacs modifier keys: https://www.gnu.org/software/emacs/manual/html_node/emacs/Modifier-Keys.html

ここから分かるのは、「統合修飾子だけ」または「個別指定だけ」が一般解なのではなく、製品の移植方針で二群に分かれることである。Electron と Zed は統合指定と個別指定を併設する。VS Code、JetBrains、Vim、Emacs は OS 別表または個別指定を選ぶ。`Mod`、`Meta`、`Super` は製品間で意味が一致しないため、説明なしの入力語には向かない。

### 2026-09-17: Web アプリケーションの表示慣習

| 製品 | 公式画面・文書の表記 | 統合修飾子を人に見せるか |
|---|---|---|
| Obsidian | Hotkeys 設定で実際の OS のキーを記録し、macOS では記号を使う | `Mod` のような抽象語は見せない |
| Notion | 公式 shortcut 文書で `cmd/ctrl` のように OS 差を併記する | 設定トークンではなく説明上の併記 |
| Linear | 公式 shortcut 文書とアプリ内一覧で現在の OS に合うキーを示す | 抽象語を主表示にしない |
| GitHub | Keyboard shortcuts 文書でキーそのものを示し、Command Palette は macOS と Windows/Linux の組を分けて記載する | OS ごとの具体的なキーを示す |

一次資料:

- Obsidian hotkeys: https://help.obsidian.md/hotkeys
- Notion keyboard shortcuts: https://www.notion.com/help/keyboard-shortcuts
- Linear keyboard shortcuts: https://linear.app/docs/keyboard-shortcuts
- GitHub keyboard shortcuts: https://docs.github.com/get-started/accessibility/keyboard-shortcuts
- GitHub Command Palette: https://docs.github.com/get-started/accessibility/github-command-palette

Web アプリケーションの画面表示では、保存文法の抽象トークンをそのまま見せるより、現在の OS の具体キーへ翻訳する傾向が一貫している。

### 2026-09-17: OS ごとの表示

Apple はキーボードショートカットで Control `⌃`、Option `⌥`、Shift `⇧`、Command `⌘` の記号を定義し、メニューでは修飾記号に続けてキーを表示する。Apple のメニュー表記に `+` は入らない。一般的な順序は Control、Option、Shift、Command、主キーである。

- Apple keyboard shortcut symbols: https://support.apple.com/guide/mac-help/what-are-those-symbols-shown-in-menus-cpmh0011/mac
- Apple HIG keyboards: https://developer.apple.com/design/human-interface-guidelines/keyboards

Microsoft の設計ガイドは `Ctrl+P` のようにキー名を `+` で結ぶ表記を使い、Windows key は Windows ロゴキーとして扱う。GNOME HIG と KDE HIG も `Ctrl+`、`Alt+`、`Shift+`、`Super+` / `Meta+` の語による表記を採る。Linux デスクトップ間では OS キーの呼称が Super と Meta に分かれるため、本製品の表示はブラウザから安定して識別できる `Meta` を保存語とし、画面では Windows と確定できる時だけ `Win`、それ以外は `Meta` とするのが誤認を生まない。

- Microsoft keyboard accelerators: https://learn.microsoft.com/windows/apps/design/input/keyboard-accelerators
- Microsoft keyboard interaction: https://learn.microsoft.com/windows/apps/design/input/keyboard-interactions
- GNOME HIG keyboard: https://developer.gnome.org/hig/guidelines/keyboard.html
- KDE HIG keyboard shortcuts: https://develop.kde.org/hig/keyboard/shortcuts/

表示規則は次のように分けられる。

| 保存上の意味 | macOS 表示 | Windows 表示 | Linux / 不明表示 |
|---|---|---|---|
| Meta | `⌘` | `Win` | `Meta` |
| Control | `⌃` | `Ctrl` | `Ctrl` |
| Alt | `⌥` | `Alt` | `Alt` |
| Shift | `⇧` | `Shift` | `Shift` |
| Primary | `⌘` | `Ctrl` | `Ctrl` |
| 区切り | なし | `+` | `+` |

macOS の表示順は `⌃⌥⇧⌘K`、それ以外は `Ctrl+Alt+Shift+Meta+K` とする。内部の比較順もこの正規順に固定すれば、入力順が異なっても同じ binding として扱える。

### 2026-09-17: Command と Control をまとめる条件

macOS で Command と Control は異なるキーであり、`metaKey` と `ctrlKey` も別である。Control は端末の制御文字、Emacs 系操作、VoiceOver など固有の操作に使われる。従って「macOS では Command または Control のどちらでも発火する」という意味にまとめてはならない。

Electron の `CommandOrControl` と Zed の `platform` は、「現在のプラットフォームの主要なアプリケーション修飾子一つへ解決する」抽象指定である。これは論理 OR ではない。統合指定を持つ場合も、`Primary` は macOS で Meta のみ、それ以外で Control のみに解決し、`Meta` と `Control` の個別指定を併設する必要がある。

| 機能 | macOS のブラウザ標準 | Windows / Linux のブラウザ標準 | 同じ論理機能か |
|---|---|---|---|
| ページ内検索 | `⌘F` | `Ctrl+F` | はい |
| アドレスバーへ移動 | `⌘L` | `Ctrl+L` | はい |
| 新しいタブ | `⌘T` | `Ctrl+T` | はい |
| タブを閉じる | `⌘W` | `Ctrl+W` | はい |
| 再読み込み | `⌘R` | `Ctrl+R` | はい |
| 保存 | `⌘S` | `Ctrl+S` | はい |
| 印刷 | `⌘P` | `Ctrl+P` | はい |
| 履歴 | `⌘Y` | `Ctrl+H` | いいえ |
| 戻る / 進む | `⌘[` / `⌘]` | `Alt+Left` / `Alt+Right` | はい。ただし修飾子が対応しない |
| 開発者ツール | `⌥⌘I` | `Ctrl+Shift+I` | はい。ただし修飾子が対応しない |

Chrome と Safari の公式 shortcut 一覧:

- Chrome macOS: https://support.google.com/chrome/answer/157179?hl=en&co=GENIE.Platform%3DDesktop#zippy=%2Cmac
- Chrome Windows / Linux: https://support.google.com/chrome/answer/157179?hl=en&co=GENIE.Platform%3DDesktop#zippy=%2Cwindows-linux
- Safari macOS: https://support.apple.com/guide/safari/keyboard-and-other-shortcuts-cpsh003/mac

`Primary` で OS 差を吸収できるのは、上表の最初の七つのように同じ機能が Command 対 Control で対応する場合だけである。ブラウザ標準との衝突検査は、抽象名を現在のプラットフォームへ解決した後の binding に対して行う。

### 2026-09-17: 設定でも拒否する組み合わせ

ブラウザや OS がイベントをページへ配送するかは、製品、OS、ブラウザ設定、インストール済み拡張により変わる。本製品の禁止表は「必ず捕捉できないキー」の表ではなく、「捕捉できてもブラウザの基本操作を奪わない」ための製品ポリシーである。

| 論理操作 | macOS で拒否 | Windows / Linux で拒否 | 理由 |
|---|---|---|---|
| ページ内検索 | `Meta+KeyF` | `Control+KeyF` | DR-0003 が明示するブラウザ内検索 |
| アドレスバー | `Meta+KeyL`、`Meta+KeyK` | `Control+KeyL`、`Control+KeyK` | ページから離れる主要導線 |
| タブ作成・終了 | `Meta+KeyT`、`Meta+KeyW` | `Control+KeyT`、`Control+KeyW` | タブ管理と復帰可能性 |
| 再読み込み | `Meta+KeyR` | `Control+KeyR`、`F5` | ページ回復の導線 |
| 保存・印刷 | `Meta+KeyS`、`Meta+KeyP` | `Control+KeyS`、`Control+KeyP` | ブラウザの文書操作 |
| タブ移動 | `Control+Tab`、`Control+Shift+Tab`、`Meta+Digit1` から `Meta+Digit9` | `Control+Tab`、`Control+Shift+Tab`、`Control+Digit1` から `Control+Digit9` | タブ間移動 |
| 戻る・進む | `Meta+BracketLeft`、`Meta+BracketRight` | `Alt+ArrowLeft`、`Alt+ArrowRight` | ナビゲーション |
| 開発者ツール | `Alt+Meta+KeyI` | `Control+Shift+KeyI`、`F12` | 診断と回復の導線 |
| 全画面 | `Control+Meta+KeyF` | `F11` | ブラウザ表示モード |
| Escape | `Escape` | `Escape` | DR-0003 §2.5 により部品が閉じる責務 |

Safari だけ、Chrome だけの追加操作を共通禁止集合へ無制限に足すと、利用できる組み合わせが不必要に減る。実装時には対象ブラウザの公式一覧を versioned data として持つのではなく、上の回復・移動・検索に関わる安定した集合を製品ポリシーとして固定する。ブラウザ固有の衝突が新たに判明した場合は、その組み合わせと失われる操作を根拠に集合へ追加する。

### 2026-09-17: 内部・入力・表示を分けた提案

#### 内部表現

保存と実行は、物理位置を表す `code` と正規化済みの修飾子集合を持つ構造にする。

```ts
type Modifier = "Primary" | "Meta" | "Control" | "Alt" | "Shift"

type Binding = {
  code: string
  modifiers: ReadonlySet<Modifier>
}
```

`Primary` は保存された論理指定であり、読み込み時に `Meta` または `Control` へ潰さない。こうすれば設定を別 OS へ持ち運んでも意味を保てる。イベント照合時に macOS なら `metaKey`、それ以外なら `ctrlKey` へ解決する。`Primary` と、その解決先になる具体修飾子を同時指定した binding は重複して意味が曖昧になるため parse 時に拒否する。集合にすることで入力順と重複を正規化し、boolean の組合せによる不正状態を内部へ持ち込まない。左右修飾子はブラウザには見えるが、設定語には導入しない。左右を入れるとノート PC、外付けキーボード、アクセシビリティ入力で移植性を失うためである。

`code` を採る理由は、DR-0003 のキーバインドが画面操作の位置として記憶される性質に合い、配列変更でも物理位置を保つからである。文字としての `/` など、刻印そのものを意味にしたい操作を後から要求する場合は、`key` 基準の別 variant として型で区別する。単一文字列に `key` と `code` を混在させない。

#### 設定入力

正規の入力語は `Primary`、`Meta`、`Ctrl`、`Alt`、`Shift` と UI Events の `code` 名にする。例は `Primary+Shift+KeyK`、`Ctrl+KeyA`、`Meta+BracketLeft`。大文字小文字は区別せず受理し、format 時は正規形へ戻す。

互換 alias は次に限る。

| 入力 | 正規形 | 理由 |
|---|---|---|
| `Command`、`Cmd` | `Meta` | macOS 利用者の具体語 |
| `Control` | `Ctrl` | 省略しない語 |
| `Option` | `Alt` | macOS の刻印語 |
| `CmdOrCtrl`、`CommandOrControl` | `Primary` | Electron 利用者に意味が明確な移行語 |
| `Accel` | `Primary` | UI Events に歴史的な accelerator 概念があるが、format では使わない |

`Mod`、`Super`、`Win` は受理しない。`Mod` は何のキーか読めず、`Super` と `Win` は既存製品間で Meta と OS 主修飾子のどちらを指すか一致しない。未知語を推測して受理せず、「`Primary`、`Meta`、`Ctrl`、`Alt`、`Shift` のいずれかを使う」と原因と対処を返す。

#### 画面表示

表示は保存文字列を再利用せず、現在の platform と layout map から生成する。macOS では `Primary` / `Meta` を `⌘`、`Ctrl` を `⌃`、`Alt` を `⌥`、`Shift` を `⇧` にし、`+` を置かない。それ以外では `Primary` を `Ctrl` にし、語を `+` で結ぶ。`getLayoutMap()` が使える時は `KeyK` などを現在配列の刻印へ変換し、使えなければ `code` の安定名を表示する。

設定編集画面では、翻訳済み表示の近くに正規入力 `Primary+Shift+KeyK` も示す。記号だけでは設定へ転記できず、入力語だけでは実際のキーが分からないためである。

## 暫定的な結論

### 推奨: `Primary` と具体修飾子を併設する

DR-0003 Q4 は次で確定するのがよい。

1. 保存は `{ code, modifiers }` の意味構造とし、文字列は parse / format 境界だけに置く。
2. 設定入力の正規形は `Primary+Shift+KeyK` とし、`Meta` / `Ctrl` による個別指定も許す。
3. `Primary` は macOS の Meta、それ以外の Control 一つへ解決し、Command と Control の論理 OR にはしない。
4. 表示は macOS の記号列と、それ以外の `+` 付き語へ翻訳する。
5. イベント照合は `KeyboardEvent.code` と modifier boolean を用いる。layout map は表示改善にだけ用いる。
6. ブラウザ標準との衝突は platform 解決後の binding に対し、上の禁止表で設定時に拒否する。

この案の悪い面は、`Primary` という抽象語を一つ学ぶ必要があり、内部に platform 解決規則が増えることである。一方、`Mod` より意味を説明しやすく、設定を OS 間で持ち運べ、Command と Control の個別指定も失わない。Electron と Zed の「集約指定と具体指定を併設する」実績にも沿う。

### DR-0003 Q4 の選択肢

| 案 | 内容 | 根拠 | 悪い面 |
|---|---|---|---|
| A. `Primary` + 個別指定 | 推奨案。`Primary`、`Meta`、`Ctrl` を併設し、`code` で照合する | Electron と Zed が集約・個別を併設。OS 間で設定を移せる | 抽象語の説明と platform 解決が必要 |
| B. OS 別の既定表 | `Meta+…` と `Ctrl+…` だけを持ち、設定 section を OS ごとに分ける | VS Code、JetBrains、Vim、Emacs の個別指定に近い | 同じ意図を二度書く。設定の持ち運び時に欠落しやすい |
| C. 個別指定だけの単一表 | `Meta+…` と `Ctrl+…` を必要な OS 分だけ並べる | DOM の観測値へ最も直接対応する | 同じ action に重複 binding が必要で、設定一覧が冗長になる |

`CmdOrCtrl` は意味が明確だが設定の中心語として長い。`Accel` は一般利用者の語ではなく、`Mod` は具体キーを説明しない。正規名は `Primary`、`CmdOrCtrl` は入力 alias に留めるのが読みやすさと既存慣習の両方を保つ。

## 関連

- [DR-0003](../decisions/DR-0003-an-action-is-what-a-key-and-a-button-both-reach.md) §2.5、§5 Q4
- [QUESTIONS](../QUESTIONS.md) WU-Q3
- UI Events: https://w3c.github.io/uievents/
- UI Events KeyboardEvent code values: https://w3c.github.io/uievents-code/
- Keyboard Map API: https://wicg.github.io/keyboard-map/
