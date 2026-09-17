import { Test, TestingModule } from '@nestjs/testing';

import { LocksController } from './locks.controller';
import { LocksService } from './locks.service';

/**
 * LocksService is stubbed rather than constructed: the real one needs a Mongoose model, which is
 * not what this test is about. Providing the class itself is what made this suite fail.
 */
describe('LocksController', () => {
  let controller: LocksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LocksController],
      providers: [{ provide: LocksService, useValue: {} }],
    }).compile();

    controller = module.get<LocksController>(LocksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
