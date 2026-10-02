import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { ActivityService } from './activity.service';
import { Activity } from './entities/activity.entity';
import { ActivityType } from '../activity-type/entities/activity-type.entity';
import { ActivityStatus } from './entities/activity-status.enum';
import { CreateActivityDto } from './dto/create-activity.dto';
import { FilterActivityDto } from './dto/filter-activity.dto';

/**
 * The service takes its Mongoose models through @InjectModel, so both model tokens have to be
 * provided here. Each by-id query resolves through `exec()`, so every test mocks that.
 */
describe('ActivityService', () => {
  let service: ActivityService;
  let save: jest.Mock;
  // Callable with `new`, as the service's `create` does, and carrying the statics it queries.
  let model: jest.Mock &
    Record<
      'find' | 'findById' | 'findByIdAndUpdate' | 'findByIdAndDelete',
      jest.Mock
    >;
  let typeModel: { findById: jest.Mock };

  const id = '6aba80d38c58c96b58020000';
  const record = { _id: id };
  const resolves = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });
  const notFound = new NotFoundException('Activity not found');

  beforeEach(async () => {
    save = jest.fn();
    model = Object.assign(
      jest.fn((dto: object) => ({ ...dto, save })),
      {
        find: jest.fn(),
        findById: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        findByIdAndDelete: jest.fn(),
      },
    );
    typeModel = { findById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityService,
        { provide: getModelToken(Activity.name), useValue: model },
        { provide: getModelToken(ActivityType.name), useValue: typeModel },
      ],
    }).compile();

    service = module.get<ActivityService>(ActivityService);
  });

  const populated = (value: unknown) => ({
    populate: jest.fn().mockReturnValue(resolves(value)),
  });

  describe('findOne', () => {
    it('answers the record with its type', async () => {
      model.findById.mockReturnValue(populated(record));

      await expect(service.findOne(id)).resolves.toMatchObject(record);
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

      await expect(service.update(id, {})).resolves.toEqual(record);
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

  /**
   * Reads answer through ActivityResponseDto, with the populated type projected as an activity
   * type. Create and update answer through ActivityRecordResponseDto, with the type's id. In both,
   * the stored `__v` and any unpublished field stay out (D3, specs/009-fix-unprojected-records).
   */
  describe('answers', () => {
    const typeId = '6aba80d38c58c96b58020001';
    const fields = {
      status: ActivityStatus.TODO,
      price: 1,
      date: new Date('2026-01-01T00:00:00.000Z'),
      description: 'd',
    };
    const storedType = {
      _id: new Types.ObjectId(typeId),
      name: 'n',
      budget: 1,
      __v: 1,
      legacy: 'x',
    };
    const stored = (type: unknown) => ({
      _id: new Types.ObjectId(id),
      type,
      ...fields,
      __v: 2,
      legacy: 'x',
    });
    const read = {
      _id: id,
      type: { _id: typeId, name: 'n', budget: 1 },
      ...fields,
    };
    const written = { _id: id, type: typeId, ...fields };

    it('create answers the type as its id', async () => {
      typeModel.findById.mockReturnValue(resolves(storedType));
      save.mockResolvedValue(stored(new Types.ObjectId(typeId)));

      await expect(
        service.create(
          Object.assign(new CreateActivityDto(), { ...fields, type: typeId }),
        ),
      ).resolves.toEqual(written);
    });

    it('findAll answers each populated type as an activity type', async () => {
      model.find.mockReturnValue({
        sort: jest.fn().mockReturnValue(populated([stored(storedType)])),
      });

      await expect(service.findAll(new FilterActivityDto())).resolves.toEqual([
        read,
      ]);
    });

    it('findOne answers the populated type as an activity type', async () => {
      model.findById.mockReturnValue(populated(stored(storedType)));

      await expect(service.findOne(id)).resolves.toEqual(read);
    });

    it('answers a type that no longer exists as null', async () => {
      model.findById.mockReturnValue(populated(stored(null)));

      await expect(service.findOne(id)).resolves.toEqual({
        ...read,
        type: null,
      });
    });

    it('update answers the type as its id', async () => {
      model.findByIdAndUpdate.mockReturnValue(
        resolves(stored(new Types.ObjectId(typeId))),
      );

      await expect(service.update(id, {})).resolves.toEqual(written);
    });
  });
});
