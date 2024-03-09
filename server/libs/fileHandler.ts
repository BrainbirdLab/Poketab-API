import { type RedisValue } from "https://deno.land/x/redis@v0.32.1/mod.ts";

import { redis } from "../db/database.ts";
import { app } from "./apiServer.ts";

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
app.post('/upload/:key/:uid', async (ctx) => {

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
app.get('/download/:key/:userId/:fileId', async (ctx) => {

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
    
    
    ctx.newResponse(file.readable, {
      headers: new Headers({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${originalName}"`,
      }),
    });
    
    console.log('File served');
    
    //if download is > 10, delete the file
    if (downloadCount && Number(downloadCount + 1) >= maxDownload){

        await redis.del(`chat:${key}:file:${fileId}`);
        await Deno.remove(`./uploads/${key}/${fileId}`);

        console.log('File deleted');
        //if './uploads/key' is empty, delete the directory
        Deno.stat(`./uploads/${key}`)
            .then(async (dir) => {
                if (dir.isDirectory && dir.size === 0){
                    await Deno.remove(`./uploads/${key}`);
                    console.log('Directory deleted');
                }
            }
        ).catch(() => {});
    }

  } catch (_) {
    console.error(_);
    ctx.status(404);
    return ctx.json({ message: 'Not found' });
  }
});