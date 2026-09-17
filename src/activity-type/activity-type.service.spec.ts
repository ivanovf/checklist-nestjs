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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityTypeService,
        { provide: getModelToken(ActivityType.name), useValue: {} },
      ],
    }).compile();

    service = module.get<ActivityTypeService>(ActivityTypeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
