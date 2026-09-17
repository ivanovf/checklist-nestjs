import { Test, TestingModule } from '@nestjs/testing';

import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';

/**
 * ItemsService is stubbed rather than constructed: the real one needs a Mongoose model, which is
 * not what this test is about. Providing the class itself is what made this suite fail.
 */
describe('ItemsController', () => {
  let controller: ItemsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ItemsController],
      providers: [{ provide: ItemsService, useValue: {} }],
    }).compile();

    controller = module.get<ItemsController>(ItemsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
