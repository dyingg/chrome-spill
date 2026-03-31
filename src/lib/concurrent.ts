/**
 * Sliding-window concurrency limiter. Runs up to `concurrency` invocations
 * of `fn` in parallel — as soon as one completes, the next item starts.
 *
 * Results are returned in the same order as `items`.
 */
export async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let i = 0;

  async function worker(): Promise<void> {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));

  return results;
}
