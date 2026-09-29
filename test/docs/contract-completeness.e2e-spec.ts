import type {
  ReferenceObject,
  ResponseObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

import { Access, AUTHORIZATION_MATRIX } from '../security/authorization-matrix';
import {
  ContractOperation,
  loadContract,
  operationKey,
  operations,
} from './openapi-contract';

/**
 * The committed contract describes exactly the API the service registers, and describes
 * each operation completely. The rules are in
 * specs/005-openapi-contract-export/contracts/documentation-conventions.md.
 *
 * Data-only: nothing here boots the application. The routes the application really
 * registers are pinned by the authorization matrix, whose own suite fails when a route is
 * added without a row, so agreeing with the matrix means agreeing with the application.
 */
const contract = loadContract();
const ops = operations(contract);
const byKey = (o: ContractOperation) => [operationKey(o), o] as const;

const SIGN_IN = 'post /api/login';
const HEALTH = 'get /api/health';

/** The access refusals each level produces, as enforced by the guards (research R5). */
const ACCESS_REFUSALS: Record<Access, string[]> = {
  public: [],
  auth: ['401'],
  admin: ['401', '403'],
  device: ['401'],
};

const statuses = (o: ContractOperation) => Object.keys(o.op.responses ?? {});
const response = (o: ContractOperation, status: string) =>
  o.op.responses[status] as ResponseObject;
const isSuccess = (status: string) => /^2\d\d$/.test(status);

describe('API contract completeness', () => {
  const documented = ops.map(operationKey);
  const registered = AUTHORIZATION_MATRIX.map(operationKey);

  // Check 1 — FR-001: nothing missing, nothing extra.
  it('documents every registered route', () => {
    const missing = registered.filter((key) => !documented.includes(key));

    expect(missing).toEqual([]);
  });

  it('documents no route the service does not register', () => {
    const extra = documented.filter((key) => !registered.includes(key));

    expect(extra).toEqual([]);
  });

  // Check 2 — FR-004, FR-007, FR-014.
  describe.each(ops.map(byKey))('%s', (_key, o) => {
    it('belongs to exactly one group and has a summary', () => {
      expect(o.op.tags ?? []).toHaveLength(1);
      expect(o.op.summary?.trim()).toBeTruthy();
    });

    it('documents exactly one success response, with a body shape or a stated empty body', () => {
      const successes = statuses(o).filter(isSuccess);
      expect(successes).toHaveLength(1);

      const success = response(o, successes[0]);
      expect(success.description?.trim()).toBeTruthy();

      // No schema is only acceptable when the description says the body is empty.
      if (!success.content) {
        expect(success.description).toMatch(/empty/i);
      }
    });

    it('describes every documented status', () => {
      const undescribed = statuses(o).filter(
        (status) => !response(o, status).description?.trim(),
      );

      expect(undescribed).toEqual([]);
    });
  });

  // Check 3 — FR-005, FR-015: access refusals agree with the matrix exactly.
  describe.each(AUTHORIZATION_MATRIX.map((rule) => [operationKey(rule), rule]))(
    '%s',
    (key, rule) => {
      it(`documents exactly the ${rule.access} access refusals`, () => {
        const op = ops.find((o) => operationKey(o) === key);
        const documentedAccess = op
          ? statuses(op).filter((s) => s === '401' || s === '403')
          : [];

        // Sign-in is public, but the local strategy refuses bad credentials with 401.
        const expected =
          key === SIGN_IN ? ['401'] : ACCESS_REFUSALS[rule.access];

        expect(documentedAccess.sort()).toEqual([...expected].sort());
      });
    },
  );

  // Check 4 — FR-006: only statuses the service can produce.
  describe.each(ops.map(byKey))('%s', (key, o) => {
    it('documents only statuses the service produces', () => {
      const allowed = (status: string) =>
        isSuccess(status) ||
        ['400', '401', '403', '404'].includes(status) ||
        (status === '429' && key === SIGN_IN) ||
        (status === '503' && key === HEALTH);

      expect(statuses(o).filter((status) => !allowed(status))).toEqual([]);
    });
  });

  // Check 5 — FR-008: no response shape carries a credential.
  it('never documents a password in a response', () => {
    const schemas = contract.components?.schemas ?? {};
    const offenders: string[] = [];

    const walk = (
      node: SchemaObject | ReferenceObject | undefined,
      where: string,
      seen: Set<string>,
    ): void => {
      if (!node) return;
      if ('$ref' in node) {
        const name = node.$ref.split('/').pop() as string;
        if (seen.has(name)) return;
        walk(schemas[name], `${where} → ${name}`, new Set(seen).add(name));
        return;
      }
      for (const [prop, child] of Object.entries(node.properties ?? {})) {
        if (prop.toLowerCase() === 'password')
          offenders.push(`${where}.${prop}`);
        walk(child, `${where}.${prop}`, seen);
      }
      walk(node.items, `${where}[]`, seen);
      for (const part of [
        ...(node.allOf ?? []),
        ...(node.oneOf ?? []),
        ...(node.anyOf ?? []),
      ]) {
        walk(part, where, seen);
      }
    };

    for (const o of ops) {
      for (const status of statuses(o)) {
        for (const media of Object.values(response(o, status).content ?? {})) {
          walk(media.schema, `${operationKey(o)} ${status}`, new Set());
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
