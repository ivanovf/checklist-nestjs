import { FieldList, project } from '../../common/projection';

/**
 * The device configuration as every operation answers it: the service projects each record through this
 * shape, so only these fields leave it (D3, specs/009-fix-unprojected-records).
 */
export class ConfigResponseDto {
  _id: string;

  doorLock: string;

  mainLock: string;

  usersLimit: number;

  analogLecture: number;

  createdAt: Date;

  updatedAt: Date;
}

export const CONFIG_RESPONSE_FIELDS: FieldList<ConfigResponseDto> = {
  _id: true,
  doorLock: true,
  mainLock: true,
  usersLimit: true,
  analogLecture: true,
  createdAt: true,
  updatedAt: true,
};

export function toConfigResponse(config: object): ConfigResponseDto {
  return project<ConfigResponseDto>(config, CONFIG_RESPONSE_FIELDS);
}
