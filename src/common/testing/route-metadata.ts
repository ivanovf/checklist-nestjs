import { RequestMethod, Type } from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export interface RouteMetadata {
  method: string;
  path: string;
  roles: string[] | undefined;
  isPublic: boolean;
}

const joinPath = (...parts: string[]) =>
  '/' +
  parts
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');

/**
 * Reads how a controller method is routed and guarded, straight from its decorators, so a
 * controller spec can assert its route table without booting HTTP. Guard *enforcement* is
 * proven end to end by the authorization matrix suite; this pins the declarations it reads.
 */
export function routeOf<T>(
  controller: Type<T>,
  handler: keyof T & string,
): RouteMetadata {
  const fn = controller.prototype[handler];
  const read = <V>(key: string): V | undefined =>
    Reflect.getMetadata(key, fn) ?? Reflect.getMetadata(key, controller);

  return {
    method: RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn) as number],
    path: joinPath(
      Reflect.getMetadata(PATH_METADATA, controller) as string,
      Reflect.getMetadata(PATH_METADATA, fn) as string,
    ),
    roles: read<string[]>('roles'),
    isPublic: read<boolean>(IS_PUBLIC_KEY) === true,
  };
}

/**
 * The pipes bound to one named route parameter, e.g. the `id` of `@Param('id', SomePipe)`, so
 * a controller spec can assert how a path value is checked without booting HTTP.
 */
export function paramPipes<T>(
  controller: Type<T>,
  handler: keyof T & string,
  name: string,
): unknown[] {
  const args: Record<string, { data?: unknown; pipes?: unknown[] }> =
    Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, handler) ?? {};
  const param = Object.entries(args).find(
    ([key, arg]) =>
      key.startsWith(`${RouteParamtypes.PARAM}:`) && arg.data === name,
  );

  return param?.[1].pipes ?? [];
}

/**
 * The pipes bound to a route's whole query, `@Query(SomePipe)`, so a controller spec can
 * assert how a list's query is converted without booting HTTP.
 */
export function queryPipes<T>(
  controller: Type<T>,
  handler: keyof T & string,
): unknown[] {
  const args: Record<string, { data?: unknown; pipes?: unknown[] }> =
    Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, handler) ?? {};
  const query = Object.entries(args).find(
    ([key, arg]) =>
      key.startsWith(`${RouteParamtypes.QUERY}:`) && arg.data === undefined,
  );

  return query?.[1].pipes ?? [];
}
