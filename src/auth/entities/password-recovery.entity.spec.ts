import { PasswordRecoverySchema } from './password-recovery.entity';

/**
 * The persistence shape of an outstanding recovery code (specs/012-password-recovery,
 * data-model.md). Every query filters on `userId`, which is also what keeps at most one code
 * per account (Principle V); `expiresAt` carries the TTL that cleans up spent documents.
 */
describe('PasswordRecoverySchema', () => {
  const indexes = () => PasswordRecoverySchema.indexes();

  it('indexes userId uniquely, so an account has at most one outstanding code', () => {
    expect(indexes()).toContainEqual([
      { userId: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });

  it('expires documents at expiresAt', () => {
    expect(indexes()).toContainEqual([
      { expiresAt: 1 },
      expect.objectContaining({ expireAfterSeconds: 0 }),
    ]);
  });

  it.each([
    'userId',
    'codeHash',
    'issuedBy',
    'issuedAt',
    'expiresAt',
    'attempts',
  ])('requires %s', (path) => {
    expect(PasswordRecoverySchema.path(path)?.isRequired).toBe(true);
  });

  it('starts the attempt count at zero', () => {
    expect(PasswordRecoverySchema.path('attempts')?.options.default).toBe(0);
  });
});
