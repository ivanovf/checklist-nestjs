import { Test, TestingModule } from '@nestjs/testing';

import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';

/**
 * ConfigService is stubbed rather than constructed: the real one needs a Mongoose model, which is
 * not what this test is about. Providing the class itself is what made this suite fail.
 */
describe('ConfigController', () => {
  let controller: ConfigController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfigController],
      providers: [{ provide: ConfigService, useValue: {} }],
    }).compile();

    controller = module.get<ConfigController>(ConfigController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
