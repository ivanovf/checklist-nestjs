import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ActivityTypeService } from './activity-type.service';
import { ActivityType } from './entities/activity-type.entity';

/**
 * The service takes its Mongoose model through @InjectModel, so the model token has to be
 * provided here. Each by-id query resolves through `exec()`, so every test mocks that.
 */
describe('ActivityTypeService', () => {
  let service: ActivityTypeService;
  let model: Record<string, jest.Mock>;

  const objectId = '507f1f77bcf86cd799439011';
  const record = { _id: objectId };
  const resolves = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });
  const notFound = new NotFoundException(
    `activity type #${objectId} not found`,
  );

  /** A chainable query stub: each step returns the stub, and `exec` resolves `value`. */
  const chain = (value: unknown) => {
    const query: Record<string, jest.Mock> = {
      exec: jest.fn().mockResolvedValue(value),
    };
    for (const step of ['sort', 'skip', 'limit', 'populate']) {
      query[step] = jest.fn(() => query);
    }
    return query;
  };

  beforeEach(async () => {
    model = {
      findByIdAndDelete: jest.fn().mockReturnValue(resolves(record)),
      findByIdAndUpdate: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityTypeService,
        { provide: getModelToken(ActivityType.name), useValue: model },
      ],
    }).compile();

    service = module.get<ActivityTypeService>(ActivityTypeService);
  });

  /**
   * The list used to return the whole collection (D6, specs/011-fix-unbounded-lists).
   */
  describe('findAll', () => {
    it('reads one page, oldest first', async () => {
      const query = chain([record]);
      model.find.mockReturnValue(query);

      await expect(service.findAll(5, 10)).resolves.toEqual([record]);
      // A total order, so consecutive pages never repeat or skip a record (R4).
      expect(query.sort).toHaveBeenCalledWith({ _id: 1 });
      expect(query.skip).toHaveBeenCalledWith(10);
      expect(query.limit).toHaveBeenCalledWith(5);
    });
  });

  /**
   * These used to have no existence check at all, so an unknown id was answered as an empty
   * success (D2, specs/008-fix-unknown-id-404).
   */
  describe('by id', () => {
    it('findOne answers the record', async () => {
      model.findById.mockReturnValue(resolves(record));

      await expect(service.findOne(objectId)).resolves.toBe(record);
    });

    it('findOne refuses an unknown id', async () => {
      model.findById.mockReturnValue(resolves(null));

      await expect(service.findOne(objectId)).rejects.toThrow(notFound);
    });

    it('update answers the changed record', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(record));

      await expect(service.update(objectId, {})).resolves.toBe(record);
    });

    it('update refuses an unknown id', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(null));

      await expect(service.update(objectId, {})).rejects.toThrow(notFound);
    });

    it('remove answers the deleted record', async () => {
      await expect(service.remove(objectId)).resolves.toBe(record);
    });

    it('remove refuses an unknown id', async () => {
      model.findByIdAndDelete.mockReturnValue(resolves(null));

      await expect(service.remove(objectId)).rejects.toThrow(notFound);
    });
  });

  describe('remove', () => {
    /**
     * `remove` was typed `id: number` while every sibling took a string, and the controller
     * coerced with `+id`. An ObjectId is not numeric, so that produced NaN and Mongoose threw
     * a CastError — DELETE /api/activity-type/:id answered 500 for every caller, admins
     * included. The id has to reach the model exactly as it arrived.
     */
    it('passes the id through to the model unchanged', async () => {
      await service.remove(objectId);

      expect(model.findByIdAndDelete).toHaveBeenCalledWith(objectId);
    });

    it('does not coerce the id to a number', async () => {
      await service.remove(objectId);

      const [received] = model.findByIdAndDelete.mock.calls[0];
      expect(typeof received).toBe('string');
      expect(Number.isNaN(received as unknown as number)).toBe(false);
    });
  });
});
