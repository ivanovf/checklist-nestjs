import { UserSchema } from './user.entity';

describe('UserSchema', () => {
  /**
   * Sign-in and password recovery both look an account up by email (Principle V;
   * specs/012-password-recovery, research R11). Not unique: duplicate emails can already
   * exist (D13, #18), and a unique index would fail to build over them.
   */
  it('indexes email, without making it unique', () => {
    const email = UserSchema.indexes().find(
      ([fields]) => JSON.stringify(fields) === JSON.stringify({ email: 1 }),
    );

    expect(email).toBeDefined();
    expect(email?.[1]?.unique).toBeFalsy();
  });

  /**
   * When the password was last recovered, used to refuse sessions issued before it
   * (research R6). Excluded from queries by default so it never reaches a user response.
   */
  it('keeps passwordChangedAt out of queries by default', () => {
    const path = UserSchema.path('passwordChangedAt');

    expect(path).toBeDefined();
    expect(path?.options.select).toBe(false);
  });
});
