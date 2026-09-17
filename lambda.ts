import { Handler, Context, Callback } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { ValidationPipe } from '@nestjs/common';
import * as serverless from 'serverless-http';

let cachedServer;

const bootstrapServer = async () => {
  if (!cachedServer) {
    const app = await NestFactory.create(AppModule);

    app.useGlobalPipes(
      new ValidationPipe({
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    app.setGlobalPrefix('api');  // Ensure this prefix is set

    await app.init();

    cachedServer = serverless(app.getHttpAdapter().getInstance());
  }
  return cachedServer;
};

export const handler: Handler = async (event: any, context: Context, callback: Callback) => {
  const server = await bootstrapServer();
  return server(event, context);
};