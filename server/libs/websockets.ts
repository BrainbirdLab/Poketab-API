
import { getRandomKey } from './keyGen.ts';
import { Key, User } from '../db/database.ts';
import { validateAvatar, validateKey, validateUserName, getLinkMetadata } from './utils.ts';
import { Server, type Socket } from "https://deno.land/x/socket_io@0.2.0/mod.ts";
import "https://deno.land/x/dotenv@v3.2.2/load.ts";
import { redis } from "../db/database.ts";

const { clienturl } = Deno.env.toObject();

export const io = new Server({
  cors: {
    origin: clienturl,
    methods: ["GET", "POST"],
    credentials: true
  }
});

console.log('Socket.io server initialized');
//load lua scripts
const getAllUsersDataScript = await Deno.readTextFile('server/db/lua/getAllUsersData.lua');

console.log('Lua scripts loaded');

const SHA = await redis.scriptLoad(getAllUsersDataScript);

async function getAllUsersData(key: string){
  const result = await redis.evalsha(SHA, [], [key]) as string;
  return JSON.parse(result);
}

io.on('connection', (socket) => {

  console.log('Socket Connected');

  socket.on('fetchKeyData', async (key: string, ssr: boolean, callback: (data: object | null) => void) => {

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

      const exists = await redis.exists(`chat:${key}`);

      if (!exists) {
        console.log('Key Does Not Exist');
        callback({ success: false, message: 'Key Does Not Exist', statusCode: 404, icon: 'fa-solid fa-ghost', users: {}, maxUsers: null });
        return;
      }

      const keyData = await redis.hmget(`chat:${key}`, 'activeUsers', 'maxUsers');

      if (!keyData) {
        console.log('Key Data Not Found');
        callback({ success: false, message: 'Key Data Not Found', statusCode: 404, icon: 'fa-solid fa-ghost', users: {}, maxUsers: null });
        return;
      }

      //const [ activeUsers, maxUsers ] = keyData as [string, string];
      const activeUsers = parseInt(keyData[0] as string);
      const maxUsers = parseInt(keyData[1] as string);

      if (activeUsers >= maxUsers) {
        callback({ success: false, message: 'Key Full', statusCode: 401, icon: 'fa-solid fa-door-closed', users: {}, maxUsers: null });
        return;
      }

      const users = await getAllUsersData(key);

      if (!ssr){
        socket.join(`waitingRoom:${key}`);
        console.log(socket.id, 'joined waiting room for key: ', key);
      }

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

      const chatKey: Key = {
        activeUsers: 1,
        maxUsers,
        admin: uid,
        created: Date.now(),
      };

      socket.join(`chat:${key}`);
      socket.leave(`waitingRoom:${key}`);
      console.log(socket.id, 'left waiting room for key: ', key);

      //Use multi to set multiple keys in one call
      const tx = redis.tx();
      //hset
      //chat key or room
      tx.hset(`chat:${key}`, 'activeUsers', chatKey.activeUsers);
      tx.hset(`chat:${key}`, 'maxUsers', chatKey.maxUsers);
      tx.hset(`chat:${key}`, 'admin', chatKey.admin || '');
      tx.hset(`chat:${key}`, 'created', chatKey.created);
      
      //users
      tx.sadd(`chat:${key}:users`, uid);
      //user data
      tx.hset(`chat:${key}:user:${uid}`, 'name', name);
      tx.hset(`chat:${key}:user:${uid}`, 'avatar', avatar);
      tx.hset(`chat:${key}:user:${uid}`, 'uid', uid);
      tx.hset(`chat:${key}:user:${uid}`, 'joined', Date.now());

      //socket
      tx.hset(`socket:${socket.id}`, 'name', name);
      tx.hset(`socket:${socket.id}`, 'uid', uid);
      tx.hset(`socket:${socket.id}`, 'key', key);
      

      await tx.flush();

      callback({ success: true, message: 'Chat Created', key, userId: uid, maxUsers: maxUsers });

      //get name, avatar, and id of all users in the room
      const me = { name, avatar, uid };

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

      if (await redis.exists(`chat:${key}`)) {

        //const reply = await redis.sendCommand('JSON.GET', [`chat:${key}`,  'activeUsers', 'maxUsers', 'users']);
        const keyData = await redis.hmget(`chat:${key}`, 'activeUsers', 'maxUsers');

        if (keyData) {

          //const { activeUsers, maxUsers, users } = JSON.parse(reply as string) as Key;
          const activeUsers = parseInt(keyData[0] as string);
          const maxUsers = parseInt(keyData[1] as string);

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

          //Use multi to set multiple keys in one call
          const tx = redis.tx();

          //users
          tx.sadd(`chat:${key}:users`, uid);

          //my data
          tx.hset(`chat:${key}:user:${uid}`, 'name', me.name);
          tx.hset(`chat:${key}:user:${uid}`, 'avatar', me.avatar);
          tx.hset(`chat:${key}:user:${uid}`, 'uid', me.uid);
          tx.hset(`chat:${key}:user:${uid}`, 'joined', me.joined);

          //socket
          tx.hset(`socket:${socket.id}`, 'name', name);
          tx.hset(`socket:${socket.id}`, 'uid', uid);
          tx.hset(`socket:${socket.id}`, 'key', key);

          //increment active users
          tx.hincrby(`chat:${key}`, 'activeUsers', 1);
          
          let users: { [key: string]: Omit<User, 'joined'> } = {}; //omit the joined property

          await tx.flush();
          users = await getAllUsersData(key),

          callback({ success: true, message: 'Chat Joined', key, userId: uid, maxUsers: maxUsers });

          console.log('Chat Joined');

          //log the connected users on that room
          io.in(`chat:${key}`).emit('updateUserList', { ...users, [uid]: me });
          console.log(`sent update user list to ${key}. users count: ${activeUsers + 1}`);
          io.in(`waitingRoom:${key}`).emit('updateUserListWR', { ...users, [uid]: me });

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

    console.log(message.type);
    if (message.type === 'text') {
      getLinkMetadata(message.message).then((data) => {
        console.log(data);
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
  if (!await redis.exists(`socket:${socket.id}`)) {
    console.log('Socket no longer exists in database');
    return;
  }
  //get uid from redis
  //const { name, uid } = await redis.json.get(`socket:${socket.id}`) as { name: string, uid: string, key: string };
  //let reply = await redis.sendCommand('JSON.GET', [`socket:${socket.id}`,  'name', 'uid']);
  let data = await redis.hmget(`socket:${socket.id}`, 'name', 'uid');

  if (!data) {
    console.log('Socket Data Not Found');
    return;
  }

  const [ name, uid ] = data as [string, string];

  //Use multi to set multiple keys in one call
  const tx = redis.tx();
  /*
  tx.sendCommand('JSON.DEL', [`socket:${socket.id}`]);
  tx.sendCommand('JSON.DEL', [`chat:${key}`, `users.${uid}`]);
  tx.sendCommand('JSON.NUMINCRBY', [`chat:${key}`, 'activeUsers', -1]);
  */

  //delete socket
  tx.del(`socket:${socket.id}`);
  //delete user
  tx.srem(`chat:${key}:users`, uid);
  //delete user data
  tx.del(`chat:${key}:user:${uid}`);
  //decrement active users
  tx.hincrby(`chat:${key}`, 'activeUsers', -1);

  await tx.flush();

  console.log(`User ${name} left ${key}`);
  
  socket.in(`chat:${key}`).emit('server_message', { text: `${name} left the chat😭`, id: crypto.randomUUID() }, 'leave');

  data = await redis.hmget(`chat:${key}`, 'activeUsers');

  if (!data) {
    console.log('Empty key');
    return;
  }

  const [activeUsers] = data as unknown as [number];

  if (activeUsers > 0) {
    console.log(`sent update user list to ${key}. users count: 0`);
    io.in(`waitingRoom:${key}`).emit('updateUserListWR', {});
  } else {
    redis.del(`chat:${key}`);
    console.log('Key deleted');
    const users = await getAllUsersData(key);
    io.in(`chat:${key}`).emit('updateUserList', users);
    console.log(`sent update user list to ${key}. users count: ${activeUsers}`);
    io.in(`waitingRoom:${key}`).emit('updateUserListWR', users);
  }
}