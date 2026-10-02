/**
 * Builds a record answer from an allowlist of published fields (D3, constitution Principle II:
 * "Mongoose documents MUST NOT be returned raw from controllers").
 *
 * Records used to be sent exactly as the store returned them, so the internal `__v` revision
 * counter went out with every one, and only the schema's `select: false` kept the password hash
 * from following. An allowlist builds the answer from nothing: a field added to storage stays
 * out until it is published. A denylist, such as dropping `__v` in a schema transform, would
 * let it through (specs/009-fix-unprojected-records, research R2).
 *
 * Fields are read by property access, which goes through a hydrated document's getters and
 * works equally on plain objects. Nest's `ClassSerializerInterceptor` was rejected: its
 * `instanceToPlain` was observed turning every ObjectId into a buffer object.
 */

/**
 * Exactly the fields of `T`, each marked `true`. The compiler rejects a list that misses one of
 * `T`'s fields or names one `T` doesn't have, so a response DTO and its list can't drift apart.
 */
export type FieldList<T> = { readonly [K in keyof Required<T>]: true };

export function project<T>(source: object, fields: FieldList<T>): T {
  const read = source as Record<string, unknown>;
  const answer: Record<string, unknown> = {};

  for (const key of Object.keys(fields)) {
    const value = read[key];

    // Absent rather than `undefined`, so the JSON is unchanged for a record that never held
    // an optional field.
    if (value === undefined) continue;

    answer[key] = key === '_id' ? String(value) : value;
  }

  return answer as T;
}
