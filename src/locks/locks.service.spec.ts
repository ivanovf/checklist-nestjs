import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { LocksService } from './locks.service';
import { Lock } from './entities/lock.entity';

/**
 * The service takes its Mongoose model through @InjectModel, so the model token has to be
 * provided here. Without it the testing module cannot construct the service at all.
 */
describe('LocksService', () => {
  let service: LocksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocksService,
        { provide: getModelToken(Lock.name), useValue: {} },
      ],
    }).compile();

    service = module.get<LocksService>(LocksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
