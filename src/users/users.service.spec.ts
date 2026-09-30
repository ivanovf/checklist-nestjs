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

  describe('update with a password change', () => {
    it('refuses an unknown account with 404 (specs/008-fix-unknown-id-404)', async () => {
      model.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      await expect(
        service.update('6aba80d38c58c96b58020000', {
          changePassword: true,
          password: 'new',
          currentPassword: 'old',
        } as never),
      ).rejects.toThrow(
        new NotFoundException('user #6aba80d38c58c96b58020000 not found'),
      );
    });
  });

  describe('findAll', () => {
    const chain = () => {
      const query: Record<'limit' | 'skip' | 'sort' | 'exec', jest.Mock> = {
        limit: jest.fn(),
        skip: jest.fn(),
        sort: jest.fn(),
        exec: jest.fn().mockResolvedValue([doc()]),
      };
      query.limit.mockReturnValue(query);
      query.skip.mockReturnValue(query);
      query.sort.mockReturnValue(query);
      model.find.mockReturnValue(query);

      return query;
    };

    it('reads one page, ordered by id so pages never overlap', async () => {
      const query = chain();

      await service.findAll(5, 10);

      expect(query.limit).toHaveBeenCalledWith(5);
      expect(query.skip).toHaveBeenCalledWith(10);
      expect(query.sort).toHaveBeenCalledWith({ _id: 1 });
    });

    it('does not return password hashes', async () => {
      chain();

      const result = await service.findAll(5, 0);

      expect(JSON.stringify(result)).not.toContain(hash);
    });
  });
});
