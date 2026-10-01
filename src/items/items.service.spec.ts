import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ItemsService } from './items.service';
import { Item } from './entities/item.entity';

/**
 * The service takes its Mongoose model through @InjectModel, so the model token has to be
 * provided here. `find()` returns a chainable query stub, so each test can read exactly which
 * page and order were asked for.
 */
describe('ItemsService', () => {
  let service: ItemsService;
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
        ItemsService,
        { provide: getModelToken(Item.name), useValue: model },
      ],
    }).compile();

    service = module.get<ItemsService>(ItemsService);
  });

  describe('findAll', () => {
    it('reads one page from the requested position', () => {
      service.findAll(5, 10);

      expect(query.limit).toHaveBeenCalledWith(5);
      expect(query.skip).toHaveBeenCalledWith(10);
    });

    it('orders by id so consecutive pages never overlap', () => {
      service.findAll(5, 10);

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
    const notFound = `item #${id} not found`;

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
