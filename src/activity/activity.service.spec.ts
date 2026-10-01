import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ActivityService } from './activity.service';
import { Activity } from './entities/activity.entity';
import { ActivityStatus } from './entities/activity-status.enum';
import { FilterActivityDto } from './dto/filter-activity.dto';
import { ActivityType } from '../activity-type/entities/activity-type.entity';

/**
 * The service takes its Mongoose models through @InjectModel, so both model tokens have to be
 * provided here. Each by-id query resolves through `exec()`, so every test mocks that.
 */
describe('ActivityService', () => {
  let service: ActivityService;
  let model: Record<
    'find' | 'findById' | 'findByIdAndUpdate' | 'findByIdAndDelete',
    jest.Mock
  >;

  const id = '6aba80d38c58c96b58020000';
  const record = { _id: id };
  const resolves = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });
  const notFound = new NotFoundException('Activity not found');

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
      find: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityService,
        { provide: getModelToken(Activity.name), useValue: model },
        { provide: getModelToken(ActivityType.name), useValue: {} },
      ],
    }).compile();

    service = module.get<ActivityService>(ActivityService);
  });

  /**
   * The list used to return every matching activity (D6, specs/011-fix-unbounded-lists).
   * Paging applies after the filters, and the paging values never become filters.
   */
  describe('findAll', () => {
    const filter = (values: Partial<FilterActivityDto>) =>
      Object.assign(new FilterActivityDto(), values);

    it('reads one page of every activity, with its type', async () => {
      const query = chain([record]);
      model.find.mockReturnValue(query);

      await expect(
        service.findAll(filter({ limit: 5, offset: 10 })),
      ).resolves.toEqual([record]);
      expect(model.find).toHaveBeenCalledWith({});
      // Newest first; activities sharing a date need the id as a tie-break, or pages could
      // repeat or skip them (R4).
      expect(query.sort).toHaveBeenCalledWith({ date: -1, _id: -1 });
      expect(query.skip).toHaveBeenCalledWith(10);
      expect(query.limit).toHaveBeenCalledWith(5);
      expect(query.populate).toHaveBeenCalledWith('type');
    });

    it('filters by exactly the type, status and price given', async () => {
      model.find.mockReturnValue(chain([]));

      await service.findAll(
        filter({
          type: id,
          status: ActivityStatus.TODO,
          price: 3,
          limit: 5,
          offset: 0,
        }),
      );
      expect(model.find).toHaveBeenCalledWith({
        type: id,
        status: ActivityStatus.TODO,
        price: 3,
      });
    });

    it('filters by a price of 0', async () => {
      model.find.mockReturnValue(chain([]));

      await service.findAll(filter({ price: 0 }));
      expect(model.find).toHaveBeenCalledWith({ price: 0 });
    });

    it('applies the default page when no paging value is given', async () => {
      const query = chain([]);
      model.find.mockReturnValue(query);

      await service.findAll(filter({}));
      expect(query.skip).toHaveBeenCalledWith(0);
      expect(query.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('findOne', () => {
    const populated = (value: unknown) => ({
      populate: jest.fn().mockReturnValue(resolves(value)),
    });

    it('answers the record with its type', async () => {
      model.findById.mockReturnValue(populated(record));

      await expect(service.findOne(id)).resolves.toBe(record);
    });

    it('refuses an unknown id', async () => {
      model.findById.mockReturnValue(populated(null));

      await expect(service.findOne(id)).rejects.toThrow(notFound);
    });
  });

  /**
   * `update` had no existence check, so an unknown id was answered as an empty success
   * (D2, specs/008-fix-unknown-id-404).
   */
  describe('update', () => {
    it('answers the changed record', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(record));

      await expect(service.update(id, {})).resolves.toBe(record);
    });

    it('refuses an unknown id', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(null));

      await expect(service.update(id, {})).rejects.toThrow(notFound);
    });
  });

  describe('remove', () => {
    it('answers the deleted record', async () => {
      model.findByIdAndDelete.mockReturnValue(resolves(record));

      await expect(service.remove(id)).resolves.toBe(record);
    });

    it('refuses an unknown id', async () => {
      model.findByIdAndDelete.mockReturnValue(resolves(null));

      await expect(service.remove(id)).rejects.toThrow(notFound);
    });
  });
});
