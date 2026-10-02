import { FieldList, project } from '../../common/projection';

/**
 * The checklist item as every operation answers it: the service projects each record through this
 * shape, so only these fields leave it (D3, specs/009-fix-unprojected-records).
 */
export class ItemResponseDto {
  _id: string;

  label: string;

  status: boolean;

  checked: boolean;

  description?: string;

  comments: string;

  category: string;

  createdAt: Date;

  updatedAt: Date;
}

export const ITEM_RESPONSE_FIELDS: FieldList<ItemResponseDto> = {
  _id: true,
  label: true,
  status: true,
  checked: true,
  description: true,
  comments: true,
  category: true,
  createdAt: true,
  updatedAt: true,
};

export function toItemResponse(item: object): ItemResponseDto {
  return project<ItemResponseDto>(item, ITEM_RESPONSE_FIELDS);
}
