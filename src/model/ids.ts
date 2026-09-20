let counter = 0;

/** Short unique id. Falls back to a counter when crypto.randomUUID is unavailable (http on iOS). */
export function newId(prefix = 'e'): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  counter += 1;
  return `${prefix}_${rnd}${counter.toString(36)}`;
}
