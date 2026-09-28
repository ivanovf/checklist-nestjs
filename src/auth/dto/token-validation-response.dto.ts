/** The decoded token payload (observed). */
export class TokenPayloadDto {
  email: string;

  id: string;

  role: string;

  /** Issued at, in seconds since the epoch. */
  iat: number;

  /** Expires at, in seconds since the epoch. */
  exp: number;
}

/**
 * The answer for a valid token (observed). An invalid or missing token is refused with 401.
 *
 * Documentation only: nothing constructs this class.
 */
export class TokenValidationResponseDto {
  access: boolean;

  user: TokenPayloadDto;
}
