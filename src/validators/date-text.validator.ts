import {
  isISO8601,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * A date in a request body (specs/014-fix-mistyped-fields, research R3).
 *
 * JSON has no date kind, so every client sends dates as text, and bodies are checked as sent
 * (D8). Strict ISO 8601 alone isn't enough: it lets `20260101` and `2026-W01` through, which
 * `Date` can't read, so storage would fail on them with a server error. The value must also
 * be a real date, which strict mode alone checks for calendar forms (no 30 February).
 */
@ValidatorConstraint({ name: 'isDateText', async: false })
export class IsDateTextConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === 'string' &&
      isISO8601(value, { strict: true }) &&
      !Number.isNaN(new Date(value).getTime())
    );
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a date in ISO 8601 format`;
  }
}

export function IsDateText(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isDateText',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsDateTextConstraint,
    });
  };
}
