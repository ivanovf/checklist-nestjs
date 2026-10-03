import {
  ArgumentMetadata,
  Injectable,
  PipeTransform,
  ValidationPipe,
} from '@nestjs/common';

const transformOptions = { enableImplicitConversion: true };

/**
 * The global request rules for validation (specs/010-fix-unknown-fields, research R2–R3).
 *
 * Bodies and queries are checked strictly: a property the DTO doesn't declare is refused at
 * every depth, so a caller can't store fields the API owns (`_id`, `createdAt`) or have a
 * misspelled field or parameter silently ignored (D5, constitution Principle IV).
 *
 * When they pass, the handler receives the value **exactly as it was sent**, not the
 * validated instance. With validator options set, `ValidationPipe` hands on a rebuilt object,
 * and that was observed to change valid requests:
 * - `CreateItemDto` initialises `checked` and `comments`, and `PartialType` inherits the
 *   initialisers, so every partial item change would uncheck the item and erase its comments.
 * - implicit conversion turns the text `"false"` into `true`.
 *
 * Returning the original is safe because an undeclared property anywhere in it has already
 * been refused. Query defaults still apply: the route-level query pipes run after this one
 * and transform the value as before.
 *
 * Bodies are checked **without** implicit conversion (specs/014-fix-mistyped-fields, research
 * R1–R2). Converting them checked a copy and stored the original, so an object passed as a
 * label and failed in storage (500), and a number passed as a date and was stored as 1970
 * (D8). JSON carries its own kinds, so a body is checked as it is. Queries are always text,
 * so they are still converted to be checked.
 *
 * Path parameters keep today's lenient check. They are scalars with their own pipes
 * (`ParseObjectIdPipe`), not objects that could carry unknown fields.
 */
@Injectable()
export class RequestValidationPipe implements PipeTransform {
  private readonly bodyPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  private readonly queryPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions,
  });

  private readonly argumentPipe = new ValidationPipe({ transformOptions });

  async transform(
    value: unknown,
    metadata: ArgumentMetadata,
  ): Promise<unknown> {
    if (metadata.type === 'body' || metadata.type === 'query') {
      const pipe = metadata.type === 'body' ? this.bodyPipe : this.queryPipe;
      await pipe.transform(value, metadata);
      return value;
    }
    return this.argumentPipe.transform(value, metadata);
  }
}
