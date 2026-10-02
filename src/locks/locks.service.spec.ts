import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { LocksService } from './locks.service';
import { Lock } from './entities/lock.entity';

/**
 * The service takes its Mongoose model through @InjectModel, so the model token has to be
 * provided here. `find()` returns a chainable query stub, so each test can read exactly which
 * page and order were asked for.
 */
describe('LocksService', () => {
  let service: LocksService;
  let query: Record<'limit' | 'skip' | 'sort' | 'exec', jest.Mock>;
  let save: jest.Mock;
  // Callable with `new`, as the service's `create` does, and carrying the statics it queries.
  let model: jest.Mock &
    Record<
      'find' | 'findById' | 'findByIdAndUpdate' | 'findByIdAndDelete',
      jest.Mock
    >;

  beforeEach(async () => {
    query = {
      limit: jest.fn(),
      skip: jest.fn(),
      sort: jest.fn(),
      exec: jest.fn(),
    };
    [query.limit, query.skip, query.sort].forEach((step) =>
      step.mockReturnValue(query),
    );
    query.exec.mockResolvedValue([]);
    save = jest.fn();
    model = Object.assign(
      jest.fn((dto: object) => ({ ...dto, save })),
      {
        find: jest.fn().mockReturnValue(query),
        findById: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        findByIdAndDelete: jest.fn(),
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocksService,
        { provide: getModelToken(Lock.name), useValue: model },
      ],
    }).compile();

    service = module.get<LocksService>(LocksService);
  });

  describe('findAll', () => {
    it('reads one page from the requested position', async () => {
      await service.findAll(5, 10);

      expect(query.limit).toHaveBeenCalledWith(5);
      expect(query.skip).toHaveBeenCalledWith(10);
    });

    it('orders by id so consecutive pages never overlap', async () => {
      await service.findAll(5, 10);

      expect(query.sort).toHaveBeenCalledWith({ _id: 1 });
    });
  });
  /**
   * The by-id operations used to test an unawaited query, which is never falsy, so an
   * unknown id was answered as success (D2, specs/008-fix-unknown-id-404).
   */
  describe('by id', () => {
    const id = '6aba80d38c58c96b58020000';
    const record = { _id: id };
    const resolves = (value: unknown) => ({
      exec: jest.fn().mockResolvedValue(value),
    });
    const notFound = `lock #${id} not found`;

    it('findOne answers the record', async () => {
      model.findById.mockReturnValue(resolves(record));

      await expect(service.findOne(id)).resolves.toEqual(record);
    });

    it('findOne refuses an unknown id', async () => {
      model.findById.mockReturnValue(resolves(null));

      await expect(service.findOne(id)).rejects.toThrow(
        new NotFoundException(notFound),
      );
    });

    it('update answers the changed record, without upserting', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(record));

      await expect(service.update(id, {})).resolves.toEqual(record);
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { $set: {} },
        { new: true },
      );
    });

    it('update refuses an unknown id', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(null));

      await expect(service.update(id, {})).rejects.toThrow(
        new NotFoundException(notFound),
      );
    });

    it('remove reports a deletion that happened', async () => {
      model.findByIdAndDelete.mockReturnValue(resolves(record));

      await expect(service.remove(id)).resolves.toEqual({ deleted: true });
    });

    it('remove refuses an unknown id', async () => {
      model.findByIdAndDelete.mockReturnValue(resolves(null));

      await expect(service.remove(id)).rejects.toThrow(
        new NotFoundException(notFound),
      );
    });
  });

  /**
   * Every answer is projected through LockResponseDto: the stored `__v` and any unpublished
   * field stay out, and the id is a string (D3, specs/009-fix-unprojected-records).
   */
  describe('answers', () => {
    const id = '6aba80d38c58c96b58020000';
    const fields = { lock: '1', userNumber: '2' };
    const stored = {
      _id: new Types.ObjectId(id),
      ...fields,
      __v: 2,
      legacy: 'x',
    };
    const published = { _id: id, ...fields };
    const resolves = (value: unknown) => ({
      exec: jest.fn().mockResolvedValue(value),
    });

    it('create', async () => {
      save.mockResolvedValue(stored);

      await expect(
        service.create({ lock: '1', userNumber: '2' }),
      ).resolves.toEqual(published);
    });

    it('findAll', async () => {
      query.exec.mockResolvedValue([stored]);

      await expect(service.findAll(10, 0)).resolves.toEqual([published]);
    });

    it('findOne', async () => {
      model.findById.mockReturnValue(resolves(stored));

      await expect(service.findOne(id)).resolves.toEqual(published);
    });

    it('update', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(stored));

      await expect(service.update(id, {})).resolves.toEqual(published);
    });
  });
});
