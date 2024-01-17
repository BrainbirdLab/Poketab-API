import { io } from "./websockets.ts";

import { serve } from "https://deno.land/std@0.166.0/http/server.ts";
// @deno-types="npm:hono"
import { Hono } from "https://deno.land/x/hono@v3.12.3/mod.ts"


const port = 3000;

const app = new Hono();

console.log('Hono server instance created');

//set custom headers for all responses
app.use("*", async (ctx, next) => {
  const start = Date.now();
  ctx.header('X-Server', 'Deno');
  ctx.header('X-Powered-By', 'Hono');
  ctx.header('Access-Control-Allow-Origin', 'http://127.0.0.1:5678');
  ctx.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  await next();
  const ms = Date.now() - start;
  ctx.header('X-Response-Time', `${ms}ms`);
});

app.options('*', (ctx) => {
  ctx.status(200);
  return ctx.text('OK');
});

app.get('/', (ctx) => {
  return ctx.text('Hello world');
});


const handler = io.handler(async (req) => {
  //upgrade to websocket
  return await app.fetch(req) || new Response(null, { status: 404 });
});

console.log('Socket-io binded to Hono server');

await serve(handler, { port: +port });