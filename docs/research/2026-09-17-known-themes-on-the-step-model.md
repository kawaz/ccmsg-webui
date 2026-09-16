# 既知テーマを 12 段モデルへ載せるための層 1 パラメータ

- Date: 2026-09-17
- Status: Concluded

## 動機

現行カラーシステムは層 0 に色相と彩度、層 1 に全色相共通の 12 段、層 2 に意味名を置く。既知のエディタテーマを同じ土俵で表すには、色相の組だけでなく、テーマ固有の明るさと彩度の形を少数の入力へ分解する必要がある。本調査は公式パレットを OKLCH へ変換し、役割へ対応付け、層 1 に必要なパラメータと再現誤差を実測する。

## 調査範囲

- 13 face を対象にする: Solarized Light / Dark、Nord、Dracula、Gruvbox Light / Dark、Catppuccin Latte / Mocha、One Dark、Tokyo Night、GitHub Light / Dark、Rosé Pine。
- 公式パレットが持つ色を `地 / 面 / 罫 / 弱い文字 / 文字 / accent / info / success / warning / danger` に対応付ける。構文トークン色は層 1 の役割ではないため対象にしない。
- 公式パレットは 12 段を直接持たない。公式観測点は段 1、3、7、9、11、12 にだけ置き、間の段は比較用の線形補間値として区別する。fit の誤差は公式観測点だけで計算する。
- 数値は sRGB hex を culori で OKLCH へ変換した値である。L/C は小数 3 桁、h は度で示す。

## 調査メモ

### 2026-09-17: 公式パレットと役割割当

割当規則はテーマ間で固定した。editor background を段 1、panel / selection background を段 3、border を段 7、通常文字を段 12、secondary text / comment を段 11、primary blue / purple を段 9、公式の cyan-blue / green / yellow / red を意味色に置いた。テーマが専用の状態名を持たない場合も、公式パレット内の色を慣習的な意味へ割り当て、色自体は補作していない。

