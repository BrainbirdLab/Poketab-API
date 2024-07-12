import { type RedisValue } from "https://deno.land/x/redis@v0.32.1/mod.ts";

import { redis, _R_fileUploadAuth } from "../db/database.ts";

import { io } from "./websockets.ts";
import { Hono } from "https://deno.land/x/hono@v3.12.4/mod.ts";

const app = new Hono();

const MAX_SIZE = 50 * 1024 * 1024;

type FileData = {
  avatar: string,
  size: number,
  type: string,
  uploadedBy: string,
  uploadedAt: string,

  downloaded: number,
};

//file upload
app.post('/upload/:key/:uid/:messageId', async (ctx) => {

  try {
    console.log('Upload request received');

    const { key, uid, messageId } = ctx.req.param();

    const res = await _R_fileUploadAuth(key, uid);

    const [exists, activeUsers] = res as [number, number];

    if (!exists){
      ctx.status(401);
      return ctx.json({ message: 'Unauthorized' });
    }


    if (Number(activeUsers) < 2){
      ctx.status(400);
      return ctx.json({ message: 'Not enough users' });
    }

    //check file size before parsing form
    const contentLength = ctx.req.header('content-length');

    if (!contentLength) {
      ctx.status(400);
      return ctx.json({ message: 'No content length' });
    }

    if (+contentLength > MAX_SIZE) {
      ctx.status(400);
      return ctx.json({ message: `File size should be within ${MAX_SIZE} bytes.` });
    }

    const form = await ctx.req.formData();


    if (!form) {
      ctx.status(400);
      return ctx.json({ message: 'No data found' });
    }

    //file size
    const files = form.getAll('file') as File[];

    if (!files.length) {
      ctx.status(400);
      return ctx.json({ message: 'No file found. Check field avatar.' });
    }

    if (files.length > 1) {
      ctx.status(400);
      return ctx.json({ message: 'Multiple files found. Only one file allowed.' });
    }

    console.log(files[0].name);

    if (files[0].size > MAX_SIZE) {
      ctx.status(400);
      return ctx.json({ message: `File size should be within ${MAX_SIZE} bytes.` });
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
      ['originalName', file.name],
      ['type', file.type],
      ['maxDownload', maxUser - 1],
      ['downloadCount', 0]
    ];

    //add file data to redis
    await redis.hset(`chat:${key}:file:${messageId}`, ...fieldValues);

    //send a message to all users about the file
    io.in(`chat:${key}`).emit('fileDownload', messageId, uid);

    return ctx.json({ message: 'File uploaded' });
  } catch (_) {
    console.log("Error while receiving");
    console.log(_);
    ctx.status(400);
    return ctx.json({ message: 'Error while receiving' });
  }
});

//file download
app.get('/download/:key/:userId/:messageId', async (ctx) => {

  const { key, userId, messageId } = ctx.req.param();

  try {

    const res = await redis.exists(`chat:${key}`, `chat:${key}:user:${userId}`, `chat:${key}:file:${messageId}`);

    if (res !== 3){
      console.log('Unauthorized');
      ctx.status(401);
      return ctx.json({ message: 'Unauthorized' });
    }

    //check if this user has not downloaded this file before
    const [userHasDownloaded, originalName] = await redis.hmget(`chat:${key}:file:${messageId}`, `downloaded:uid:${userId}`, 'originalName') as unknown as [string, string];
    
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
      return ctx.json({message: 'File not found'});
    }

    const file = await Deno.open(path);
    const size = (await file.stat()).size;

    //serve file
    return ctx.newResponse(file.readable, 200, {
      'Content-Disposition': `attachment; filename=${originalName}`,
      'Content-Length': size.toString(),
      'Content-Type': 'application/octet-stream'
    });

  } catch (_) {
    ctx.status(404);
    return ctx.json({ message: 'Error downloading file'});
  } finally {
    
    const downloadInfo = await redis.hmget(`chat:${key}:file:${messageId}`, 'downloadCount', 'maxDownload');

    const [downloadCount, maxDownload] = downloadInfo as unknown as [number, number];

    if (Number(downloadCount + 1) >= Number(maxDownload)){
  
      await redis.del(`chat:${key}:file:${messageId}`);
      await Deno.remove(`./uploads/${key}/${messageId}`);
  
      console.log(`File deleted: ${messageId}`);
    }
  }
});



export default app;