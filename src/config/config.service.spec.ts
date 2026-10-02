import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { ConfigService } from './config.service';
import { Config } from './entities/config.entity';

/**
 * The by-id changes used to test an unawaited query, which is never falsy, so an unknown id
 * was answered as success (D2, specs/008-fix-unknown-id-404).
 */
describe('ConfigService', () => {
  let service: ConfigService;
  let save: jest.Mock;
  // Callable with `new`, as the service's `create` does, and carrying the statics it queries.
  let model: jest.Mock & Record<'find' | 'findByIdAndUpdate', jest.Mock>;

  const id = '6aba80d38c58c96b58020000';
  const record = { _id: id };
  const resolves = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });
  const notFound = new NotFoundException(`config #${id} not found`);

  beforeEach(async () => {
    save = jest.fn();
    model = Object.assign(
      jest.fn((dto: object) => ({ ...dto, save })),
      { find: jest.fn(), findByIdAndUpdate: jest.fn() },
    );

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

      await expect(service.update(id, {})).resolves.toEqual(record);
    });

    it('refuses an unknown id', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(null));

      await expect(service.update(id, {})).rejects.toThrow(notFound);
    });
  });

  const report = (apiKey = process.env.TANK_API_KEY) =>
    ({ analogLecture: 1, apiKey, time: 1 }) as never;

  beforeEach(() => {
    process.env.TANK_API_KEY = 'unit-test-tank-key';
  });

  describe('updateAnalogLecure', () => {
    it('answers the changed record', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(record));

      await expect(service.updateAnalogLecure(id, report())).resolves.toEqual(
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

  /**
   * Every answer is projected through ConfigResponseDto: the stored `__v` and any unpublished
   * field stay out, and the id is a string (D3, specs/009-fix-unprojected-records).
   */
  describe('answers', () => {
    const fields = {
      doorLock: '1',
      mainLock: '2',
      usersLimit: 3,
      analogLecture: 0,
    };
    const stored = {
      _id: new Types.ObjectId(id),
      ...fields,
      __v: 2,
      legacy: 'x',
    };
    const published = { _id: id, ...fields };

    it('create', async () => {
      save.mockResolvedValue(stored);

      await expect(service.create(fields)).resolves.toEqual(published);
    });

    it('findAll', async () => {
      model.find.mockReturnValue(resolves([stored]));

      await expect(service.findAll()).resolves.toEqual([published]);
    });

    it('update', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(stored));

      await expect(service.update(id, {})).resolves.toEqual(published);
    });

    it('updateAnalogLecure', async () => {
      model.findByIdAndUpdate.mockReturnValue(resolves(stored));

      await expect(service.updateAnalogLecure(id, report())).resolves.toEqual(
        published,
      );
    });
  });
});