| テーマ | face | 公式一次資料 |
|---|---|---|
| Solarized Light | light | [https://github.com/altercation/solarized/blob/master/README.md](https://github.com/altercation/solarized/blob/master/README.md) |
| Solarized Dark | dark | [https://github.com/altercation/solarized/blob/master/README.md](https://github.com/altercation/solarized/blob/master/README.md) |
| Nord | dark | [https://www.nordtheme.com/docs/colors-and-palettes](https://www.nordtheme.com/docs/colors-and-palettes) |
| Dracula | dark | [https://github.com/dracula/dracula-theme#color-palette](https://github.com/dracula/dracula-theme#color-palette) |
| Gruvbox Light | light | [https://github.com/morhetz/gruvbox/blob/master/colors/gruvbox.vim](https://github.com/morhetz/gruvbox/blob/master/colors/gruvbox.vim) |
| Gruvbox Dark | dark | [https://github.com/morhetz/gruvbox/blob/master/colors/gruvbox.vim](https://github.com/morhetz/gruvbox/blob/master/colors/gruvbox.vim) |
| Catppuccin Latte | light | [https://github.com/catppuccin/palette/blob/main/palette.json](https://github.com/catppuccin/palette/blob/main/palette.json) |
| Catppuccin Mocha | dark | [https://github.com/catppuccin/palette/blob/main/palette.json](https://github.com/catppuccin/palette/blob/main/palette.json) |
| One Dark | dark | [https://github.com/joshdick/onedark.vim/blob/main/colors/onedark.vim](https://github.com/joshdick/onedark.vim/blob/main/colors/onedark.vim) |
| Tokyo Night | dark | [https://github.com/folke/tokyonight.nvim/blob/main/lua/tokyonight/colors/night.lua](https://github.com/folke/tokyonight.nvim/blob/main/lua/tokyonight/colors/night.lua) |
| GitHub Light | light | [https://github.com/primer/primitives/tree/main/src/tokens/functional/color](https://github.com/primer/primitives/tree/main/src/tokens/functional/color) |
| GitHub Dark | dark | [https://github.com/primer/primitives/tree/main/src/tokens/functional/color](https://github.com/primer/primitives/tree/main/src/tokens/functional/color) |
| Rosé Pine | dark | [https://github.com/rose-pine/palette/blob/main/palette.json](https://github.com/rose-pine/palette/blob/main/palette.json) |

### 公式観測色の OKLCH

各セルは `hex; L/C/h`。

| テーマ | 地 | 面 | 罫 | 弱字 | 文字 | accent | info | success | warning | danger |
|---|---|---|---|---|---|---|---|---|---|---|
| Solarized Light | `#fdf6e3; 0.974/0.026/90.1` | `#eee8d5; 0.931/0.026/92.4` | `#93a1a1; 0.698/0.016/196.8` | `#657b83; 0.568/0.029/221.9` | `#586e75; 0.523/0.028/219.1` | `#268bd2; 0.615/0.139/244.9` | `#268bd2; 0.615/0.139/244.9` | `#859900; 0.644/0.151/118.6` | `#b58900; 0.654/0.134/85.7` | `#dc322f; 0.586/0.206/27.1` |
| Solarized Dark | `#002b36; 0.267/0.049/219.8` | `#073642; 0.309/0.052/219.7` | `#586e75; 0.523/0.028/219.1` | `#839496; 0.654/0.020/205.3` | `#93a1a1; 0.698/0.016/196.8` | `#268bd2; 0.615/0.139/244.9` | `#268bd2; 0.615/0.139/244.9` | `#859900; 0.644/0.151/118.6` | `#b58900; 0.654/0.134/85.7` | `#dc322f; 0.586/0.206/27.1` |
| Nord | `#2e3440; 0.324/0.023/264.2` | `#3b4252; 0.379/0.029/266.5` | `#4c566a; 0.452/0.035/264.1` | `#d8dee9; 0.899/0.016/262.7` | `#eceff4; 0.951/0.007/260.7` | `#88c0d0; 0.775/0.062/217.5` | `#81a1c1; 0.697/0.059/248.7` | `#a3be8c; 0.768/0.075/131.1` | `#ebcb8b; 0.855/0.089/84.1` | `#bf616a; 0.606/0.121/15.3` |
| Dracula | `#282a36; 0.288/0.022/277.5` | `#44475a; 0.403/0.032/277.8` | `#6272a4; 0.560/0.080/270.1` | `#bfbfbf; 0.805/0.000/0.0` | `#f8f8f2; 0.977/0.008/106.5` | `#bd93f9; 0.742/0.149/301.9` | `#8be9fd; 0.883/0.093/212.8` | `#50fa7b; 0.871/0.220/148.0` | `#f1fa8c; 0.955/0.134/112.8` | `#ff5555; 0.682/0.206/24.4` |
| Gruvbox Light | `#fbf1c7; 0.956/0.055/96.2` | `#ebdbb2; 0.894/0.057/89.2` | `#a89984; 0.690/0.035/76.3` | `#665c54; 0.482/0.018/61.0` | `#3c3836; 0.344/0.007/48.5` | `#458588; 0.576/0.066/199.5` | `#076678; 0.471/0.082/215.8` | `#79740e; 0.546/0.112/106.5` | `#b57614; 0.618/0.128/70.7` | `#9d0006; 0.437/0.179/28.3` |
| Gruvbox Dark | `#282828; 0.277/0.000/0.0` | `#3c3836; 0.344/0.007/48.5` | `#665c54; 0.482/0.018/61.0` | `#a89984; 0.690/0.035/76.3` | `#ebdbb2; 0.894/0.057/89.2` | `#83a598; 0.693/0.042/169.8` | `#83a598; 0.693/0.042/169.8` | `#b8bb26; 0.765/0.158/110.8` | `#fabd2f; 0.832/0.159/83.0` | `#fb4934; 0.660/0.218/30.4` |
| Catppuccin Latte | `#eff1f5; 0.958/0.006/264.5` | `#e6e9ef; 0.933/0.009/264.5` | `#9ca0b0; 0.708/0.024/274.6` | `#6c6f85; 0.547/0.034/279.1` | `#4c4f69; 0.435/0.043/279.3` | `#1e66f5; 0.559/0.226/262.1` | `#04a5e5; 0.682/0.145/235.4` | `#40a02b; 0.625/0.177/140.4` | `#df8e1d; 0.714/0.149/67.8` | `#d20f39; 0.550/0.216/19.8` |
| Catppuccin Mocha | `#1e1e2e; 0.243/0.030/283.9` | `#313244; 0.324/0.032/282.0` | `#6c7086; 0.550/0.034/277.1` | `#a6adc8; 0.751/0.040/273.9` | `#cdd6f4; 0.879/0.043/272.3` | `#89b4fa; 0.766/0.111/259.9` | `#89dceb; 0.847/0.083/210.3` | `#a6e3a1; 0.858/0.109/142.7` | `#f9e2af; 0.919/0.070/86.5` | `#f38ba8; 0.756/0.130/2.8` |
| One Dark | `#282c34; 0.293/0.016/264.3` | `#3e4452; 0.387/0.025/266.9` | `#5c6370; 0.498/0.022/262.9` | `#abb2bf; 0.762/0.020/263.0` | `#abb2bf; 0.762/0.020/263.0` | `#61afef; 0.730/0.121/245.3` | `#56b6c2; 0.723/0.092/206.3` | `#98c379; 0.768/0.110/133.0` | `#e5c07b; 0.825/0.097/82.3` | `#e06c75; 0.671/0.145/17.0` |
| Tokyo Night | `#1a1b26; 0.226/0.021/280.5` | `#24283b; 0.282/0.036/274.7` | `#3b4261; 0.387/0.054/273.9` | `#565f89; 0.496/0.068/274.4` | `#c0caf5; 0.846/0.061/274.8` | `#7aa2f7; 0.719/0.132/264.2` | `#0db9d7; 0.724/0.126/215.1` | `#9ece6a; 0.795/0.139/130.1` | `#e0af68; 0.784/0.106/75.4` | `#f7768e; 0.723/0.159/10.3` |
| GitHub Light | `#ffffff; 1.000/0.000/0.0` | `#f6f8fa; 0.978/0.003/247.9` | `#d0d7de; 0.876/0.012/248.0` | `#57606a; 0.485/0.020/251.0` | `#24292f; 0.279/0.013/253.0` | `#0969da; 0.540/0.191/257.5` | `#0969da; 0.540/0.191/257.5` | `#1a7f37; 0.524/0.140/148.0` | `#9a6700; 0.554/0.117/75.0` | `#cf222e; 0.552/0.205/24.5` |
| GitHub Dark | `#0d1117; 0.176/0.014/258.4` | `#161b22; 0.220/0.016/256.8` | `#30363d; 0.330/0.015/252.3` | `#8b949e; 0.662/0.018/250.9` | `#c9d1d9; 0.857/0.014/248.0` | `#58a6ff; 0.715/0.152/253.3` | `#58a6ff; 0.715/0.152/253.3` | `#3fb950; 0.695/0.181/145.6` | `#d29922; 0.720/0.140/79.9` | `#f85149; 0.665/0.205/27.0` |
| Rosé Pine | `#191724; 0.213/0.025/291.1` | `#1f1d2e; 0.241/0.032/289.1` | `#403d52; 0.372/0.036/291.1` | `#6e6a86; 0.538/0.044/291.4` | `#e0def4; 0.909/0.030/290.0` | `#c4a7e7; 0.776/0.095/305.0` | `#9ccfd8; 0.822/0.054/209.6` | `#31748f; 0.528/0.079/227.7` | `#f6c177; 0.843/0.110/74.6` | `#eb6f92; 0.698/0.156/4.2` |

### 12 段の L/C 曲線

観測点は段 1 = 地、3 = 面、7 = 罫、9 = accent 塗り、11 = 弱字、12 = 文字である。段 2、4〜6、8、10 は隣接する観測点の OKLCH L/C を線形補間した比較値であり、公式パレット値ではない。h は役割ごとに異なるため、この表では L/C だけを扱う。

#### Light

| テーマ | L: 段 1→12 | C: 段 1→12 |
|---|---|---|
| Solarized Light | 0.974 / 0.952 / 0.931 / 0.872 / 0.814 / 0.756 / 0.698 / 0.656 / 0.615 / 0.592 / 0.568 / 0.523 | 0.026 / 0.026 / 0.026 / 0.024 / 0.021 / 0.018 / 0.016 / 0.078 / 0.139 / 0.084 / 0.029 / 0.028 |
| Gruvbox Light | 0.956 / 0.925 / 0.894 / 0.843 / 0.792 / 0.741 / 0.690 / 0.633 / 0.576 / 0.529 / 0.482 / 0.344 | 0.055 / 0.056 / 0.057 / 0.051 / 0.046 / 0.040 / 0.035 / 0.050 / 0.066 / 0.042 / 0.018 / 0.007 |
| Catppuccin Latte | 0.958 / 0.946 / 0.933 / 0.877 / 0.821 / 0.764 / 0.708 / 0.633 / 0.559 / 0.553 / 0.547 / 0.435 | 0.006 / 0.007 / 0.009 / 0.012 / 0.016 / 0.020 / 0.024 / 0.125 / 0.226 / 0.130 / 0.034 / 0.043 |
| GitHub Light | 1.000 / 0.989 / 0.978 / 0.953 / 0.927 / 0.901 / 0.876 / 0.708 / 0.540 / 0.512 / 0.485 / 0.279 | 0.000 / 0.002 / 0.003 / 0.006 / 0.008 / 0.010 / 0.012 / 0.101 / 0.191 / 0.105 / 0.020 / 0.013 |
| 平均 | 0.972 / 0.953 / 0.934 / 0.886 / 0.839 / 0.791 / 0.743 / 0.658 / 0.572 / 0.546 / 0.520 / 0.395 | 0.022 / 0.023 / 0.024 / 0.023 / 0.023 / 0.022 / 0.022 / 0.088 / 0.155 / 0.090 / 0.025 / 0.023 |

#### Dark

| テーマ | L: 段 1→12 | C: 段 1→12 |
|---|---|---|
| Solarized Dark | 0.267 / 0.288 / 0.309 / 0.363 / 0.416 / 0.470 / 0.523 / 0.569 / 0.615 / 0.634 / 0.654 / 0.698 | 0.049 / 0.050 / 0.052 / 0.046 / 0.040 / 0.034 / 0.028 / 0.084 / 0.139 / 0.080 / 0.020 / 0.016 |
| Nord | 0.324 / 0.352 / 0.379 / 0.397 / 0.416 / 0.434 / 0.452 / 0.613 / 0.775 / 0.837 / 0.899 / 0.951 | 0.023 / 0.026 / 0.029 / 0.031 / 0.032 / 0.034 / 0.035 / 0.049 / 0.062 / 0.039 / 0.016 / 0.007 |
| Dracula | 0.288 / 0.346 / 0.403 / 0.442 / 0.481 / 0.521 / 0.560 / 0.651 / 0.742 / 0.773 / 0.805 / 0.977 | 0.022 / 0.027 / 0.032 / 0.044 / 0.056 / 0.068 / 0.080 / 0.114 / 0.149 / 0.074 / 0.000 / 0.008 |
| Gruvbox Dark | 0.277 / 0.310 / 0.344 / 0.379 / 0.413 / 0.447 / 0.482 / 0.587 / 0.693 / 0.691 / 0.690 / 0.894 | 0.000 / 0.003 / 0.007 / 0.009 / 0.012 / 0.015 / 0.018 / 0.030 / 0.042 / 0.038 / 0.035 / 0.057 |
| Catppuccin Mocha | 0.243 / 0.283 / 0.324 / 0.380 / 0.437 / 0.493 / 0.550 / 0.658 / 0.766 / 0.759 / 0.751 / 0.879 | 0.030 / 0.031 / 0.032 / 0.033 / 0.033 / 0.034 / 0.034 / 0.073 / 0.111 / 0.075 / 0.040 / 0.043 |
| One Dark | 0.293 / 0.340 / 0.387 / 0.415 / 0.443 / 0.470 / 0.498 / 0.614 / 0.730 / 0.746 / 0.762 / 0.762 | 0.016 / 0.020 / 0.025 / 0.024 / 0.024 / 0.023 / 0.022 / 0.072 / 0.121 / 0.071 / 0.020 / 0.020 |
| Tokyo Night | 0.226 / 0.254 / 0.282 / 0.308 / 0.334 / 0.360 / 0.387 / 0.553 / 0.719 / 0.607 / 0.496 / 0.846 | 0.021 / 0.028 / 0.036 / 0.040 / 0.045 / 0.049 / 0.054 / 0.093 / 0.132 / 0.100 / 0.068 / 0.061 |
| GitHub Dark | 0.176 / 0.198 / 0.220 / 0.248 / 0.275 / 0.303 / 0.330 / 0.523 / 0.715 / 0.689 / 0.662 / 0.857 | 0.014 / 0.015 / 0.016 / 0.015 / 0.015 / 0.015 / 0.015 / 0.083 / 0.152 / 0.085 / 0.018 / 0.014 |
| Rosé Pine | 0.213 / 0.227 / 0.241 / 0.274 / 0.307 / 0.339 / 0.372 / 0.574 / 0.776 / 0.657 / 0.538 / 0.909 | 0.025 / 0.029 / 0.032 / 0.033 / 0.034 / 0.035 / 0.036 / 0.065 / 0.095 / 0.069 / 0.044 / 0.030 |
| 平均 | 0.256 / 0.289 / 0.321 / 0.356 / 0.391 / 0.426 / 0.461 / 0.594 / 0.726 / 0.710 / 0.695 / 0.864 | 0.022 / 0.026 / 0.029 / 0.031 / 0.032 / 0.034 / 0.036 / 0.074 / 0.111 / 0.070 / 0.029 / 0.028 |

Light は地から罫まで緩やかに暗くなり、accent で彩度が山になる。Dark も accent の山を持つが、Tokyo Night と Rosé Pine は段 9 の accent より段 11 の弱字が暗く、One Dark は弱字と文字が同じである。したがって、段番号を単一の単調関数へ押し込むだけでは公式の役割関係を保存できない。Solarized は中立背景自体に C 0.026〜0.052 の色味があり、neutral hue と neutral C が必要である。

### 少数パラメータ fit

L と C を別々に piecewise-linear knot で fit した。2 knot は段 1/12、3 knot は段 1/7/12、5 knot は段 1/3/7/9/12 を入力とする。評価対象は公式観測点 6 個で、値は OKLCH 各成分の RMSE である。段 11 は入力 knot に含めず、弱い文字を曲線から派生できるかを検査する。

| テーマ | L RMSE 2 | L RMSE 3 | L RMSE 5 | C RMSE 2 | C RMSE 3 | C RMSE 5 |
|---|---:|---:|---:|---:|---:|---:|
| Solarized Light | 0.0238 | 0.0211 | 0.0059 | 0.0458 | 0.0484 | 0.0150 |
| Solarized Dark | 0.0222 | 0.0202 | 0.0068 | 0.0469 | 0.0476 | 0.0152 |
| Nord | 0.0907 | 0.0540 | 0.0028 | 0.0228 | 0.0157 | 0.0038 |
| Dracula | 0.0651 | 0.0383 | 0.0385 | 0.0623 | 0.0409 | 0.0224 |
| Gruvbox Light | 0.0549 | 0.0316 | 0.0247 | 0.0195 | 0.0178 | 0.0034 |
| Gruvbox Dark | 0.0840 | 0.0530 | 0.0558 | 0.0088 | 0.0068 | 0.0070 |
| Catppuccin Latte | 0.0422 | 0.0374 | 0.0288 | 0.0787 | 0.0793 | 0.0284 |
| Catppuccin Mocha | 0.0436 | 0.0438 | 0.0369 | 0.0295 | 0.0301 | 0.0106 |
| One Dark | 0.0478 | 0.0570 | 0.0043 | 0.0420 | 0.0408 | 0.0138 |
| Tokyo Night | 0.1431 | 0.1217 | 0.1257 | 0.0341 | 0.0311 | 0.0068 |
| GitHub Light | 0.1345 | 0.0538 | 0.0487 | 0.0740 | 0.0727 | 0.0215 |
| GitHub Dark | 0.1105 | 0.0800 | 0.0601 | 0.0562 | 0.0560 | 0.0171 |
| Rosé Pine | 0.1613 | 0.1327 | 0.1332 | 0.0278 | 0.0255 | 0.0032 |
| light 平均 | 0.0638 | 0.0360 | 0.0270 | 0.0545 | 0.0545 | 0.0171 |
| dark 平均 | 0.0854 | 0.0667 | 0.0516 | 0.0367 | 0.0327 | 0.0111 |

2 knot の端点だけでは、L RMSE は Tokyo Night 0.1431、GitHub Light 0.1345、Rosé Pine 0.1613 に達する。5 knot は Solarized、Nord、One Dark を 0.0068 以下へ落とす一方、Tokyo Night 0.1257、Rosé Pine 0.1332 は段 11 の非単調性が残る。C は 5 knot で全テーマ 0.0284 以下になり、面の低彩度、accent の山、文字側の減衰を分ける効果が明確である。

| 候補 | 個数 | 実測上の効き方 | 採否 |
|---|---:|---|---|
| face ごとの `L1, L3, L7, L9, L12` | 10 | 役割境界を直接持ち、素直なテーマでは L RMSE 0.0028〜0.0068 | 採る |
| `L11` の独立 offset | face ごと 1 | Tokyo Night、Rosé Pine、Gruvbox Dark の弱字の非単調性を表せる | 採る。ただしコントラスト検査対象 |
| `C1, C3, C7, C9, C12` | 5 | 全テーマの C RMSE を 0.0284 以下へ下げる | 採る |
| neutral hue / neutral C | 2 | Solarized、Gruvbox、Rosé Pine の色付き中立面を表す | 採る |
| accent / semantic の hue と C scale | 5 hue + 2 C | 意味色の色相と強度を段曲線から分離する | 採る |
| 全段共通の hue shift | 1 | 役割ごとに hue が異なる公式パレットを保存できない | 採らない |
| 曲率 1 個だけ | 1 | 非単調な段 9→11→12を表せず、端点モデルの大誤差を解消しない | 採らない |

入力は値を全段列挙するのでなく、職能境界の knot と弱字 offset にする。補間関数は固定し、人が選ぶ数を増やさない。Light と Dark は同じテーマでも neutral hue と L の関係が異なるため、既知テーマを忠実に表すモードでは face ごとの L knot が必要である。名前付きテーマは層 0 の組ではなく層 1 profile として別責務に置く必要がある。

### コントラスト保証

`test/color-contrast.test.ts` が検査する組は、段 12 / 段 1〜3 ≥ 4.5、段 11 / 段 1〜3 ≥ 4.5、中立・brand・意味色の段 9 / on-fill ≥ 4.5、段 7・8 / 段 1〜3 ≥ 3.0、member の全文字色相で段 12 ≥ 4.5 と段 8 ≥ 3.0、tag / on-tag ≥ 4.5 である。既知テーマの公式色は editor 自身の用途には適合していても、この全組を保証するために設計されたものではない。

保証を曲線形だけで証明する案は採らない。WCAG 2 contrast は最終 sRGB 相対輝度で決まり、同じ OKLCH L/C でも hue と gamut mapping により値が動くためである。次の二段で縛る。

1. profile の knot に構造制約を置く。Light は段 1〜3を高 L、Dark は低 Lに保ち、段 7/8、9、11/12 を役割別の許容区間へ制限する。補間は区間内を外れない piecewise-linear とする。
2. profile を保存または同梱する時に、現行 test と同じ組を最終 sRGB で全数検査する。semantic は全4色、member は hue 0〜359を現行と同じ5度刻み、tag は全6色を検査する。検査を通らない profile は層 1 入力として成立しない。

曲線制約は探索空間を狭め、検査が保証を確定する。検査だけにすると不正な knot を大量に試せ、曲線だけにすると hue 依存の反例を落とすため、両者の責務は独立している。

### 再現スクリプト

一時ディレクトリで culori を導入し、次を `analyze.mjs` として Bun で実行する。パレット値、OKLCH 変換、観測点、補間、fit、RMSE の全入力を含む。

```js
import { converter } from 'culori';
const ok = converter('oklch');
const themes = [
{name:'Solarized Light',face:'light',url:'https://github.com/altercation/solarized/blob/master/README.md',c:{bg:'#fdf6e3',surface:'#eee8d5',border:'#93a1a1',muted:'#657b83',fg:'#586e75',accent:'#268bd2',info:'#268bd2',success:'#859900',warning:'#b58900',danger:'#dc322f'}},
{name:'Solarized Dark',face:'dark',url:'https://github.com/altercation/solarized/blob/master/README.md',c:{bg:'#002b36',surface:'#073642',border:'#586e75',muted:'#839496',fg:'#93a1a1',accent:'#268bd2',info:'#268bd2',success:'#859900',warning:'#b58900',danger:'#dc322f'}},
{name:'Nord',face:'dark',url:'https://www.nordtheme.com/docs/colors-and-palettes',c:{bg:'#2e3440',surface:'#3b4252',border:'#4c566a',muted:'#d8dee9',fg:'#eceff4',accent:'#88c0d0',info:'#81a1c1',success:'#a3be8c',warning:'#ebcb8b',danger:'#bf616a'}},
{name:'Dracula',face:'dark',url:'https://github.com/dracula/dracula-theme#color-palette',c:{bg:'#282a36',surface:'#44475a',border:'#6272a4',muted:'#bfbfbf',fg:'#f8f8f2',accent:'#bd93f9',info:'#8be9fd',success:'#50fa7b',warning:'#f1fa8c',danger:'#ff5555'}},
{name:'Gruvbox Light',face:'light',url:'https://github.com/morhetz/gruvbox/blob/master/colors/gruvbox.vim',c:{bg:'#fbf1c7',surface:'#ebdbb2',border:'#a89984',muted:'#665c54',fg:'#3c3836',accent:'#458588',info:'#076678',success:'#79740e',warning:'#b57614',danger:'#9d0006'}},
{name:'Gruvbox Dark',face:'dark',url:'https://github.com/morhetz/gruvbox/blob/master/colors/gruvbox.vim',c:{bg:'#282828',surface:'#3c3836',border:'#665c54',muted:'#a89984',fg:'#ebdbb2',accent:'#83a598',info:'#83a598',success:'#b8bb26',warning:'#fabd2f',danger:'#fb4934'}},
{name:'Catppuccin Latte',face:'light',url:'https://github.com/catppuccin/palette/blob/main/palette.json',c:{bg:'#eff1f5',surface:'#e6e9ef',border:'#9ca0b0',muted:'#6c6f85',fg:'#4c4f69',accent:'#1e66f5',info:'#04a5e5',success:'#40a02b',warning:'#df8e1d',danger:'#d20f39'}},
{name:'Catppuccin Mocha',face:'dark',url:'https://github.com/catppuccin/palette/blob/main/palette.json',c:{bg:'#1e1e2e',surface:'#313244',border:'#6c7086',muted:'#a6adc8',fg:'#cdd6f4',accent:'#89b4fa',info:'#89dceb',success:'#a6e3a1',warning:'#f9e2af',danger:'#f38ba8'}},
{name:'One Dark',face:'dark',url:'https://github.com/joshdick/onedark.vim/blob/main/colors/onedark.vim',c:{bg:'#282c34',surface:'#3e4452',border:'#5c6370',muted:'#abb2bf',fg:'#abb2bf',accent:'#61afef',info:'#56b6c2',success:'#98c379',warning:'#e5c07b',danger:'#e06c75'}},
{name:'Tokyo Night',face:'dark',url:'https://github.com/folke/tokyonight.nvim/blob/main/lua/tokyonight/colors/night.lua',c:{bg:'#1a1b26',surface:'#24283b',border:'#3b4261',muted:'#565f89',fg:'#c0caf5',accent:'#7aa2f7',info:'#0db9d7',success:'#9ece6a',warning:'#e0af68',danger:'#f7768e'}},
{name:'GitHub Light',face:'light',url:'https://github.com/primer/primitives/tree/main/src/tokens/functional/color',c:{bg:'#ffffff',surface:'#f6f8fa',border:'#d0d7de',muted:'#57606a',fg:'#24292f',accent:'#0969da',info:'#0969da',success:'#1a7f37',warning:'#9a6700',danger:'#cf222e'}},
{name:'GitHub Dark',face:'dark',url:'https://github.com/primer/primitives/tree/main/src/tokens/functional/color',c:{bg:'#0d1117',surface:'#161b22',border:'#30363d',muted:'#8b949e',fg:'#c9d1d9',accent:'#58a6ff',info:'#58a6ff',success:'#3fb950',warning:'#d29922',danger:'#f85149'}},
{name:'Rosé Pine',face:'dark',url:'https://github.com/rose-pine/palette/blob/main/palette.json',c:{bg:'#191724',surface:'#1f1d2e',border:'#403d52',muted:'#6e6a86',fg:'#e0def4',accent:'#c4a7e7',info:'#9ccfd8',success:'#31748f',warning:'#f6c177',danger:'#eb6f92'}}
];
const roles=['bg','surface','border','muted','fg','accent','info','success','warning','danger'];
const anchorStep={bg:1,surface:3,border:7,accent:9,muted:11,fg:12};
for(const t of themes){ t.o={}; for(const r of roles){const x=ok(t.c[r]);t.o[r]={l:x.l,c:x.c,h:Number.isFinite(x.h)?x.h:0};}}
function interp(anchor, key){const out=[];const ks=Object.keys(anchor).map(Number).sort((a,b)=>a-b);for(let s=1;s<=12;s++){if(anchor[s]){out.push(anchor[s][key]);continue}let lo=ks.filter(x=>x<s).at(-1),hi=ks.find(x=>x>s);let q=(s-lo)/(hi-lo);out.push(anchor[lo][key]*(1-q)+anchor[hi][key]*q)}return out}
function predict(knots, vals, x){let i=0;while(i<knots.length-2&&x>knots[i+1])i++;let q=(x-knots[i])/(knots[i+1]-knots[i]);return vals[i]*(1-q)+vals[i+1]*q}
function fit(t,key,knots){const obs=Object.entries(anchorStep).map(([r,s])=>[s,t.o[r][key]]).sort((a,b)=>a[0]-b[0]);const vals=knots.map(k=>obs.find(x=>x[0]===k)?.[1]??predict(obs.map(x=>x[0]),obs.map(x=>x[1]),k));const err=Math.sqrt(obs.reduce((a,[x,y])=>a+(predict(knots,vals,x)-y)**2,0)/obs.length);return err}
for(const t of themes){const a={};for(const [r,s] of Object.entries(anchorStep))a[s]=t.o[r];t.curveL=interp(a,'l');t.curveC=interp(a,'c');t.fitL=[fit(t,'l',[1,12]),fit(t,'l',[1,7,12]),fit(t,'l',[1,3,7,9,12])];t.fitC=[fit(t,'c',[1,12]),fit(t,'c',[1,7,12]),fit(t,'c',[1,3,7,9,12])];}
const f=n=>n.toFixed(3);console.log(JSON.stringify(themes,null,2));
console.error('\nOBS');for(const t of themes)console.error(t.name,roles.map(r=>`${r}:${f(t.o[r].l)}/${f(t.o[r].c)}/${t.o[r].h.toFixed(1)}`).join(' '));
console.error('\nCURVES');for(const t of themes)console.error(t.name,'L',t.curveL.map(f).join(','),'C',t.curveC.map(f).join(','));
console.error('\nFIT');for(const t of themes)console.error(t.name,'L',t.fitL.map(x=>x.toFixed(4)).join(','),'C',t.fitC.map(x=>x.toFixed(4)).join(','));
for(const face of ['light','dark']){const xs=themes.filter(t=>t.face===face);const avg=(key,i)=>xs.reduce((a,t)=>a+t[key][i],0)/xs.length;console.error('\nAVG',face,'L',Array.from({length:12},(_,i)=>f(avg('curveL',i))).join(','),'C',Array.from({length:12},(_,i)=>f(avg('curveC',i))).join(','));}
```

## 暫定的な結論

層 1 をパラメータ化する入力は、face ごとの `L1/L3/L7/L9/L12` と `L11 offset`、共通の `C1/C3/C7/C9/C12`、neutral hue/C、accent C、semantic C、accent と意味色の hue とする。12 個の段値そのものではなく、地・面・罫・塗り・文字という職能境界を入力にすることで、設計上の責務と fit の knot が一致する。

Solarized、Nord、One Dark はこのモデルへ素直に乗る。Gruvbox Light、Catppuccin Latte/Mocha、GitHub Light/Dark は弱字 offset を加えれば許容できる。Dracula、Gruvbox Dark、Tokyo Night、Rosé Pine は公式の弱字・文字・accent の明度関係が現行の単調段と異なり、忠実再現には `L11 offset` と検査が必要である。One Dark は弱字と文字が同色なので、12段をすべて視覚的に区別するモデルには乗らないが、役割 alias を許す profile には乗る。

次の DR は、(1) 層 1 profile を層 0 preset と別概念にするか、(2) face ごとの L knot をテーマが持てるか、(3) `L11 offset` と role alias を許すか、(4) C knot を全 family 共通にするか neutral / accent / semantic で分けるか、(5) profile の保存時検査と不合格時の扱い、(6) 公式色への許容誤差を OKLCH RMSE と contrast のどちらで規定するか、を決めれば実装へ進める。

## 関連

- [カラーシステム](../design/color-system.md)
- [DR-0001](../decisions/DR-0001-colour-is-computed-from-a-few-inputs.md)
- [`test/color-contrast.test.ts`](../../test/color-contrast.test.ts)
