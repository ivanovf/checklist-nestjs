import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Lets a change repeat its own record's id in the body (specs/010-fix-unknown-fields,
 * research R4).
 *
 * The mobile app sends `_id` on every edit, equal to the id in the path. That value is
 * dropped before validation, so the strict body check never sees it and `$set` never touches
 * the immutable `_id`. Any other value would move the record, and is refused.
 *
 * Interceptors run after the guards and before the pipes, so an unauthenticated or
 * unauthorised caller is still refused first. A create has no `:id`, so its `_id` is left for
 * validation to refuse as undeclared: no caller chooses a new record's id.
 */
@Injectable()
export class OwnIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const id = req.params?.id;
    const body: unknown = req.body;

    if (id !== undefined && isPlainObject(body) && '_id' in body) {
      if (body._id !== id) {
        throw new BadRequestException(['_id must match the id in the path']);
      }
      delete body._id;
    }
    return next.handle();
  }
}
