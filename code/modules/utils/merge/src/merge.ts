export type MergeOptions = {
  /**
   * If true, when both sides are arrays we append the right array to the left.
   * If false, the right array replaces the left.
   */
  concatenateArrays?: boolean;

  /**
   * Only used when concatenateArrays is true.
   * If true, duplicate entries are removed while preserving first-seen order.
   *
   * Note: this uses normal JavaScript equality semantics.
   * Primitive duplicates are removed by value.
   * Object duplicates are removed only when they are the same reference.
   */
  deduplicateArrays?: boolean;

  /**
   * Controls how null is treated.
   * - "missing": null behaves like undefined (does not overwrite)
   * - "overwrite": null is an explicit value and overwrites
   */
  nulls?: "missing" | "overwrite";
};

const defaultMergeOptions: Required<MergeOptions> = {
  concatenateArrays: true,
  deduplicateArrays: false,
  nulls: "missing",
};

export function mergeAll(objects: any[], options?: MergeOptions): any {
  return objects.reduce((acc, obj) => mergeTwo(acc, obj, options), {});
}

export function mergeTwo(t1: any, t2: any, options?: MergeOptions): any {
  const opt: Required<MergeOptions> = { ...defaultMergeOptions, ...(options ?? {}) };

  // Root-level missing handling
  if (t1 === undefined) return t2;
  if (t2 === undefined) return t1;

  if (opt.nulls === "missing") {
    if (t1 === null) return t2;
    if (t2 === null) return t1;
  }

  // Root-level arrays
  if (Array.isArray(t1) && Array.isArray(t2)) {
    return mergeArrays(t1, t2, opt);
  }

  // If either side is an array, right wins
  if (Array.isArray(t1) || Array.isArray(t2)) return t2;

  // Non-objects: right wins
  if (typeof t1 !== "object" || t1 === null) return t2;
  if (typeof t2 !== "object" || t2 === null) return t2;

  // Build result without spreading, and ignore forbidden keys from both sides
  const result: any = {};
  for (const [k, v] of Object.entries(t1)) {
    if (isForbiddenKey(k)) continue;
    result[k] = v;
  }

  for (const [k, v] of Object.entries(t2)) {
    if (isForbiddenKey(k)) continue;

    // undefined means "missing" at property level
    if (v === undefined) continue;

    // null handling at property level
    if (v === null && opt.nulls === "missing") continue;

    const left = t1[k];

    if (left === undefined) {
      result[k] = v;
      continue;
    }

    // Property arrays
    if (Array.isArray(left) && Array.isArray(v)) {
      result[k] = mergeArrays(left, v, opt);
      continue;
    }

    if (Array.isArray(left) || Array.isArray(v)) {
      result[k] = v;
      continue;
    }

    // Deep merge only for non-null objects on both sides
    if (
        typeof left === "object" && left !== null &&
        typeof v === "object" && v !== null
    ) {
      result[k] = mergeTwo(left, v, opt);
      continue;
    }

    result[k] = v;
  }

  return result;
}

function mergeArrays<T>(left: T[], right: T[], options: Required<MergeOptions>): T[] {
  if (!options.concatenateArrays) return right;
  const combined = left.concat(right);
  return options.deduplicateArrays ? deduplicatePreservingOrder(combined) : combined;
}

function deduplicatePreservingOrder<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function isForbiddenKey(key: string): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}