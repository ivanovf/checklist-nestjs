/** The signed-in account, as sign-in reports it (observed). */
export class SignedInUserDto {
  email: string;

  id: string;

  role: string;
}

/**
 * The sign-in result: a bearer token and the account it belongs to (observed 201).
 *
 * Documentation only: nothing constructs this class.
 */
export class LoginResponseDto {
  /** Send as `Authorization: Bearer <access_token>`. */
  access_token: string;

  user: SignedInUserDto;
}
