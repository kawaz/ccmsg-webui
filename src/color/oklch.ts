/** oklch を sRGB に直し、WCAG 2 の比を出す。
 *
 * 色の算出そのものは CSS がやる (段は相対色構文で作る)。ここにあるのは**検査の
 * ため**の変換で、比の合否は CSS の式では書けないから — WCAG 2 の比は最終的な
 * sRGB の輝度で決まる。 */

export interface Oklch {
  /** 0..1 */
  readonly l: number;
  readonly c: number;
  /** 度 */
  readonly h: number;
}

/** oklab → 線形 sRGB (Björn Ottosson の行列)。 */
function linearRgb({ l, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

/** 画面に出る 0..1 の各原色。範囲外はそのまま丸める — ブラウザも同じ所へ落とす
 * (色域の外は同じ色相のまま濁る) ので、検査は丸めた後の色で行う。 */
export function srgb(color: Oklch): [number, number, number] {
  return linearRgb(color).map((value) => {
    const clamped = Math.min(1, Math.max(0, value));
    return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  }) as [number, number, number];
}

/** WCAG 2 の相対輝度。 */
export function luminance(color: Oklch): number {
  const [r, g, b] = srgb(color).map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 2 色の比 (1〜21)。どちらが明るいかは問わない。 */
export function contrast(a: Oklch, b: Oklch): number {
  const first = luminance(a);
  const second = luminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}
