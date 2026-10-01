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
