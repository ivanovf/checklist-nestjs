import { Test, TestingModule } from '@nestjs/testing';

import { ActivityTypeController } from './activity-type.controller';
import { ActivityTypeService } from './activity-type.service';

/**
 * ActivityTypeService is stubbed rather than constructed: the real one needs a Mongoose model,
 * which is not what this test is about. Providing the class itself is what made this suite fail.
 */
describe('ActivityTypeController', () => {
  let controller: ActivityTypeController;
  let service: Record<string, jest.Mock>;

  const objectId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActivityTypeController],
      providers: [{ provide: ActivityTypeService, useValue: service }],
    }).compile();

    controller = module.get<ActivityTypeController>(ActivityTypeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('remove', () => {
    /**
     * The route previously handed the service `+id`. Mongo ids are not numeric, so every
     * delete arrived as NaN. Guarding the call site as well as the service keeps the coercion
     * from being reintroduced here.
     */
    it('forwards the raw id, not a numeric coercion', () => {
      controller.remove(objectId);

      expect(service.remove).toHaveBeenCalledWith(objectId);
    });
  });
});
