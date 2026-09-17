import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ActivityTypeService } from './activity-type.service';
import { ActivityType } from './entities/activity-type.entity';

/**
 * The service takes its Mongoose model through @InjectModel, so the model token has to be
 * provided here. Without it the testing module cannot construct the service at all.
 */
describe('ActivityTypeService', () => {
  let service: ActivityTypeService;
  let model: Record<string, jest.Mock>;

  const objectId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    model = {
      findByIdAndDelete: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityTypeService,
        { provide: getModelToken(ActivityType.name), useValue: model },
      ],
    }).compile();

    service = module.get<ActivityTypeService>(ActivityTypeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('remove', () => {
    /**
     * `remove` was typed `id: number` while every sibling took a string, and the controller
     * coerced with `+id`. An ObjectId is not numeric, so that produced NaN and Mongoose threw
     * a CastError — DELETE /api/activity-type/:id answered 500 for every caller, admins
     * included. The id has to reach the model exactly as it arrived.
     */
    it('passes the id through to the model unchanged', async () => {
      await service.remove(objectId);

      expect(model.findByIdAndDelete).toHaveBeenCalledWith(objectId);
    });

    it('does not coerce the id to a number', async () => {
      await service.remove(objectId);

      const [received] = model.findByIdAndDelete.mock.calls[0];
      expect(typeof received).toBe('string');
      expect(Number.isNaN(received as unknown as number)).toBe(false);
    });
  });
});
