import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { LocksService } from './locks.service';
import { Lock } from './entities/lock.entity';

/**
 * The service takes its Mongoose model through @InjectModel, so the model token has to be
 * provided here. `find()` returns a chainable query stub, so each test can read exactly which
 * page and order were asked for.
 */
describe('LocksService', () => {
  let service: LocksService;
  let query: Record<'limit' | 'skip' | 'sort', jest.Mock>;
  let model: { find: jest.Mock };

  beforeEach(async () => {
    query = { limit: jest.fn(), skip: jest.fn(), sort: jest.fn() };
    Object.values(query).forEach((step) => step.mockReturnValue(query));
    model = { find: jest.fn().mockReturnValue(query) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocksService,
        { provide: getModelToken(Lock.name), useValue: model },
      ],
    }).compile();

    service = module.get<LocksService>(LocksService);
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
});
