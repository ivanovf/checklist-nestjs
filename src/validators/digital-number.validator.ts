import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isDigitalNumberConstraint', async: false })
export class IsDigitalNumberConstraint implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments) {
    let parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) {
      return false;
    }
    if (parsedValue < 10) {
      parsedValue = 0;
    }
    const limit = args.constraints[0] ?? 10;
    return parsedValue >= 0 && parsedValue < limit;
  }

  defaultMessage(args: ValidationArguments) {
    const limit = args.constraints[0] ?? 10;
    return `${args.property} must be a digital number between 0 and ${limit}`;
  }
}

export function IsDigitalNumber(
  limit?: number,
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isDigitalNumber',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [limit ?? 10],
      validator: IsDigitalNumberConstraint,
    });
  };
}
