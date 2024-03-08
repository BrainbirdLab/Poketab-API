import { io } from "./websockets.ts";

import { Hono, type Context, type Next } from "https://deno.land/x/hono@v3.12.4/mod.ts";

import { redis } from "../db/database.ts";

import "https://deno.land/x/dotenv@v3.2.2/mod.ts";
import { RedisValue } from "https://deno.land/x/redis@v0.32.1/mod.ts";

const { clienturl } = Deno.env.toObject();

const app = new Hono();

console.log('Hono server instance created');

//set custom headers for all responses
app.use("*", async (ctx: Context, next: Next) => {
  const start = Date.now();
  ctx.header('X-Server', 'Deno');
  ctx.header('X-Powered-By', 'Hono');
  ctx.header('Access-Control-Allow-Origin', clienturl);
  ctx.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  await next();
  const ms = Date.now() - start;
  ctx.header('X-Response-Time', `${ms}ms`);
});

app.options('*', (ctx: Context) => {
  ctx.status(200);
  return ctx.text('OK');
});

app.get('/', (ctx: Context) => {
  //random emoji from unicode range
  const emoji = String.fromCodePoint(0x1F600 + Math.floor(Math.random() * 20));
  return ctx.text(`Hello from Poketab - Deno ${emoji}`);
});

//maintainace break message from admin
app.get('/mbm/:adminPasskey/:message/:time', (ctx: Context) => {
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

const MAX_SIZE = 50 * 1024 * 1024;

type FileData = {
  name: string,
  size: number,
  type: string,
  uploadedBy: string,
  uploadedAt: string,

  downloaded: number,
  //downloadedBy: string[]
};

//file upload
app.post('/upload/:key/:uid', async (ctx: Context) => {

  try {
    console.log('Upload request received');
    console.log(ctx.req.param());

    const { key, uid } = ctx.req.param();

    //check if key and uid exists
    const exists = await redis.exists(`chat:${key}:user:${uid}`);

    if (!exists){
      console.log('Unauthorized');
      ctx.status(401);
      return ctx.json({ message: 'Unauthorized' });
    }

    //check file size before parsing form
    const contentLength = ctx.req.header('content-length');

    if (!contentLength) {
      console.log('No content length');

      ctx.status(400);
      return ctx.json({ message: 'No content length' });
    }

    if (+contentLength > MAX_SIZE) {
      console.log('File size too large - Content length');
      ctx.status(400);
      return ctx.json({ message: `File size should be within ${MAX_SIZE} bytes.` });
    }

    console.log("parsing form");

    const form = await ctx.req.formData();


    if (!form) {
      ctx.status(400);
      return ctx.json({ message: 'No data found' });
    }

    console.log("parsing file");

    //file size
    const files = form.getAll('file') as File[];

    if (!files.length) {
      console.log('No file found');
      ctx.status(400);
      return ctx.json({ message: 'No file found. Check field name.' });
    }

    if (files.length > 1) {
      console.log('Multiple files found');
      ctx.status(400);
      return ctx.json({ message: 'Multiple files found. Only one file allowed.' });
    }

    console.log(files[0].name);

    if (files[0].size > MAX_SIZE) {
      console.log('File size too large - File size');
      ctx.status(400);
      return ctx.json({ message: `File size should be within ${MAX_SIZE} bytes.` });
    }

    const maxUser = await redis.hget(`chat:${key}`, 'maxUsers') as unknown as number;

    console.log('Writing file...');

    const file = files[0];
    
    //make a random name from crypto
    const fileId = crypto.randomUUID();

    //create directory by the key name if not exists
    const dirName = `./uploads/${key}`;

    await Deno.mkdir(dirName, { recursive: true });
    
    //write file to disk
    await Deno.writeFile(`${dirName}/${fileId}`, file.stream(), {append: true});

    console.log('File written');

    const fieldValues: [string, RedisValue][] = [
      ['originalName', file.name],
      ['type', file.type],
      ['maxDownload', maxUser - 1],
      ['downloadCount', 0]
    ];

    //add file data to redis
    await redis.hset(`chat:${key}:file:${fileId}`, ...fieldValues);
    //tx.hset(`chat:${key}:file:${fileId}`, 'recievedCount', 0);

    return ctx.json({ message: 'File uploaded', fileId });
  } catch (_) {
    console.log(_);
    ctx.status(500);
    return ctx.json({ message: 'Upload cancelled' });
  }
});

//file download
app.get('/download/:key/:userId/:fileId', async (ctx: Context) => {

  try {
    console.log('Download request received');

    const { key, userId, fileId } = ctx.req.param();
  
    const res = await redis.exists(`chat:${key}`, `chat:${key}:user:${userId}`, `chat:${key}:file:${fileId}`);

    console.log(res);

    if (res !== 3){
      console.log('Unauthorized');
      ctx.status(401);
      return ctx.json({ message: 'Unauthorized' });
    }

    //serve file
    const file = await Deno.open(`./uploads/${key}/${fileId}`);
  
    //check if this user has not downloaded this file before
    const [userHasDownloaded, originalName, downloadCount, maxDownload] = await redis.hmget(`chat:${key}:file:${fileId}`, 'downloaded:uid:' + userId, 'originalName', 'downloadCount', 'maxDownload') as [string, string, number, number];
    if (!userHasDownloaded){
      redis.hincrby(`chat:${key}:file:${fileId}`, 'downloadCount', 1);
    }
    
    console.log('File served');
    
    ctx.newResponse(file.readable, {
      headers: new Headers({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${originalName}"`,
      }),
    });

    //if download is > 10, delete the file
    if (downloadCount && Number(downloadCount) >= maxDownload){
      await redis.del(`chat:${key}:file:${fileId}`);
      await Deno.remove(`./uploads/${key}/${fileId}`);
      console.log('File deleted');
    }

  } catch (_) {
    console.error(_);
    ctx.status(404);
    return ctx.json({ message: 'Not found' });
  }
});


export const handler = io.handler(async (req: Request) => {
  //upgrade to websocket
  return await app.fetch(req) || new Response(null, { status: 404 });
});

console.log('Socket-io binded to Hono server');