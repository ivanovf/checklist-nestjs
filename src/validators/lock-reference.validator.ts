import {
  isMongoId,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

import { IsDigitalNumberConstraint } from './digital-number.validator';

/** The lock code user slots: the same limit as `CreateLockDto.userNumber`. */
const USER_SLOTS = 20;

/**
 * A reservation's lock (specs/010-fix-unknown-fields, research R6).
 *
 * The mobile app stores a lock code's user slot (e.g. `"03"`) and looks the door code up
 * itself. Older reservations hold a lock code's id instead, and the app sends whatever is
 * stored back on every edit, so both forms stay valid. An empty value means "no lock".
 *
 * The slot reuses the lock code's own `userNumber` rule rather than a copy of it, leniency
 * included.
 */
@ValidatorConstraint({ name: 'isLockReference', async: false })
export class IsLockReferenceConstraint implements ValidatorConstraintInterface {
  private readonly slot = new IsDigitalNumberConstraint();

  validate(value: unknown, args: ValidationArguments): boolean {
    if (value === '' || value === null || value === undefined) {
      return true;
    }
    if (typeof value !== 'string') {
      return false;
    }
    return (
      isMongoId(value) ||
      this.slot.validate(value, { ...args, constraints: [USER_SLOTS] })
    );
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a lock user slot (0–${USER_SLOTS - 1}) or a lock id`;
  }
}

export function IsLockReference(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isLockReference',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsLockReferenceConstraint,
    });
  };
}
