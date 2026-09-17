import { Test, TestingModule } from '@nestjs/testing';

import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

/**
 * ActivityService is stubbed rather than constructed: the real one needs a Mongoose model, which is
 * not what this test is about. Providing the class itself is what made this suite fail.
 */
describe('ActivityController', () => {
  let controller: ActivityController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActivityController],
      providers: [{ provide: ActivityService, useValue: {} }],
    }).compile();

    controller = module.get<ActivityController>(ActivityController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
