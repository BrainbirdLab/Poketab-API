
import { getRandomKey } from './keyGen.ts';
import { Key, User } from './schema.ts';
import { validateAvatar, validateKey, validateUserName, getLinkMetadata } from './utils.ts';
import { connect } from "https://deno.land/x/redis/mod.ts";
import { Server, type Socket } from "https://deno.land/x/socket_io@0.2.0/mod.ts";
import "https://deno.land/x/dotenv@v3.2.2/load.ts";

//this will only serve websocket connections and not http requests

const { clienturl, host, password, port } = Deno.env.toObject();

export const redis = await connect({
  hostname: host,
  port: +port,
  password: password,
  maxRetryCount: 5,
});

//delete all keys
await redis.sendCommand('FLUSHALL');

console.log('Redis connected');


export const io = new Server({
  cors: {
    origin: clienturl,
    methods: ["GET", "POST"],
    credentials: true
  }
});

console.log('Socket.io server initialized');

io.on('connection', (socket) => {

  console.log('Socket Connected');

  socket.on('fetchKeyData', async (key: string, callback: (data: object | null) => void) => {

    if (!redis.isConnected) {
      console.log('Redis not connected');
      redis.connect();
      callback({ success: false, message: 'Database disconnected', statusCode: 502, icon: 'fa-solid fa-triangle-exclamation', users: {}, maxUsers: null })
      return;
    }

    console.log('fetchKeyData for key: ', key);

    if (!validateKey(key)) {
      callback({ success: false, message: 'Invalid Key', statusCode: 400, icon: 'fa-solid fa-triangle-exclamation', users: {}, maxUsers: null });
      return;
    }

    console.log('Searching database...');


    try {
      //const exists = await redis.exists(`chat:${key}`);
      const exists = await redis.sendCommand('EXISTS', [`chat:${key}`]);

      if (!exists) {
        console.log('Key Does Not Exist');
        callback({ success: false, message: 'Key Does Not Exist', statusCode: 404, icon: 'fa-solid fa-ghost', users: {}, maxUsers: null });
        return;
      }

      //const { activeUsers, maxUsers, users }: Key = await redis.json.get(`chat:${key}`, { path: ["activeUsers", "maxUsers", "users"] }) as Key;
      const reply = await redis.sendCommand('JSON.GET', [`chat:${key}`, 'activeUsers', 'maxUsers', 'users']);

      if (!reply) {
        console.log('Key Data Not Found');
        callback({ success: false, message: 'Key Data Not Found', statusCode: 404, icon: 'fa-solid fa-ghost', users: {}, maxUsers: null });
        return;
      }

      const { activeUsers, maxUsers, users } = JSON.parse(reply as string) as Key;

      if (activeUsers >= maxUsers) {
        callback({ success: false, message: 'Key Full', statusCode: 401, icon: 'fa-solid fa-door-closed', users: {}, maxUsers: null });
        return;
      }

      socket.join(`waitingRoom:${key}`);
      console.log(socket.id, 'joined waiting room for key: ', key);

      callback({ success: true, message: 'Available', statusCode: 200, icon: '', users: { ...users }, maxUsers: maxUsers });
    } catch (error) {
      console.error(error);
      callback({ success: false, message: 'Server Error', statusCode: 500, icon: 'fa-solid fa-triangle-exclamation', users: {}, maxUsers: null });
    }
  });

  socket.on('createChat', async (name: string, avatar: string, maxUsers: number, callback: (data: object | null) => void) => {

    console.log('createChat requested');

    if (!redis.isConnected) {
      callback({ success: false, message: 'Database disconnected', statusCode: 502, icon: 'fa-solid fa-triangle-exclamation', users: {}, maxUsers: null })
      //try to reconnect
      redis.connect();
      return;
    }

    if (!validateUserName(name)) {
      callback({ success: false, message: 'Invalid name', icon: 'fa-solid fa-triangle-exclamation' });
      return;
    }

    if (!validateAvatar(avatar)) {
      callback({ success: false, message: 'Invalid Avatar', icon: 'fa-solid fa-triangle-exclamation' });
      return;
    }

    if (maxUsers < 2 || maxUsers > 10) {
      callback({ success: false, message: 'Invalid Max Users', icon: 'fa-solid fa-triangle-exclamation' });
      return;
    }

    try {
      const uid = crypto.randomUUID();
      const key = await getRandomKey();

      const user: User = {
        name: name,
        avatar,
        uid,
        joined: Date.now(),
      };

      const chatKey: Key = {
        users: {
          [uid]: user,
        },
        activeUsers: 1,
        maxUsers,
        admin: uid,
        created: Date.now(),
      };

      socket.join(`chat:${key}`);
      socket.leave(`waitingRoom:${key}`);
      console.log(socket.id, 'left waiting room for key: ', key);

      await Promise.all([
        //redis.json.set(`chat:${key}`, '.', chatKey),
        //redis.json.set(`socket:${socket.id}`, '.', { name, uid, key }),
        redis.sendCommand('JSON.SET', [`chat:${key}`, '.', JSON.stringify(chatKey)]),
        redis.sendCommand('JSON.SET', [`socket:${socket.id}`, '.', JSON.stringify({ name, uid, key })]),
      ]);

      callback({ success: true, message: 'Chat Created', key, userId: uid, maxUsers: maxUsers });

      //get name, avatar, and id of all users in the room
      const me = {
        name,
        avatar,
        uid,
      };

      console.log('Chat Created');
      io.in(`chat:${key}`).emit('updateUserList', { [uid]: me });
      console.log(`sent update user list to ${key}. users count: 1`);
      io.in(`waitingRoom:${key}`).emit('updateUserListWR', { [uid]: me });
      //only sender
      socket.emit('server_message', { text: 'You joined the that🔥', id: crypto.randomUUID() }, 'join');


      socket.on('disconnect', async () => {
        console.log(`Chat Socket ${socket.id} Disconnected`);
        await exitSocket(socket, key);
      });

      socket.on('leaveChat', async (callback) => {
        await exitSocket(socket, key);
        console.log('Chat Left');
        callback();
      });


    } catch (error) {
      console.error(error);
      callback({ success: false, message: 'Chat Creation Failed', icon: 'fa-solid fa-triangle-exclamation' });
    }
  });

  socket.on('joinChat', async (key: string, name: string, avatar: string, callback: (data: object | null) => void) => {
    console.log('joinChat requested');

    if (!redis.isConnected) {
      callback({ success: false, message: 'Database disconnected', statusCode: 502, icon: 'fa-solid fa-triangle-exclamation', users: {}, maxUsers: null })
      //try to reconnect
      redis.connect();
      return;
    }

    if (!validateKey(key)) {
      callback({ success: false, message: 'Invalid Key', icon: 'fa-solid fa-triangle-exclamation' });
      return;
    }

    if (!validateUserName(name)) {
      callback({ success: false, message: 'Invalid name', icon: 'fa-solid fa-triangle-exclamation' });
      return;
    }

    if (!validateAvatar(avatar)) {
      callback({ success: false, message: 'Invalid Avatar', icon: 'fa-solid fa-triangle-exclamation' });
      return;
    }

    try {

      if (await redis.sendCommand('EXISTS', [`chat:${key}`])) {

        //retrive .activeUsers, .maxUsers, and .users from redis in one call
        //const redisData = await redis.json.get(`chat:${key}`, { path: ["activeUsers", "maxUsers", "users"] }) as Key;

        const reply = await redis.sendCommand('JSON.GET', [`chat:${key}`,  'activeUsers', 'maxUsers', 'users']);

        if (reply) {

          const { activeUsers, maxUsers, users } = JSON.parse(reply as string) as Key;

          if (activeUsers >= maxUsers) {
            callback({ success: false, message: 'Chat Full', icon: 'fa-solid fa-door-closed' });
            return;
          }

          const uid = crypto.randomUUID();

          const me: User = {
            name: name,
            avatar,
            uid,
            joined: Date.now(),
          };

          socket.join(`chat:${key}`);
          socket.leave(`waitingRoom:${key}`);
          console.log(socket.id, 'left waiting room for key: ', key);

          await Promise.all([
            //redis.json.set(`chat:${key}`, `.users.${uid}`, me),
            //redis.json.set(`socket:${socket.id}`, '.', { name, uid, key }),
            //redis.json.numIncrBy(`chat:${key}`, '.activeUsers', 1),
            redis.sendCommand('JSON.SET', [`chat:${key}`, `users.${uid}`, JSON.stringify(me)]),
            redis.sendCommand('JSON.SET', [`socket:${socket.id}`, '.', JSON.stringify({ name, uid, key })]),
            redis.sendCommand('JSON.NUMINCRBY', [`chat:${key}`, 'activeUsers', 1]),
          ]);

          callback({ success: true, message: 'Chat Joined', key, userId: uid, maxUsers: maxUsers });


          console.log('Chat Joined');

          //log the connected users on that room
          io.in(`chat:${key}`).emit('updateUserList', { ...users, [uid]: me });
          console.log(`sent update user list to ${key}. users count: ${activeUsers + 1}`);
          socket.in(`waitingRoom:${key}`).emit('updateUserListWR', { ...users, [uid]: me });

          //only sender
          socket.emit('server_message', { text: 'You joined the that🔥', id: crypto.randomUUID() }, 'join');

          //broadcast
          socket.in(`chat:${key}`).emit('server_message', { text: `${name} joined the that🔥`, id: crypto.randomUUID() }, 'join');

          socket.on('disconnect', async () => {
            console.log(`Chat Socket ${socket.id} Disconnected`);
            await exitSocket(socket, key);
          });

          socket.on('leaveChat', async (callback) => {
            await exitSocket(socket, key);
            console.log('Chat Left');
            callback();
          });


        } else {
          // Handle the case where the data doesn't exist or is null.
          callback({ success: false, message: 'Key Data Not Found', icon: 'fa-solid fa-ghost' });
        }

      } else {
        callback({ success: false, message: 'Key Does Not Exist', icon: 'fa-solid fa-ghost' });
        return;
      }

    } catch (error) {
      console.error(error);
      callback({ success: false, message: 'Chat Join Failed' });
    }
  });

  socket.on('newMessage', (message, key: string, callback: (data: string | null) => void) => {

    const messageId = crypto.randomUUID();
    //broadcast
    socket.in(`chat:${key}`).emit('newMessage', message, messageId);

    callback(messageId);

    if (message.kind == 'text') {
      getLinkMetadata(message.message).then((data) => {
        if (data.success) {
          //everyone in room
          io.in(`chat:${key}`).emit('linkPreviewData', messageId, data.data);
        }
      });
    }
  });

  socket.on('deleteMessage', (messageId: string, key: string, userId: string) => {
    //send back to all users in the room including the sender
    io.in(`chat:${key}`).emit('deleteMessage', messageId, userId);
  });


  socket.on('react', (messageId: string, key: string, userId: string, react: string) => {

    //everyone in room including sender
    io.in(`chat:${key}`).emit('react', messageId, userId, react);
  });

  socket.on('seen', (uid: string, key: string, msgId: string) => {
    //broadcast
    socket.in(`chat:${key}`).emit('seen', uid, msgId);
  });

  socket.on('typing', (uid: string, key: string, event: string) => {
    //broadcast
    socket.in(`chat:${key}`).emit('typing', uid, event);
  });

  socket.on('location', (position, key, uid) => {
    const messageId = crypto.randomUUID();
    //everyone in room including sender
    io.in(`chat:${key}`).emit('location', position, messageId, uid);
  });
});

