import { readFileSync } from 'fs';
import { join } from 'path';
import type {
  OpenAPIObject,
  OperationObject,
  PathItemObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

import type { RouteRule } from '../security/authorization-matrix';

/**
 * The committed contract, as consumers read it.
 *
 * These checks deliberately read `openapi.json` rather than generating a document
 * in-process: ts-jest does not run the Swagger CLI plugin, so an in-process document would
 * differ from what ships. `pnpm docs:check` is what guarantees this file matches the code.
 */
export const CONTRACT_PATH = join(__dirname, '..', '..', 'openapi.json');

export function loadContract(): OpenAPIObject {
  return JSON.parse(readFileSync(CONTRACT_PATH, 'utf8')) as OpenAPIObject;
}

export type Method = RouteRule['method'];

export interface ContractOperation {
  method: Method;
  /** In the matrix's notation, e.g. `/api/users/:id`, so the two can be compared directly. */
  path: string;
  op: OperationObject;
}

const METHODS: Method[] = ['get', 'post', 'put', 'patch', 'delete'];

/** OpenAPI writes `/api/users/{id}`; Express and the matrix write `/api/users/:id`. */
export function toMatrixPath(openApiPath: string): string {
  return openApiPath.replace(/\{(\w+)\}/g, ':$1');
}

export function operations(doc: OpenAPIObject): ContractOperation[] {
  return Object.entries(doc.paths).flatMap(([path, item]) =>
    METHODS.filter((method) => (item as PathItemObject)[method]).map(
      (method) => ({
        method,
        path: toMatrixPath(path),
        op: (item as PathItemObject)[method] as OperationObject,
      }),
    ),
  );
}

export function operationKey(o: { method: string; path: string }): string {
  return `${o.method} ${o.path}`;
}

interface SchemaLike {
  $ref?: string;
  type?: string;
  items?: SchemaLike;
  properties?: Record<string, unknown>;
  required?: string[];
  example?: Record<string, unknown>;
}

export interface DocumentedSuccess {
  status: number;
  isArray: boolean;
  /** Every property the body may carry. */
  properties: string[];
  /** The properties the body must carry. */
  required: string[];
}

/**
 * What the contract promises for an operation's success: its status and the body's
 * properties, with `$ref`s and arrays resolved. `path` is in the matrix's notation.
 */
export function documentedSuccess(
  doc: OpenAPIObject,
  method: Method,
  path: string,
): DocumentedSuccess {
  const op = operations(doc).find(
    (o) => o.method === method && o.path === path,
  );
  if (!op) throw new Error(`${method} ${path} is not in the contract`);

  const status = Object.keys(op.op.responses).find((s) => /^2\d\d$/.test(s));
  const media = (
    op.op.responses[status] as {
      content?: Record<string, { schema: SchemaLike }>;
    }
  ).content?.['application/json'];

  const resolve = (schema: SchemaLike): SchemaLike =>
    schema.$ref
      ? (doc.components.schemas[schema.$ref.split('/').pop()] as SchemaLike)
      : schema;

  let schema = resolve(media.schema);
  const isArray = schema.type === 'array';
  if (isArray) schema = resolve(schema.items);

  // A schema given only as an example (the health route) promises the example's keys.
  const properties = Object.keys(schema.properties ?? schema.example ?? {});
  return {
    status: Number(status),
    isArray,
    properties,
    required: schema.properties ? schema.required ?? [] : properties,
  };
}
