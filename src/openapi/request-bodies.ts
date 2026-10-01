import type {
  OpenAPIObject,
  OperationObject,
  PathItemObject,
  ReferenceObject,
  RequestBodyObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

/**
 * Request bodies the API documents but never validates. Sign-in declares its body with
 * `@ApiBody` for the contract, but the credential check reads it without `@Body()`, so the
 * request rules never see it and an extra field there is still accepted.
 */
const OPEN_REQUEST_BODIES = new Set(['LoginRequestDto']);

export const OWN_ID_DESCRIPTION =
  'May repeat the id in the path; any other value is refused.';

const METHODS = ['post', 'put', 'patch', 'delete'] as const;

const refName = (node: SchemaObject | ReferenceObject | undefined) =>
  node && '$ref' in node ? node.$ref.split('/').pop() : undefined;

/**
 * States the request rules in the contract (specs/010-fix-unknown-fields, research R7).
 *
 * Every validated request body refuses undeclared fields at any depth, so each schema reached
 * from a request body is closed with `additionalProperties: false`. A change (an operation on
 * `{id}`) may repeat its record's own `_id`, so its body schema declares an optional `_id`.
 *
 * Returns a new document; the one given is left unchanged.
 */
export function closeRequestBodies(document: OpenAPIObject): OpenAPIObject {
  // The document is plain JSON, so a JSON round trip is a full copy.
  const doc = JSON.parse(JSON.stringify(document)) as OpenAPIObject;
  const schemas = (doc.components?.schemas ?? {}) as Record<
    string,
    SchemaObject | ReferenceObject
  >;
  const closed = new Set<string>();

  const close = (name: string | undefined): void => {
    if (!name || closed.has(name) || OPEN_REQUEST_BODIES.has(name)) return;
    const schema = schemas[name];
    if (!schema || '$ref' in schema) return;
    closed.add(name);
    schema.additionalProperties = false;
    for (const property of Object.values(schema.properties ?? {})) {
      close(refName(property));
      if (!('$ref' in property)) close(refName(property.items));
    }
  };

  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of METHODS) {
      const operation = (item as PathItemObject)[method] as
        | OperationObject
        | undefined;
      const body = operation?.requestBody as RequestBodyObject | undefined;
      const name = refName(body?.content?.['application/json']?.schema);
      if (!name || OPEN_REQUEST_BODIES.has(name)) continue;

      close(name);
      const schema = schemas[name];
      if (path.includes('{id}') && schema && !('$ref' in schema)) {
        schema.properties = {
          ...schema.properties,
          _id: { type: 'string', description: OWN_ID_DESCRIPTION },
        };
      }
    }
  }
  return doc;
}
