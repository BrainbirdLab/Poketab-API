import { io } from "./websockets.ts";

import fileHandler from "./fileHandler.ts";

import "https://deno.land/x/dotenv@v3.2.2/mod.ts";

import { XebecServer } from "https://deno.land/x/xebec@v0.0.4/mod.ts";

const { clienturl, devMode } = Deno.env.toObject();

const app = new XebecServer();

console.log('Hono server instance created');

//set custom headers for all responses
app.use(async (_, next) => {
  const start = Date.now();
  const res = await next();
  const ms = Date.now() - start;
  res.headers.set('X-Server', 'Deno');
  res.headers.set('X-Powered-By', 'Hono');
  if (devMode) {
    console.log('Dev mode enabled');
    res.headers.set('Access-Control-Allow-Origin', '*');
  } else {
    res.headers.set('Access-Control-Allow-Origin', clienturl);
  }
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.headers.set('X-Response-Time', `${ms}ms`);

  return res;
});

app.OPTIONS('*', (_) => {
  return new Response(null, { status: 200 });
});

app.route('/api/files', fileHandler);

app.GET('/', (_) => {
  //random emoji from unicode range
  const emoji = String.fromCodePoint(0x1F600 + Math.floor(Math.random() * 20));
  return new Response(`Server is up and running ${emoji}`);
});

//maintainace break message from admin
app.GET('/mbm/:adminPasskey/:message/:time', (req) => {
  //read env variable

  const { adminPasskey, message, time } = req.params;

  if (!adminPasskey || !message) {
    return new Response('Invalid request', { status: 400 });
  }

  //check if passkey is correct
  const key = Deno.env.get('adminPasskey');

  if (adminPasskey !== key) {
    return new Response('Unauthorized', { status: 401 });
  }

  //send message to all connected clients
  io.emit('maintainanceBreak', message, parseInt(time));

  return new Response('Message sent', { status: 200 });

});


export const handler = io.handler(async (req: Request) => {
  //upgrade to websocket
  return await app.handler(req) || new Response(null, { status: 404 });
});

console.log('Socket-io binded to Hono server');