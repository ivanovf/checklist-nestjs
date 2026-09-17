import { Test, TestingModule } from '@nestjs/testing';

import { ActivityTypeController } from './activity-type.controller';
import { ActivityTypeService } from './activity-type.service';

/**
 * ActivityTypeService is stubbed rather than constructed: the real one needs a Mongoose model, which is
 * not what this test is about. Providing the class itself is what made this suite fail.
 */
describe('ActivityTypeController', () => {
  let controller: ActivityTypeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActivityTypeController],
      providers: [{ provide: ActivityTypeService, useValue: {} }],
    }).compile();

    controller = module.get<ActivityTypeController>(ActivityTypeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
