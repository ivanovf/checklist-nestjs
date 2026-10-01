import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ActivityService } from './activity.service';
import { Activity } from './entities/activity.entity';
import { ActivityType } from '../activity-type/entities/activity-type.entity';

/**
 * The service takes its Mongoose models through @InjectModel, so both model tokens have to be
 * provided here. Each by-id query resolves through `exec()`, so every test mocks that.
 */
describe('ActivityService', () => {
  let service: ActivityService;
  let model: Record<
    'findById' | 'findByIdAndUpdate' | 'findByIdAndDelete',
    jest.Mock
  >;

  const id = '6aba80d38c58c96b58020000';
  const record = { _id: id };
  const resolves = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });
  const notFound = new NotFoundException('Activity not found');

  beforeEach(async () => {
    model = {
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
