import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

import { ErrorResponseDto } from '../dto/error-response.dto';

/**
 * The refusal statuses a route can document. Anything else is a compile error: a status the
 * service never sends must not reach the contract (FR-006).
 */
export type RefusalStatus = 400 | 401 | 403 | 404 | 429;

export const REFUSAL_DESCRIPTIONS: Record<RefusalStatus, string> = {
  400: 'The request body, query or path value is invalid.',
  401: 'No valid credentials were supplied.',
  403: 'The caller is signed in but lacks the required role.',
  404: 'No record exists with the given identifier.',
  429: 'Too many attempts; retry later.',
};

/**
 * Documents the refusals a route really produces, each with a fixed description and the
 * shared error body.
 *
 * List the access refusals the route's level implies (signed-in: 401; administrator: 401,
 * 403; device key: 401; public: none) plus any validation or not-found refusal observed by
 * calling it. `test/docs/` fails when the access refusals disagree with the authorization
 * matrix.
 */
export function ApiRefusals(...statuses: RefusalStatus[]) {
  return applyDecorators(
    ApiExtraModels(ErrorResponseDto),
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: REFUSAL_DESCRIPTIONS[status],
        content: {
          'application/json': {
            schema: { $ref: getSchemaPath(ErrorResponseDto) },
          },
        },
      }),
    ),
  );
}
