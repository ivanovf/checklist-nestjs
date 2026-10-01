import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ConfigService } from './config.service';
import { Config } from './entities/config.entity';

/**
 * The by-id changes used to test an unawaited query, which is never falsy, so an unknown id
 * was answered as success (D2, specs/008-fix-unknown-id-404).
 */
describe('ConfigService', () => {
  let service: ConfigService;
  let model: { findByIdAndUpdate: jest.Mock };

  const id = '6aba80d38c58c96b58020000';
  const record = { _id: id };
  const resolves = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });
  const notFound = new NotFoundException(`config #${id} not found`);

  beforeEach(async () => {
    model = { findByIdAndUpdate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigService,
        { provide: getModelToken(Config.name), useValue: model },
      ],
    }).compile();

    service = module.get<ConfigService>(ConfigService);
  });

  describe('update', () => {
    it('answers the changed record', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(record));

      await expect(service.update(id, {})).resolves.toBe(record);
    });

    it('refuses an unknown id', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(null));

      await expect(service.update(id, {})).rejects.toThrow(notFound);
    });
  });

  describe('updateAnalogLecure', () => {
    const report = (apiKey = process.env.TANK_API_KEY) =>
      ({ analogLecture: 1, apiKey, time: 1 }) as never;

    beforeEach(() => {
      process.env.TANK_API_KEY = 'unit-test-tank-key';
    });

    it('answers the changed record', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(record));

      await expect(service.updateAnalogLecure(id, report())).resolves.toBe(
        record,
      );
    });

    it('refuses an unknown id', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(null));

      await expect(service.updateAnalogLecure(id, report())).rejects.toThrow(
        notFound,
      );
    });

    it('still refuses a wrong key before looking the record up (D10)', async () => {
      await expect(
        service.updateAnalogLecure(id, report('wrong')),
      ).rejects.toThrow(new NotFoundException('Invalid API Key'));
      expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });
});
