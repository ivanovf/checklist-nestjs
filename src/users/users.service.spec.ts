import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Role } from '../auth/models/role.model';

/**
 * Credential material must never reach a response body. `update` previously relied on
 * `delete (await updated).password` against a Mongoose document, which does not remove the
 * field from the serialized result, so the bcrypt hash was returned to the caller.
 */
describe('UsersService', () => {
  let service: UsersService;
  let save: jest.Mock;
  // Callable with `new`, as the service's `create` does, and carrying the statics it queries.
  let model: jest.Mock &
    Record<
      | 'findByIdAndUpdate'
      | 'findById'
      | 'findOne'
      | 'find'
      | 'findByIdAndDelete',
      jest.Mock
    >;

  const hash = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

  /**
   * A faithful Mongoose-like document. This matters: a real hydrated document keeps its
   * values in an internal `_doc` and exposes each path through a non-enumerable getter, so
   * `delete doc.password` removes only the accessor and `toJSON()` still emits the hash, and
   * spreading the document copies nothing. A naive plain-object mock would let both defects
   * pass unnoticed.
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
    const hydrated = { toJSON: () => ({ ...internal }) };

    for (const key of Object.keys(internal)) {
      Object.defineProperty(hydrated, key, { get: () => internal[key] });
    }
    return hydrated as typeof hydrated & Record<string, unknown>;
  };

  beforeEach(async () => {
    save = jest.fn();
    model = Object.assign(
      jest.fn((dto: object) => ({ ...dto, save })),
      {
        findByIdAndUpdate: jest.fn(),
        findById: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
        findByIdAndDelete: jest.fn(),
      },
    );

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

  /**
   * Every answer is projected through UserResponseDto, built from an allowlist: the stored
   * `__v`, the password hash and any unpublished field stay out, whatever the store hands
   * back, and the id is a string (D3, specs/009-fix-unprojected-records).
   */
  describe('answers', () => {
    const id = '6aba80d38c58c96b58020000';
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const stored = () =>
      doc({
        _id: new Types.ObjectId(id),
        createdAt,
        updatedAt: createdAt,
        __v: 2,
        legacy: 'x',
      });
    const published = {
      _id: id,
      email: 'guest@example.com',
      name: 'Guest',
      role: 'authenticated',
      createdAt,
      updatedAt: createdAt,
    };
    const resolves = (value: unknown) => ({
      exec: jest.fn().mockResolvedValue(value),
    });

    it('create', async () => {
      save.mockResolvedValue(stored());

      await expect(
        service.create({
          email: 'guest@example.com',
          name: 'Guest',
          role: Role.AUTHENTICATED,
          password: 'pw',
        }),
      ).resolves.toEqual(published);
    });

    it('findAll', async () => {
      const query = {
        sort: jest.fn(),
        limit: jest.fn(),
        skip: jest.fn(),
        exec: jest.fn().mockResolvedValue([stored()]),
      };
      [query.sort, query.limit, query.skip].forEach((step) =>
        step.mockReturnValue(query),
      );
      model.find.mockReturnValue(query);

      await expect(service.findAll(10, 0)).resolves.toEqual([published]);
    });

    it('findOne', async () => {
      model.findById.mockReturnValue(resolves(stored()));

      await expect(service.findOne(id)).resolves.toEqual(published);
    });

    it('update', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(stored()));

      await expect(
        service.update(id, { name: 'Guest' } as never),
      ).resolves.toEqual(published);
    });
  });

  /**
   * What `update` writes. With `changePassword: false` the `password` it carries (every field is
   * required, D9) used to be written as plain text over the hash, locking the account out (D17,
   * specs/009-fix-unprojected-records). Only the account's own fields are written, and the
   * password only as the hash of a verified change.
   */
  describe('update writes', () => {
    const id = '6aba80d38c58c96b58020000';
    const account = {
      email: 'guest@example.com',
      name: 'Guest',
      role: Role.AUTHENTICATED,
    };
    const resolves = (value: unknown) => ({
      exec: jest.fn().mockResolvedValue(value),
    });
    const written = () => model.findByIdAndUpdate.mock.calls[0][1].$set;

    beforeEach(() => {
      model.findByIdAndUpdate.mockReturnValue(resolves(doc()));
    });

    it('leaves the password alone without a password change', async () => {
      await service.update(id, {
        ...account,
        password: 'sent-pw',
        changePassword: false,
        currentPassword: 'whatever',
      });

      expect(written()).toEqual(account);
    });

    it('writes only the hash of a verified new password', async () => {
      model.findById.mockReturnValue({
        select: jest
          .fn()
          .mockReturnValue(
            resolves(doc({ password: bcrypt.hashSync('old', 4) })),
          ),
      });

      await service.update(id, {
        ...account,
        password: 'new-pw',
        changePassword: true,
        currentPassword: 'old',
      });

      const { password, ...rest } = written();
      expect(rest).toEqual(account);
      expect(password).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);
      expect(await bcrypt.compare('new-pw', password)).toBe(true);
    });
  });
});
