import { Logger } from '@nestjs/common';

import { seedDevAdmin, DEV_ADMIN } from './dev-admin-seed';
import { Role } from '../auth/models/role.model';

/**
 * The idempotency cases are the point of this suite. A seed that quietly creates a second
 * account on its second run fails later as ambiguous sign-in behaviour rather than as an
 * obvious error, and the seed sits in a documented sequence people re-run after a reset.
 *
 * The non-destructive case matters for a different reason: silently promoting an existing
 * account to administrator would be a privilege change made by a tool someone ran to set up
 * a database.
 */
describe('seedDevAdmin', () => {
  let users: Record<string, jest.Mock>;

  beforeEach(() => {
    users = { findByEmail: jest.fn(), create: jest.fn() };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('creates the account once against an empty database', async () => {
    users.findByEmail.mockResolvedValue(null);

    const result = await seedDevAdmin(users as never);

    expect(users.create).toHaveBeenCalledTimes(1);
    expect(result).toBe('created');
  });

  it('assigns the administrator role from the enum, not a string literal', async () => {
    users.findByEmail.mockResolvedValue(null);

    await seedDevAdmin(users as never);

    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: Role.ADMIN }),
    );
  });

  it('does not create a second account when one already exists', async () => {
    users.findByEmail.mockResolvedValue({
      email: DEV_ADMIN.email,
      role: Role.ADMIN,
    });

    const result = await seedDevAdmin(users as never);

    expect(users.create).not.toHaveBeenCalled();
    expect(result).toBe('already-exists');
  });

  it('leaves an existing non-administrator account untouched', async () => {
    users.findByEmail.mockResolvedValue({
      email: DEV_ADMIN.email,
      role: Role.AUTHENTICATED,
    });

    const result = await seedDevAdmin(users as never);

    // Neither created nor promoted: changing a role here would be a privilege grant made
    // as a side effect of a setup command.
    expect(users.create).not.toHaveBeenCalled();
    expect(result).toBe('exists-without-admin');
  });

  it('never supplies a pre-hashed password — hashing belongs to the service', async () => {
    users.findByEmail.mockResolvedValue(null);

    await seedDevAdmin(users as never);

    const [dto] = users.create.mock.calls[0];
    expect(dto.password).toBe(DEV_ADMIN.password);
    expect(dto.password).not.toMatch(/^\$2[aby]\$/);
  });

  it('propagates a failure from the user service rather than reporting success', async () => {
    users.findByEmail.mockRejectedValue(new Error('connection refused'));

    await expect(seedDevAdmin(users as never)).rejects.toThrow(
      'connection refused',
    );
  });
});
