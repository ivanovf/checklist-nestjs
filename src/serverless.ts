import { NestFactory } from '@nestjs/core';
import { Request, Response } from 'express';

import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

/**
 * Serverless entry point (Vercel / any FaaS platform).
 *
 * A serverless function must export a request handler; it must never call `app.listen()`, which
 * is why `main.ts` cannot be used here — the platform owns the socket and the process can be
 * frozen between requests.
 *
 * The bootstrapped instance is cached on the module so a warm container reuses the existing Nest
 * app and, with it, the open Mongo connection pool. Without the cache every request would build
 * a fresh app and open a new connection, exhausting the database's connection limit.
 */
let cachedHandler: (req: Request, res: Response) => void;

async function bootstrapHandler() {
  if (!cachedHandler) {
    const app = await NestFactory.create(AppModule);

    configureApp(app);

    // `init()` rather than `listen()`: it runs module initialisation and leaves the Express
    // instance ready to handle requests without binding a port.
    await app.init();

    cachedHandler = app.getHttpAdapter().getInstance();
  }
  return cachedHandler;
}

export default async function handler(req: Request, res: Response) {
  const express = await bootstrapHandler();
  return express(req, res);
}
