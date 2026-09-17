import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route (or an entire controller) as reachable without authentication.
 *
 * Authentication is default-deny: `JwtAuthGuard` is registered application-wide, so every
 * endpoint requires a credential unless it carries this marker. Making the exception explicit
 * at the endpoint is the point — the defect this replaced was per-controller opt-in, where a
 * forgotten guard silently granted access instead of denying it.
 */
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
