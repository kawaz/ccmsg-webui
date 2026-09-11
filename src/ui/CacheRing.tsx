/** prompt cache が生きている間だけ、要素の縁に重なって回る輪 (算術は
 * `src/llm/cache-ring.ts`)。
 *
 * **塗らない**のが要点。塗った図形の内側を不透明な子で隠す作りだと、子が覆え
 * ない一瞬 (未レイアウト・画像が未描画) にその塗りがそのまま見える。線しか
 * 無ければ、露出する面が存在しない。
 *
 * 周長を `pathLength` で 1 に正規化してあるので、進みはそのまま割合になる。
 * 上の中央から時計回りに欠けていく。 */
export function CacheRing() {
  return (
    <svg class="cache-ring-svg" aria-hidden="true" viewBox="0 0 16 16">
      <circle class="cache-ring-shape" cx="8" cy="8" r="7" pathLength={1} />
    </svg>
  );
}
