const serverless = require('serverless-http');
const { createServer, proxy } = require('aws-serverless-express');
const express = require('express');
const { AppModule } = require('../dist/app.module');
const { NestFactory } = require('@nestjs/core');

let cachedServer;

async function bootstrapServer() {
  if (!cachedServer) {
    const expressApp = express();
    const nestApp = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
    await nestApp.init();
    cachedServer = createServer(expressApp);
  }
  return cachedServer;
}

module.exports.handler = async (event, context) => {
  const server = await bootstrapServer();
  return proxy(server, event, context, 'PROMISE').promise;
};

