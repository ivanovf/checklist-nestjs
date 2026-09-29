/**
 * The sign-in body. It is read by the Passport local strategy, not bound with `@Body()`, so
 * this class documents the request without taking part in handling it. A missing or wrong
 * value is refused with 401, not 400 (observed).
 */
export class LoginRequestDto {
  /** The account's email address. */
  email: string;

  password: string;
}
