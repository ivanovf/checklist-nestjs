import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';

import { UsersService } from './users.service';
import { User } from './entities/user.entity';

/**
 * Credential material must never reach a response body. `update` previously relied on
 * `delete (await updated).password` against a Mongoose document, which does not remove the
 * field from the serialized result, so the bcrypt hash was returned to the caller.
 */
describe('UsersService', () => {
  let service: UsersService;
  let model: Record<string, jest.Mock>;

  const hash = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

  /**
   * A faithful Mongoose-like document. This matters: a real hydrated document keeps its
   * values in an internal `_doc`, so `delete doc.password` removes only the accessor and
   * `toJSON()` still emits the hash. A naive plain-object mock would delete cleanly and let
   * the defect pass unnoticed.
   */
  const doc = (overrides: Record<string, unknown> = {}) => {
    const internal: Record<string, unknown> = {
      _id: 'user-1',
      email: 'guest@example.com',
      name: 'Guest',
      role: 'authenticated',
      password: hash,
      ...overrides,
    };

    return {
      get _id() {
        return internal._id;
      },
      get email() {
        return internal.email;
      },
      get password() {
        return internal.password;
      },
      toJSON: () => ({ ...internal }),
    };
  };

  beforeEach(async () => {
    model = {
      findByIdAndUpdate: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: model },
      ],
    }).compile();

    service = moduleRef.get<UsersService>(UsersService);
  });

  describe('update', () => {
    it('does not return the password hash', async () => {
      model.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(doc()),
      });

      const result = await service.update('user-1', {
        name: 'Renamed',
      } as never);

      expect(result).not.toHaveProperty('password');
      expect(JSON.stringify(result)).not.toContain(hash);
    });

    it('throws when the account does not exist', async () => {
      // findByIdAndUpdate resolves to null for a missing id. The previous implementation
      // tested the Query object itself, which is always truthy, so this never threw.
      model.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.update('missing', { name: 'Renamed' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
