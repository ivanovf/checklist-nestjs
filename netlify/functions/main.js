const serverless = require('aws-serverless-express');
const express = require('express');
const { NestFactory } = require('@nestjs/core');
const { ExpressAdapter } = require('@nestjs/platform-express');

let cachedServer;

async function bootstrapServer() {
  if (!cachedServer) {
    const expressApp = express();
    const { AppModule } = require('./dist/app.module');
    const nestApp = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
    await nestApp.init();
    cachedServer = serverless.createServer(expressApp);
  }
  return cachedServer;
}

module.exports.handler = async (event, context) => {
  const server = await bootstrapServer();
  return serverless.proxy(server, event, context, 'PROMISE').promise;
};
