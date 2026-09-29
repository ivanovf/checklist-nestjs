type Json = unknown;

interface ContractShape {
  paths?: Record<string, Record<string, Json>>;
  components?: { schemas?: Record<string, Json> };
  [section: string]: Json;
}

const same = (a: Json, b: Json): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const union = (a: object = {}, b: object = {}): string[] => [
  ...new Set([...Object.keys(a), ...Object.keys(b)]),
];

/**
 * Names the first place two contract documents disagree, in reading order: an operation
 * (`post /api/users`), then a schema (`schema User`), then any other top-level section.
 * Returns undefined when the documents are equal.
 */
export function firstDifference(
  committed: ContractShape,
  generated: ContractShape,
): string | undefined {
  for (const path of union(committed.paths, generated.paths)) {
    const before = committed.paths?.[path] ?? {};
    const after = generated.paths?.[path] ?? {};

    for (const method of union(before, after)) {
      if (!same(before[method], after[method])) {
        return `${method} ${path}`;
      }
    }
  }

  const beforeSchemas = committed.components?.schemas ?? {};
  const afterSchemas = generated.components?.schemas ?? {};
  for (const name of union(beforeSchemas, afterSchemas)) {
    if (!same(beforeSchemas[name], afterSchemas[name])) {
      return `schema ${name}`;
    }
  }

  for (const section of union(committed, generated)) {
    if (!same(committed[section], generated[section])) {
      return section;
    }
  }

  return undefined;
}
