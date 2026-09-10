# ccmsg-webui
#
# kawaz/* リポの共通テンプレ (kawaz/bump-semver justfile が canonical) に揃えてある。
# 言語依存箇所 (lint/typecheck/test/build) のみカスタム。VCS 操作と翻訳鮮度チェックは
# bump-semver vcs サブコマンドに委譲する。
# ---------- settings ----------

set unstable
set guards
set lazy
set shell := ["bash", "-eu", "-o", "pipefail", "-c"]
set script-interpreter := ["bash", "-eu", "-o", "pipefail"]

# ---------- variables ----------
# bump-version トリガとなる product code パス。実装と、その解釈を左右する
# lock / build 設定を対象にする。docs/ や *.md / justfile は除外。

bump-trigger-paths := "src/ index.html bun.lock tsconfig.json vite.config.ts"

version-files := "package.json"

# 基準画像の置き場。本体リポは manifest (sha256) だけを持ち、画像は別リポの
# 履歴に閉じる。既定は隣に clone されたもので、別の場所なら環境変数で指す。

snapshots-repo := "https://github.com/kawaz/ccmsg-webui-snapshots.git"

snapshots-dir := env("CCMSG_WEBUI_SNAPSHOTS", justfile_directory() / "../../ccmsg-webui-snapshots/main")

# ---------- default ----------

# レシピ一覧を表示
default:
    @just --list

# ---------- main entries ----------

# push (バージョン bump 済みを前提、全 gate 通過後に push)
push: check-on-default-branch ensure-clean ci check-translations check-version-bumped
    bump-semver vcs push --branch main --jj-bookmark-auto-advance

# version を bump して Release commit を作成 (push は別途 `just push`)
[script]
bump-version bump="patch": ensure-clean
    new_version=$(bump-semver {{ bump }} {{ version-files }} --write --no-hint)
    bump-semver vcs commit --allow-nonexistent-path -m "Release v${new_version}" {{ version-files }}

# CI 単一エントリ (lint→typecheck→test を依存重複排除で1回ずつ保証)
ci: lint typecheck test

# 現在の version を表示
version:
    @bump-semver get {{ version-files }} --no-hint

# ---------- dev recipes ----------

# lint (justfile フォーマット確認 + oxlint (type-aware) + oxfmt の整形確認)
lint:
    just --fmt --check --unstable
    bun x oxlint
    bun x oxfmt --check

# 型チェック
typecheck: lint
    bun x tsc --noEmit

# テスト (契約の畳み方・URL 文法・一覧の並びの固定)
test: lint typecheck
    bun test

# 静的サイトを dist/ に出す
build:
    bun x vite build

# dev server (別 origin で daemon に繋ぐ前提。daemon 側の entry.origins に入れる)
dev:
    bun x vite

# ---------- visual recipes (画面の見た目) ----------

# 画面の見た目を基準画像と比べる (基準は kawaz/ccmsg-webui-snapshots)
visual: check-snapshots
    bun x playwright test
    bun test/visual/manifest.ts verify

# 今の描画を基準にする (snapshots リポに commit、manifest は作業コピーに残す)
[script]
visual-accept: check-snapshots
    bun x playwright test --update-snapshots
    bun test/visual/manifest.ts write
    dir="{{ snapshots-dir }}"
    version=$(just version)
    (
        cd "$dir"
        git add -A -- '*.png'
        if git diff --cached --quiet; then
            printf '基準画像は変わっていません (commit しません)\n'
            exit 0
        fi
        git commit -m "Redraw the baselines for webui v${version}" -- '*.png'
        printf 'snapshots リポの commit を確認して push してください: %s\n' "$PWD"
    )
    printf 'manifest.json は作業コピーに残してあります (画面を変えた commit に含めてください)\n'

# 基準画像リポの clone があるか (無ければ取り方を出す)
[private]
[script]
check-snapshots:
    dir="{{ snapshots-dir }}"
    if [ ! -d "$dir/.git" ]; then
        printf >&2 '基準画像リポがありません: %s\n  git clone --depth 1 %s "$dir"\n  (別の場所に置くなら CCMSG_WEBUI_SNAPSHOTS で指す)\n' "$dir" "{{ snapshots-repo }}"
        exit 1
    fi

# ---------- check recipes (push の sanity 検証) ----------

# 現在の bookmark/branch が default (= main) 上にあるか確認
[private]
[script]
check-on-default-branch:
    if ! bump-semver vcs is on-default-branch; then
        bn=$(bump-semver vcs get default-branch)
        printf >&2 "⚠ default branch (%s) に合流してから push してください\n  1. just sync\n  2. just promote\n  3. %s ワークスペースに移動して just push\n" "$bn" "$bn"
        exit 1
    fi

# 現在の worktree を default branch に rebase
sync:
    bump-semver vcs sync --onto $(bump-semver vcs get default-branch)@origin

# default branch を現在の commit に forward (push しない)
promote:
    bump-semver vcs promote

# ワーキングコピーがクリーン (jj は @ が empty、git は porcelain 空)
ensure-clean: lint
    bump-semver vcs is clean

# 翻訳ペア (NAME-ja.md / NAME.md) の整合性チェック
check-translations: ensure-clean check-translation-freshness (_check-translation-headers "README") (_check-translation-headers "docs/DESIGN")

# 翻訳ペアの鮮度: en の最終 commit timestamp >= ja
[private]
check-translation-freshness:
    bump-semver vcs outdated 'glob:**/*-ja.md' '$1/$2.md'

# 相互リンクヘッダの確認 (vcs outdated は timestamp のみ検証するので grep は別途)
[private]
_check-translation-headers name:
    test -f {{ name }}-ja.md
    test -f {{ name }}.md
    head -5 {{ name }}-ja.md | grep -qF "🇬🇧"
    head -5 {{ name }}.md    | grep -qF "🇯🇵"

# product code に変更があれば version も main@origin より bump 済か検証
[private]
[script]
check-version-bumped:
    rc=0
    bump-semver vcs diff -q main@origin -- {{ bump-trigger-paths }} || rc=$?
    case "$rc" in
      0) exit 0 ;;
      1) ;;
      *) echo "ERROR: bump-semver vcs diff failed (rc=$rc). main@origin が track されていない可能性" >&2; exit 1 ;;
    esac
    bump-semver compare gt package.json vcs:main@origin:package.json --no-hint && exit 0
    echo 'ERROR: bump-trigger-paths が変わってるが version 未 bump。"just bump-version" を実行してください' >&2
    exit 1
