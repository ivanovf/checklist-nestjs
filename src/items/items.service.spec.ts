import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ItemsService } from './items.service';
import { Item } from './entities/item.entity';

/**
 * The service takes its Mongoose model through @InjectModel, so the model token has to be
 * provided here. Without it the testing module cannot construct the service at all.
 */
describe('ItemsService', () => {
  let service: ItemsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemsService,
        { provide: getModelToken(Item.name), useValue: {} },
      ],
    }).compile();

    service = module.get<ItemsService>(ItemsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