async function exitSocket(socket: Socket, key: string) {

  socket.leave(`waitingRoom:${key}`);
  socket.leave(`chat:${key}`);

  //if socket not exists in redis, return
  if (!await redis.sendCommand('EXISTS', [`socket:${socket.id}`])) {
    console.log('Socket no longer exists in database');
    return;
  }
  //get uid from redis
  //const { name, uid } = await redis.json.get(`socket:${socket.id}`) as { name: string, uid: string, key: string };
  let reply = await redis.sendCommand('JSON.GET', [`socket:${socket.id}`,  'name', 'uid']);

  if (!reply) {
    console.log('Socket Data Not Found');
    return;
  }

  const { name, uid } = JSON.parse(reply as string) as { name: string, uid: string};

  //remove user from redis
  await Promise.all([
    //redis.json.del(`socket:${socket.id}`),
    //redis.json.del(`chat:${key}`, `.users.${uid}`),
    //redis.json.numIncrBy(`chat:${key}`, '.activeUsers', -1),
    redis.sendCommand('JSON.DEL', [`socket:${socket.id}`]),
    redis.sendCommand('JSON.DEL', [`chat:${key}`, `users.${uid}`]),
    redis.sendCommand('JSON.NUMINCRBY', [`chat:${key}`, 'activeUsers', -1]),
  ]);

  console.log(`User ${name} left ${key}`);
  
  socket.in(`chat:${key}`).emit('server_message', { text: `${name} left the chat😭`, id: crypto.randomUUID() }, 'leave');

  //const activeUsers = await redis.json.get(`chat:${key}`, { path: ["activeUsers"] }) as number;
  reply = await redis.sendCommand('JSON.GET', [`chat:${key}`, 'activeUsers']);

  if (!reply) {
    console.log('Empty key');
    return;
  }

  const activeUsers = JSON.parse(reply as string) as number;

  if (activeUsers <= 0) {
    //delete key from redis
    //await redis.del(`chat:${key}`);
    await redis.sendCommand('DEL', [`chat:${key}`]);
    console.log('Key deleted');
  } else {
    //get users from redis
    //const users = await redis.json.get(`chat:${key}`, { path: ["users"] }) as { [key: string]: User };
    reply = await redis.sendCommand('JSON.GET', [`chat:${key}`, 'users']);

    if (!reply) {
      console.log('Empty key');
      return;
    }

    const users = JSON.parse(reply as string) as { [key: string]: User };

    io.in(`chat:${key}`).emit('updateUserList', users);
    console.log(`sent update user list to ${key}. users count: ${activeUsers}`);
    io.in(`waitingRoom:${key}`).emit('updateUserListWR', users);
  }
}