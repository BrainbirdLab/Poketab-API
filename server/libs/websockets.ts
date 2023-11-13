import http from 'node:http';
import { Server, Socket } from 'npm:socket.io';
import { instrument } from 'npm:@socket.io/admin-ui';
import { keyGenerator } from './keyGen.ts';
import { Key, User } from './schema.ts';
import { redis } from './database.ts';
import { validateAvatar, validateKey, validateUserName } from './utils.ts';
import "https://deno.land/x/dotenv/load.ts";

export const httpServer = http.createServer();

//this will only serve websocket connections and not http requests

const {clienturl} = Deno.env.toObject();

const io = new Server(httpServer, {
  cors: {
    origin: [clienturl, 'https://admin.socket.io'],
    credentials: true
  }
});

instrument(io, {
  auth: false,
});

io.on('connection', (socket) => {

  console.log('Socket Connected');

  socket.on('fetchKeyData', async (key: string, callback) => {
    console.log(redis.isReady);
    if (!redis.isReady){
      console.log('Redis not connected');
      callback({success: false, message: 'Database disconnected', statusCode: 502, icon: 'fa-solid fa-triangle-exclamation', users: {}, maxUsers: null})
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

      const {activeUsers, maxUsers, users}: Key = await redis.json.get(`chat:${key}`, {path: ["activeUsers", "maxUsers", "users"]}) as Key;

      console.log('maxUsers: ', maxUsers);
      console.log('activeUsers: ', activeUsers);

      if (activeUsers >= maxUsers) {
        callback({ success: false, message: 'Key Full', statusCode: 401, icon: 'fa-solid fa-door-closed', users: {}, maxUsers: null });
        return;
      }

      socket.join(`waitingRoom:${key}`);

      callback({ success: true, message: 'Key Data Found', statusCode: 200, icon: '', users: {...users}, maxUsers: maxUsers });
    } catch (error) {
      console.error(error);
      callback({ success: false, message: 'Server Error', statusCode: 500, icon: 'fa-solid fa-triangle-exclamation', users: {}, maxUsers: null });
    }
  });

  socket.on('createChat', async (name: string, avatar: string, maxUsers: number, callback) => {

    console.log('createChat', name, avatar, maxUsers);

    if (!redis.isReady){
      callback({success: false, message: 'Database disconnected', statusCode: 502, icon: 'fa-solid fa-triangle-exclamation', users: {}, maxUsers: null})
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
      const key = await keyGenerator();

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
        keyName: key,
      };

      socket.join(`chat:${key}`);
      socket.leave(`waitingRoom:${key}`);

      await Promise.all([
        redis.json.set(`chat:${key}`, '.', chatKey),
        redis.json.set(`socket:${socket.id}`, '.', {name, uid}),
      ]);

      callback({ success: true, message: 'Chat Created', key, userId: uid, maxUsers: maxUsers });

      //get name, avatar, and id of all users in the room
      const me = {
        name,
        avatar,
        uid,
      };

      console.log('Chat Created');
      io.to(`chat:${key}`).emit('updateUserList', {[uid]: me});
      console.log(`sent update user list to ${key}. users count: 1`);
      io.to(`waitingRoom:${key}`).emit('updateUserList', {uid: me});

      
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

  socket.on('joinChat', async (key: string, name: string, avatar: string, callback) => {
    console.log('joinChat', key, name, avatar);

    if (!redis.isReady){
      callback({success: false, message: 'Database disconnected', statusCode: 502, icon: 'fa-solid fa-triangle-exclamation', users: {}, maxUsers: null})
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

        //retrive .activeUsers, .maxUsers, and .users from redis in one call
        const redisData = await redis.json.get(`chat:${key}`, {path: ["activeUsers", "maxUsers", "users"]}) as Key;
        console.log('redisData: ', redisData);
        if (redisData) {
          const { activeUsers, maxUsers, users } = redisData as Key;

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
          socket.leave(`waitingRoom-${key}`);
  
          await Promise.all([
            redis.json.set(`chat:${key}`, `.users.${uid}`, me),
            redis.json.set(`socket:${socket.id}`, '.', {name, uid}),
            //redis.json.set(key, '.activeUsers', activeUsers + 1),
            redis.json.numIncrBy(`chat:${key}`, '.activeUsers', 1),
          ]);

          callback({ success: true, message: 'Chat Joined', key, userId: uid, maxUsers: maxUsers });


          console.log('Chat Joined');

          //log the connected users on that room
          io.to(`chat:${key}`).emit('updateUserList', {...users, [uid]: me});
          console.log(`sent update user list to ${key}. users count: ${activeUsers + 1}`);
          io.to(`waitingRoom-${key}`).emit('updateUserList', {...users, [uid]: me});
        
        
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

  socket.on('newMessage', (message, callback) => {
    //send message to all users in the room except the sender
    const messageId = crypto.randomUUID();
    //broadcast the message
    socket.broadcast.emit('newMessage', message, messageId);
    callback(messageId);
  });
});


async function exitSocket(socket: Socket, key: string){
  
  try{
    
    socket.leave(`waitingRoom-${key}`);
    socket.leave(`chat:${key}`);

    //if socket not exists in redis, return
    if (!await redis.exists(`socket:${socket.id}`)) {
      console.log('Socket no longer exists in database');
      return;
    }
    //get uid from redis
    const {name, uid} = await redis.json.get(`socket:${socket.id}`) as {key: string, name: string, uid: string};
    
    //remove user from redis
    await Promise.all([
      redis.json.del(`socket:${socket.id}`),
      redis.json.del(`chat:${key}`, `.users.${uid}`),
      //redis.json.set(key, '.activeUsers', activeUsers - 1),
      redis.json.numIncrBy(`chat:${key}`, '.activeUsers', -1),
    ]);
  
    console.log(`User ${name} left ${key}`);
  
    const {activeUsers, maxUsers} = await redis.json.get(`chat:${key}`, {path: ["activeUsers", "maxUsers"]}) as Key;
  
    if (activeUsers == null || maxUsers == null) {
      console.log('Invalid key');
      return;
    }
  
    if (activeUsers <= 0) {
      //delete key from redis
      await redis.del(`chat:${key}`);
      console.log('Key deleted');
    } else {
      //get users from redis
      const users = await redis.json.get(`chat:${key}`, {path: ["users"]}) as {[key: string]: User};

      io.to(`chat:${key}`).emit('updateUserList', users);
      console.log(`sent update user list to ${key}. users count: ${activeUsers}`);
      io.to(`waitingRoom-${key}`).emit('updateUserList', users);
    }
  } catch (error) {
    console.error(error);
  }
}