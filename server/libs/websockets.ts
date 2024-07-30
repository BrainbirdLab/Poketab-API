//external modules
import { Server, createRedisAdapter, createRedisClient, type Socket } from "https://deno.land/x/socket_io@0.2.0/mod.ts";
import "https://deno.land/x/dotenv@v3.2.2/load.ts";

//internal modules
import { getRandomKey } from './keyGen.ts';
import { redis, Key, User, _R_getAllUsersData, _R_exitUserFromSocket, _R_deleteChatKey, _R_joinChat } from '../db/database.ts';
import { validatename, validateKey } from './utils.ts';

//get client url from .env file which will be set to CORS
const { clienturl, host, port, password } = Deno.env.toObject();

const [pubClient, subClient] = await Promise.all([
  createRedisClient({
    hostname: host,
    port: parseInt(port),
    password,
  }),
  createRedisClient({
    hostname: host,
    port: parseInt(port),
    password,
  }),
]);

pubClient.hset('server', 'status', 'online');

//initialize socket.io server
export const io = new Server({
  cors: {
    origin: [clienturl],
    methods: ["GET", "POST"],
    credentials: true
  },
  adapter: createRedisAdapter(pubClient, subClient),
});

console.log('Socket.io server initialized');

//listen for connection
io.on('connection', (socket) => {

  socket.on('fetchKeyData', async (key: string, ssr: boolean, callback: (data: object | null) => void) => {

    try {
      if (!redis.isConnected) {
        console.log('Redis not connected');
        redis.connect();
        callback({ success: false, message: 'Database disconnected', statusCode: 502, icon: 'fa-solid fa-triangle-exclamation', users: {}, maxUsers: null })
        return;
      }

      if (!validateKey(key)) {
        callback({ success: false, message: 'Invalid Key', statusCode: 400, icon: 'fa-solid fa-triangle-exclamation', users: {}, maxUsers: null });
        return;
      }

      const exists = await redis.exists(`chat:${key}`);

      if (!exists) {
        callback({ success: false, message: 'Key Does Not Exist', statusCode: 404, icon: 'fa-solid fa-ghost', users: {}, maxUsers: null });
        return;
      }

      const keyData = await redis.hmget(`chat:${key}`, 'activeUsers', 'maxUsers');

      if (!keyData) {
        callback({ success: false, message: 'Key Data Not Found', statusCode: 404, icon: 'fa-solid fa-ghost', users: {}, maxUsers: null });
        return;
      }

      const activeUsers = parseInt(keyData[0] as string);
      const maxUsers = parseInt(keyData[1] as string);

      if (activeUsers >= maxUsers) {
        callback({ success: false, message: 'Key Full', statusCode: 401, icon: 'fa-solid fa-door-closed', users: {}, maxUsers: null });
        return;
      }

      const users = await _R_getAllUsersData(key);

      if (!ssr) {
        socket.join(`waitingRoom:${key}`);
        console.log(socket.id, 'joined waiting room for key: ', key);
      }

      callback({ success: true, message: 'Available', statusCode: 200, icon: '', users: { ...users }, maxUsers: maxUsers });
    } catch (error) {
      console.error(error);
      callback({ success: false, message: 'Server Error', statusCode: 500, icon: 'fa-solid fa-triangle-exclamation', users: {}, maxUsers: null });
    }
  });


  socket.on('createChat', async (avatar: string, maxUsers: number, publicKey: string, callback: (data: object | null) => void) => {

    try {

      if (!redis.isConnected) {
        callback({ success: false, message: 'Database disconnected', statusCode: 502, icon: 'fa-solid fa-triangle-exclamation', users: {}, maxUsers: null })
        //try to reconnect
        redis.connect();
        return;
      }

      if (!validatename(avatar)) {
        callback({ success: false, message: 'Invalid avatar', icon: 'fa-solid fa-triangle-exclamation' });
        return;
      }

      if (maxUsers < 2 || maxUsers > 10) {
        callback({ success: false, message: 'Invalid Max Users', icon: 'fa-solid fa-triangle-exclamation' });
        return;
      }

      const uid = socket.id;
      const key = await getRandomKey();

      socket.join(`chat:${key}`);
      socket.leave(`waitingRoom:${key}`);

      const chatKey: Key = {
        keyId: key,
        activeUsers: 1,
        maxUsers,
        admin: uid,
        createdAt: Date.now(),
      }

      const user: User = {
        avatar,
        uid,
        publicKey,
        joinedAt: Date.now(),
      }

      await _R_joinChat(true, chatKey, user);

      callback({ success: true, message: 'Chat Created', key, userId: uid, maxUsers: maxUsers, user: user });

      //get avatar, and id of all users in the room
      //omit the joinedAt and public key
      const dataForWaitingRoom = { [uid]: { avatar } };
      io.in(`waitingRoom:${key}`).emit('updateUserListWR', dataForWaitingRoom);

      socket.on('disconnect', async () => {
        console.log(`Chat Socket ${socket.id} Disconnected`);
        await exitSocket(socket, key);
      });

      socket.on('leaveChat', (destroy: boolean) => exitHandler(destroy, key, socket));

    } catch (error) {
      console.error(error);
      callback({ success: false, message: 'Chat Creation Failed', icon: 'fa-solid fa-triangle-exclamation' });
    }
  });

  socket.on('joinChat', async (key: string, avatar: string, publicKey: string, callback: (data: object | null) => void) => {
    try {

      console.log('joinChat requested');

      if (!redis.isConnected) {
        callback({ success: false, message: 'Database disconnected', statusCode: 502, icon: 'fa-solid fa-triangle-exclamation' })
        //try to reconnect
        redis.connect();
        return;
      }

      if (!validateKey(key)) {
        callback({ success: false, message: 'Invalid Key', icon: 'fa-solid fa-triangle-exclamation' });
        return;
      }

      if (!validatename(avatar)) {
        callback({ success: false, message: 'Invalid avatar', icon: 'fa-solid fa-triangle-exclamation' });
        return;
      }

      if (await redis.exists(`chat:${key}`)) {

        const keyData = await redis.hmget(`chat:${key}`, 'activeUsers', 'maxUsers', 'admin');

        if (keyData) {

          const activeUsers = parseInt(keyData[0] as string);
          const maxUsers = parseInt(keyData[1] as string);
          const admin = keyData[2] as string;

          if (activeUsers >= maxUsers) {
            callback({ success: false, message: 'Chat Full', icon: 'fa-solid fa-door-closed' });
            return;
          }

          const uid = socket.id;

          const me: User = {
            avatar,
            uid,
            publicKey,
            joinedAt: Date.now(),
          };

          socket.join(`chat:${key}`);
          socket.leave(`waitingRoom:${key}`);

          await _R_joinChat(false, { keyId: key }, me);

          // 'avatar', 'key', 'publicKey' are stored in redis
          let users: { [key: string]: Omit<User, 'joined'> } = {}; //omit the joined property

          users = await _R_getAllUsersData(key) as { [key: string]: Omit<User, 'joined'> };

          console.log('Users in room: ', users);

          callback({ success: true, message: 'Chat Joined', userId: uid, admin: admin, maxUsers: maxUsers, users });

          //sent the users detail to the waiting room but exclude public key and joinedAt
          const dataForWaitingRoom = Object.keys(users).reduce((acc, curr) => {
            const { avatar } = users[curr];
            acc[curr] = { avatar };
            return acc;
          }, {} as { [key: string]: { avatar: string } });

          dataForWaitingRoom[uid] = { avatar };
          
          io.in(`waitingRoom:${key}`).emit('updateUserListWR', dataForWaitingRoom);
          socket.in(`chat:${key}`).emit('newUser', { avatar, uid, publicKey });
          socket.on('disconnect', async () => {
            console.log(`Chat Socket ${socket.id} Disconnected`);
            await exitSocket(socket, key);
          });

          socket.on('leaveChat', (destroy: boolean) => exitHandler(destroy, key, socket));

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

  socket.on('newMessage', (message, key: string, smKeys: {[key: string]: ArrayBuffer}, callback: (data: string | null) => void) => {

    const messageId = crypto.randomUUID();
    //get all users in the room by the socket and room name (key)
    io.in(`chat:${key}`).fetchSockets().then((sockets) => {
      sockets.forEach((soc) => {
        if (soc.id !== socket.id) {
          const smKey = smKeys[soc.id];
          soc.emit('newMessage', message, smKey, messageId);
        }
      });
    });

    callback(messageId);
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

async function exitHandler(destroy: boolean, key: string, socket: Socket) {

  try {
    if (destroy) {

      //delete the chat and empty the room only if the user is the admin
      if (await redis.hget(`chat:${key}`, 'admin') !== socket.id) {
        console.log('Not an admin');
        return;
      }

      await _R_deleteChatKey(key, socket.id);
      io.in(`chat:${key}`).emit('selfDestruct', 'Chat destroyed🥺');
      io.in(`waitingRoom:${key}`).emit('updateUserListWR', {});
      //empty the chat room
      socket.rooms.delete(`chat:${key}`);
      socket.rooms.delete(`waitingRoom:${key}`);
    } else {
      await exitSocket(socket, key);
      socket.emit('selfDestruct', 'You left the chat🥺');
    }
  } catch (error) {
    console.error(error);
  }
}

async function exitSocket(socket: Socket, key: string) {

  try {
    socket.leave(`waitingRoom:${key}`);
    socket.leave(`chat:${key}`);

    //if socket not exists in redis, return
    if (!await redis.exists(`uid:${socket.id}`)) {
      return;
    }
    //get uid from redis
    let data = await redis.hmget(`uid:${socket.id}`, 'avatar', 'uid');

    if (!data) {
      return;
    }

    const [avatar] = data as [string, string];

    await _R_exitUserFromSocket(key, socket.id);

    console.log(`User ${avatar} left ${key}`);

    socket.in(`chat:${key}`).emit('userLeft', socket.id);

    data = await redis.hmget(`chat:${key}`, 'activeUsers');

    const [activeUsers] = data as unknown as [number];

    if (activeUsers < 1) {

      //if folder exists,
      Deno.stat('./uploads/' + key)
      .then((info) => {

        if (info.isDirectory) {
          Deno.remove('./uploads/' + key, { recursive: true }).then(() => {
            console.log('Deleted folder', key);
          }).catch((err) => {
            console.log(`Unable to delete folder ${key}. Reason: ${err}`);
          });
        }

      })
      .catch(() => {
        console.log('No folder found to clean for key: ', key);
      });

      await _R_deleteChatKey(key, socket.id);
      io.in(`waitingRoom:${key}`).emit('updateUserListWR', {});

      return;
    } else {
      const users = await _R_getAllUsersData(key) as { [key: string]: Omit<User, 'joined'> };
      io.in(`waitingRoom:${key}`).emit('updateUserListWR', users);
    }
  } catch (error) {
    console.error(error);
  }
}