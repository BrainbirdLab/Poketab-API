import { type RedisValue } from "https://deno.land/x/redis@v0.32.1/mod.ts";

import { redis, _R_fileUploadAuth } from "../db/database.ts";

import { io } from "./websockets.ts";
import { XebecServer } from "https://deno.land/x/xebec@0.0.5/mod.ts";

const app = new XebecServer();

const MAX_SIZE = 50 * 1024 * 1024;

//file upload
app.POST('/upload/:key/:uid/:messageId', async (req) => {

  try {
    console.log('Upload request received');

    const { key, uid, messageId } = req.params;

    const res = await _R_fileUploadAuth(key, uid);

    const [exists, activeUsers] = res as [number, number];

    if (!exists){
      return new Response('Unauthorized', { status: 401 });
    }


    if (Number(activeUsers) < 2){
      return new Response('Not enough users', { status: 400 });
    }

    //check file size before parsing form
    const contentLength = req.headers.get('content-length');

    if (!contentLength) {
      return new Response('No content length', { status: 400 });
    }

    if (+contentLength > MAX_SIZE) {
      return new Response(`File size should be within ${MAX_SIZE} bytes.`, { status: 400 });
    }

    const form = await req.formData();


    if (!form) {
      return new Response('No data found', { status: 400 });
    }

    //file size
    const files = form.getAll('file') as File[];

    if (!files.length) {
      return new Response('No file found. Check field avatar.', { status: 400 });
    }

    if (files.length > 1) {
      return new Response('Multiple files found. Only one file allowed.', { status: 400 });
    }

    if (files[0].size > MAX_SIZE) {
      return new Response(`File size should be within ${MAX_SIZE} bytes.`, { status: 400 });
    }

    const maxUser = await redis.hget(`chat:${key}`, 'maxUsers') as unknown as number;

    const file = files[0];

    //create directory by the key avatar if not exists
    const dirName = `./uploads/${key}`;

    //check is folder not exist
    const dir = await Deno.stat(dirName).catch(() => null);

    if (!dir?.isDirectory) {
      await Deno.mkdir(dirName, { recursive: true });
      console.log('Upload Directory created');
    }
    
    //write file to disk
    await Deno.writeFile(`${dirName}/${messageId}`, file.stream(), {append: true});

    const fieldValues: [string, RedisValue][] = [
      ['maxDownload', maxUser - 1],
      ['downloadCount', 0]
    ];

    //add file data to redis
    await redis.hset(`chat:${key}:file:${messageId}`, ...fieldValues);

    //send a message to all users about the file, except the sender
    io.in(`chat:${key}`).fetchSockets().then((sockets) => {
      sockets.forEach((soc) => {
        if (soc.id != uid) {
          soc.emit('fileDownload', messageId, uid);
        }
      });
    });

    return new Response('File uploaded', { status: 200 });
  } catch (_) {
    console.log("Error while receiving");
    console.log(_);
    return new Response('Error while receiving', { status: 400 });
  }
});

//file download
app.GET('/download/:key/:userId/:messageId', async (req) => {

  const { key, userId, messageId } = req.params;

  try {

    const res = await redis.exists(`chat:${key}`, `uid:${userId}`, `chat:${key}:file:${messageId}`);

    if (res !== 3){
      console.log('Unauthorized');
      return new Response('Unauthorized', { status: 401 });
    }

    //check if this user has not downloaded this file before
    const [userHasDownloaded] = await redis.hmget(`chat:${key}:file:${messageId}`, `downloaded:uid:${userId}`) as unknown as [string];
    
    if (userHasDownloaded === '1'){
      const tx = redis.tx();
      tx.hincrby(`chat:${key}:file:${messageId}`, 'downloadCount', 1);
      tx.hset(`chat:${key}:file:${messageId}`, `downloaded:uid:${userId}`, 1);
      await tx.flush();
    }

    const path = `./uploads/${key}/${messageId}`;

    //check if file exists
    const dir = await Deno.stat(path).catch(() => null);

    if (!dir) {
      return new Response('File not found', { status: 404 });
    }

    const file = await Deno.open(path);
    const size = (await file.stat()).size;

    //serve file
    // return ctx.newResponse(file.readable, 200, {
    //   'Content-Disposition': `attachment;`,
    //   'Content-Length': size.toString(),
    //   'Content-Type': 'application/octet-stream'
    // });

    return new Response(file.readable, {
      status: 200,
      headers: new Headers({
        'Content-Disposition': `attachment;`,
        'Content-Length': size.toString(),
        'Content-Type': 'application/octet-stream'
      })
    });

  } catch (_) {
    return new Response('Error downloading file', { status: 404 });
  } finally {
    
    const downloadInfo = await redis.hmget(`chat:${key}:file:${messageId}`, 'downloadCount', 'maxDownload');

    const [downloadCount, maxDownload] = downloadInfo as unknown as [number, number];

    if (Number(downloadCount + 1) >= Number(maxDownload)){

      try {
        await redis.del(`chat:${key}:file:${messageId}`);
        await Deno.remove(`./uploads/${key}/${messageId}`);
        console.log(`File deleted: ${messageId}`);
      } catch (_) {
        console.log('Error deleting file');
      }
    }
  }
});



export default app;