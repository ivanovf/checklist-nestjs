import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { ReservationsService } from './reservations.service';
import { Reservation } from './entities/reservation.entity';
import { FilterReservationsDto } from '../filter_dto/filter-reservation.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';

/**
 * The service takes its Mongoose model through @InjectModel, so the model token has to be
 * provided here. `find()` returns a chainable query stub, so each test can read exactly which
 * filter, page and order were asked for.
 *
 * `findAll` has no failure path of its own: invalid queries are refused by the DTO before it
 * runs (pagination-query.dto.spec.ts, filter-reservation.dto.spec.ts).
 */
describe('ReservationsService', () => {
  let service: ReservationsService;
  let query: Record<'limit' | 'skip' | 'sort' | 'exec', jest.Mock>;
  let save: jest.Mock;
  // Callable with `new`, as the service's `create` does, and carrying the statics it queries.
  let model: jest.Mock &
    Record<
      | 'find'
      | 'findById'
      | 'findByIdAndUpdate'
      | 'findByIdAndDelete'
      | 'exists',
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
        exists: jest.fn().mockResolvedValue(null),
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: getModelToken(Reservation.name), useValue: model },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
  });

  const params = (values: Partial<FilterReservationsDto>) =>
    Object.assign(new FilterReservationsDto(), values);

  describe('findAll', () => {
    it('reads one page from the requested position', async () => {
      await service.findAll(params({ limit: 10, offset: 20 }));

      expect(query.limit).toHaveBeenCalledWith(10);
      expect(query.skip).toHaveBeenCalledWith(20);
    });

    it.each([
      ['desc', -1],
      ['asc', 1],
    ] as const)(
      'orders %s by start date, then by id so tied pages stay stable',
      async (sort, dir) => {
        await service.findAll(params({ sort }));

        expect(query.sort).toHaveBeenCalledWith({ dateIni: dir, _id: dir });
      },
    );

    it('filters nothing by default', async () => {
      await service.findAll(params({}));

      expect(model.find).toHaveBeenCalledWith({});
    });

    it('old=false adds no end-date bound', async () => {
      await service.findAll(params({ old: false }));

      expect(model.find).toHaveBeenCalledWith({});
    });

    it('old=true keeps stays that ended by today', async () => {
      const today = new Date().toISOString().split('T')[0];

      await service.findAll(params({ old: true }));

      expect(model.find).toHaveBeenCalledWith({ dateEnd: { $lte: today } });
    });

    it.each([true, false])('validated=%s filters on it', async (validated) => {
      await service.findAll(params({ validated }));

      expect(model.find).toHaveBeenCalledWith({ validated });
    });

    it('filters by type', async () => {
      await service.findAll(params({ type: 'direct' }));

      expect(model.find).toHaveBeenCalledWith({ type: 'direct' });
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
    const notFound = `reservation #${id} not found`;

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
   * Every answer is projected through ReservationResponseDto, embedded items included: the
   * stored `__v` and any unpublished field stay out, an unset cost stays absent, and ids are
   * strings (D3, specs/009-fix-unprojected-records).
   */
  describe('answers', () => {
    const id = '6aba80d38c58c96b58020000';
    const itemId = '6aba80d38c58c96b58020001';
    const dates = {
      dateIni: new Date('2026-01-01T00:00:00.000Z'),
      dateEnd: new Date('2026-01-02T00:00:00.000Z'),
    };
    const fields = {
      type: 'direct',
      validated: false,
      contact: 'c',
      quantity: 1,
    };
    const item = {
      label: 'l',
      status: true,
      checked: false,
      comments: '',
      category: 'c',
    };
    const stored = {
      _id: new Types.ObjectId(id),
      ...dates,
      ...fields,
      items: [
        { _id: new Types.ObjectId(itemId), ...item, __v: 1, legacy: 'x' },
      ],
      __v: 2,
      legacy: 'x',
    };
    const published = {
      _id: id,
      ...dates,
      ...fields,
      items: [{ _id: itemId, ...item }],
    };
    const resolves = (value: unknown) => ({
      exec: jest.fn().mockResolvedValue(value),
    });

    it('create', async () => {
      save.mockResolvedValue(stored);

      // The stored record, not this input, is what gets projected: `save` resolves `stored`.
      const answer = await service.create(
        Object.assign(new CreateReservationDto(), { ...dates, ...fields }),
      );

      expect(answer).toEqual(published);
      expect(answer).not.toHaveProperty('cost');
    });

    it('findAll', async () => {
      query.exec.mockResolvedValue([stored]);

      await expect(service.findAll(params({}))).resolves.toEqual([published]);
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
