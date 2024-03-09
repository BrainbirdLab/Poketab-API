import { io } from "./websockets.ts";

import { Hono } from "https://deno.land/x/hono@v3.12.4/mod.ts";

import "https://deno.land/x/dotenv@v3.2.2/mod.ts";



const { clienturl } = Deno.env.toObject();

export const app = new Hono();

console.log('Hono server instance created');

//set custom headers for all responses
app.use("*", async (ctx, next) => {
  const start = Date.now();
  ctx.header('X-Server', 'Deno');
  ctx.header('X-Powered-By', 'Hono');
  ctx.header('Access-Control-Allow-Origin', clienturl);
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
  //random emoji from unicode range
  const emoji = String.fromCodePoint(0x1F600 + Math.floor(Math.random() * 20));
  return ctx.text(`Hello from Poketab - Deno ${emoji}`);
});

//maintainace break message from admin
app.get('/mbm/:adminPasskey/:message/:time', (ctx) => {
  //read env variable
  const { adminPasskey } = ctx.req.param();
  const { message } = ctx.req.param();
  const { time } = ctx.req.param();

  console.log(`Got: ${adminPasskey}, ${message}, ${time}`);

  if (!adminPasskey || !message) {
    ctx.status(400);
    return ctx.json({ message: 'Invalid request' });
  }

  //check if passkey is correct
  const key = Deno.env.get('adminPasskey');

  if (adminPasskey !== key) {
    ctx.status(401);
    return ctx.json({ message: 'Unauthorized' });
  }

  //send message to all connected clients
  io.emit('maintainanceBreak', message, parseInt(time));

  ctx.status(200);
  return ctx.json({ message: 'Message sent' });

});


export const handler = io.handler(async (req: Request) => {
  //upgrade to websocket
  return await app.fetch(req) || new Response(null, { status: 404 });
});

console.log('Socket-io binded to Hono server');