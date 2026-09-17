import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ActivityService } from './activity.service';
import { Activity } from './entities/activity.entity';
import { ActivityType } from '../activity-type/entities/activity-type.entity';

/**
 * The service takes its Mongoose model through @InjectModel, so the model token has to be
 * provided here. Without it the testing module cannot construct the service at all.
 */
describe('ActivityService', () => {
  let service: ActivityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityService,
        { provide: getModelToken(Activity.name), useValue: {} },
        { provide: getModelToken(ActivityType.name), useValue: {} },
      ],
    }).compile();

    service = module.get<ActivityService>(ActivityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
