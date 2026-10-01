import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ReservationsService } from './reservations.service';
import { Reservation } from './entities/reservation.entity';
import { FilterReservationsDto } from '../filter_dto/filter-reservation.dto';

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
  let query: Record<'limit' | 'skip' | 'sort', jest.Mock>;
  let model: Record<
    'find' | 'findById' | 'findByIdAndUpdate' | 'findByIdAndDelete',
    jest.Mock
  >;

  beforeEach(async () => {
    query = { limit: jest.fn(), skip: jest.fn(), sort: jest.fn() };
    Object.values(query).forEach((step) => step.mockReturnValue(query));
    model = {
      find: jest.fn().mockReturnValue(query),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: getModelToken(Reservation.name), useValue: model },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
  });

  describe('create', () => {
    const valid = {
      dateIni: new Date('2031-01-01'),
      dateEnd: new Date('2031-01-02'),
      type: 'direct',
      validated: false,
      contact: 'c',
      quantity: 1,
      cost: 0,
      items: [],
    };
    let constructed: jest.Mock;

    beforeEach(async () => {
      // `create` builds a document with `new`, so the model here is a constructor.
      constructed = jest.fn().mockImplementation((doc: object) => ({
        ...doc,
        save: jest.fn().mockResolvedValue(doc),
      }));
      const ctor = Object.assign(constructed, {
        exists: jest.fn().mockResolvedValue(null),
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ReservationsService,
          { provide: getModelToken(Reservation.name), useValue: ctor },
        ],
      }).compile();

      service = module.get<ReservationsService>(ReservationsService);
    });

    it.each(['', null])('leaves out a lock given as %p', async (userLock) => {
      await service.create({ ...valid, userLock });

      expect(constructed).toHaveBeenCalledWith(valid);
    });

    it('stores a lock as sent', async () => {
      await service.create({ ...valid, userLock: '03' });

      expect(constructed).toHaveBeenCalledWith({ ...valid, userLock: '03' });
    });
  });

  describe('findAll', () => {
    const params = (values: Partial<FilterReservationsDto>) =>
      Object.assign(new FilterReservationsDto(), values);

    it('reads one page from the requested position', () => {
      service.findAll(params({ limit: 10, offset: 20 }));

      expect(query.limit).toHaveBeenCalledWith(10);
      expect(query.skip).toHaveBeenCalledWith(20);
    });

    it.each([
      ['desc', -1],
      ['asc', 1],
    ] as const)(
      'orders %s by start date, then by id so tied pages stay stable',
      (sort, dir) => {
        service.findAll(params({ sort }));

        expect(query.sort).toHaveBeenCalledWith({ dateIni: dir, _id: dir });
      },
    );

    it('filters nothing by default', () => {
      service.findAll(params({}));

      expect(model.find).toHaveBeenCalledWith({});
    });

    it('old=false adds no end-date bound', () => {
      service.findAll(params({ old: false }));

      expect(model.find).toHaveBeenCalledWith({});
    });

    it('old=true keeps stays that ended by today', () => {
      const today = new Date().toISOString().split('T')[0];

      service.findAll(params({ old: true }));

      expect(model.find).toHaveBeenCalledWith({ dateEnd: { $lte: today } });
    });

    it.each([true, false])('validated=%s filters on it', (validated) => {
      service.findAll(params({ validated }));

      expect(model.find).toHaveBeenCalledWith({ validated });
    });

    it('filters by type', () => {
      service.findAll(params({ type: 'direct' }));

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

      await expect(service.findOne(id)).resolves.toBe(record);
    });

    it('findOne refuses an unknown id', async () => {
      model.findById.mockReturnValue(resolves(null));

      await expect(service.findOne(id)).rejects.toThrow(
        new NotFoundException(notFound),
      );
    });

    it('update answers the changed record, without upserting', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(record));

      await expect(service.update(id, {})).resolves.toBe(record);
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

    /**
     * An empty lock means "no lock" (specs/010-fix-unknown-fields, US3): it is removed rather
     * than stored as an empty value. `$set` is left out when nothing else changes, because
     * whether an empty `$set` is accepted depends on the database version.
     */
    it.each(['', null])(
      'update removes the lock when given %p',
      async (userLock) => {
        model.findByIdAndUpdate.mockReturnValue(resolves(record));

        await service.update(id, { userLock });

        expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
          id,
          { $unset: { userLock: '' } },
          { new: true },
        );
      },
    );

    it('update removes the lock and sets the other fields together', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(record));

      await service.update(id, { userLock: '', contact: 'z' });

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { $set: { contact: 'z' }, $unset: { userLock: '' } },
        { new: true },
      );
    });

    it('update stores a lock as sent', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(record));

      await service.update(id, { userLock: '03', contact: 'z' });

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { $set: { userLock: '03', contact: 'z' } },
        { new: true },
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
});
