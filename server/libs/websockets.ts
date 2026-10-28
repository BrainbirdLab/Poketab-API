//external modules
import { Server, createRedisAdapter, createRedisClient, type Socket } from "https://deno.land/x/socket_io@0.2.1/mod.ts";
import "https://deno.land/x/dotenv@v3.2.2/load.ts";
import { encode as encodeBase64, decode as decodeBase64 } from "https://deno.land/std@0.150.0/encoding/base64.ts";

//internal modules
import { getRandomKey } from './keyGen.ts';
import { redis, redisOptions, Key, User, _R_getAllUsersData, _R_exitUserFromSocket, _R_deleteChatKey, _R_joinChat } from '../db/database.ts';
import { validatename, validateKey } from './utils.ts';

//get client url from .env file which will be set to CORS
const { clienturl } = Deno.env.toObject();

const [pubClient, subClient] = await Promise.all([
  createRedisClient(redisOptions),
  createRedisClient(redisOptions),
]);

pubClient.hset('server', 'status', 'online');

// deno-lint-ignore no-explicit-any
type Events = Record<string, (...args: any[]) => void>;
export type SocketData = { uid: string };
type ChatSocket = Socket<Events, Events, Events, SocketData>;

//initialize socket.io server
export const io = new Server<Events, Events, Events, SocketData>({
  cors: {
    origin: [clienturl],
    methods: ["GET", "POST"],
    credentials: true
  },
  adapter: createRedisAdapter(pubClient, subClient),
  //detect dead connections within ~15s (default ~45s) so the resume grace period starts soon after a real drop
  pingInterval: 10000,
  pingTimeout: 5000,
});

console.log('Socket.io server initialized');

try {

  
  //listen for connection
  // Resume runs in the handshake (auth: {key, uid, resumeToken}), before any packet the client buffered while offline,
  // so those packets already see the socket in its chat room.
  io.use(async (socket) => {
    try {
      const { key, uid, resumeToken } = socket.handshake.auth ?? {};
      //uid is public to room members, so resumeToken (sent only to its owner) proves identity
      if (typeof key === 'string' && typeof uid === 'string' && typeof resumeToken === 'string' && validateKey(key)
        && await redis.sismember(`chat:${key}:users`, uid)
        && await redis.hget(`uid:${uid}`, 'resumeToken') === resumeToken) {
        socket.data.uid = uid;
      }
    } catch (error) {
      //never block the connection: an unresumed socket still works as a fresh one
      console.error(error);
    }
  });

  io.on('connection', (socket) => {

    //uid is only set when the middleware validated handshake.auth
    if (socket.data.uid) {
      resumeSession(socket, socket.handshake.auth.key as string, socket.data.uid);
    } else if (socket.handshake.auth?.resumeToken) {
      socket.emit('resumeFailed', 'Session expired');
    }

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
  
        const uid = crypto.randomUUID();
        const key = await getRandomKey();

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
        const resumeToken = await startChatSession(socket, key, uid);

        callback({ success: true, message: 'Chat Created', key, userId: uid, resumeToken, maxUsers: maxUsers, user: user });
  
        //get avatar, and id of all users in the room
        //omit the joinedAt and public key
        const dataForWaitingRoom = { [uid]: { avatar } };
        io.in(`waitingRoom:${key}`).emit('updateUserListWR', dataForWaitingRoom);

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
  
            const uid = crypto.randomUUID();

            const me: User = {
              avatar,
              uid,
              publicKey,
              joinedAt: Date.now(),
            };

            await _R_joinChat(false, { keyId: key }, me);
            const resumeToken = await startChatSession(socket, key, uid);

            // 'avatar', 'key', 'publicKey' are stored in redis
            let users: { [key: string]: Omit<User, 'joined'> } = {}; //omit the joined property
  
            users = await _R_getAllUsersData(key) as { [key: string]: Omit<User, 'joined'> };
  
            callback({ success: true, message: 'Chat Joined', userId: uid, resumeToken, admin: admin, maxUsers: maxUsers, users });
  
            //sent the users detail to the waiting room but exclude public key and joinedAt
            const dataForWaitingRoom = Object.keys(users).reduce((acc, curr) => {
              const { avatar } = users[curr];
              acc[curr] = { avatar };
              return acc;
            }, {} as { [key: string]: { avatar: string } });
  
            dataForWaitingRoom[uid] = { avatar };
            
            io.in(`waitingRoom:${key}`).emit('updateUserListWR', dataForWaitingRoom);
            socket.in(`chat:${key}`).emit('newUser', { avatar, uid, publicKey });

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

    // Chat events below: only members in the room may send; identity comes from the socket, never the client-sent uid.
    socket.on('newMessage', (message, key: string, smKeys: {[key: string]: ArrayBuffer}, callback: (data: string | null) => void) => {
      if (!inRoom(socket, key)) {
        return callback(null);
      }
      const messageId = crypto.randomUUID();
      //get all users in the room by the socket and room name (key)
      io.in(`chat:${key}`).fetchSockets<SocketData>().then((sockets) => {
        try {
          sockets.forEach((soc) => {
            if (soc.data.uid !== socket.data.uid) {
              const smKey = smKeys[soc.data.uid];
              soc.emit('newMessage', message, smKey, messageId);
            }
          });
          recordRecent(key, socket.data.uid, (uid) => smKeys[uid] ? ['newMessage', message, smKeys[uid], messageId] : undefined).catch(console.error);
        } catch (error) {
          console.error('Error broadcasting message', error);
        }
      });
  
      callback(messageId);
    });

    //socket.emit('editMessage', encryptedMessage, chatRoomStore.value.Key, smKeys
    socket.on('editMessage', (message: string, key: string, smKeys: {[key: string]: ArrayBuffer}, callback: () => void) => {
      if (!inRoom(socket, key)) {
        return;
      }
      //everyone in room including sender
      io.in(`chat:${key}`).fetchSockets<SocketData>().then((sockets) => {
        try {
          sockets.forEach((soc) => {
            if (soc.data.uid !== socket.data.uid) {
              const smKey = smKeys[soc.data.uid];
              soc.emit('editMessage', message, smKey);
            }
          });
          recordRecent(key, socket.data.uid, (uid) => smKeys[uid] ? ['editMessage', message, smKeys[uid]] : undefined).catch(console.error);
        } catch (error) {
          console.error('Error broadcasting edited message', error);
        }
      });
      callback();
    });


    socket.on('deleteMessage', (messageId: string, key: string) => {
      if (!inRoom(socket, key)) {
        return;
      }
      const userId = socket.data.uid;
      //send back to all users in the room including the sender
      io.in(`chat:${key}`).emit('deleteMessage', messageId, userId);
      recordRecent(key, userId, () => ['deleteMessage', messageId, userId]).catch(console.error);
    });

    socket.on('react', (messageId: string, key: string, _clientUid: string, react: string) => {
      if (!inRoom(socket, key)) {
        return;
      }
      //reactId lets clients skip a replayed react they already applied (reacts toggle)
      const reactId = crypto.randomUUID();
      //everyone in room including sender
      io.in(`chat:${key}`).emit('react', messageId, socket.data.uid, react, reactId);
      recordRecent(key, socket.data.uid, () => ['react', messageId, socket.data.uid, react, reactId]).catch(console.error);
    });
  
    socket.on('seen', (_clientUid: string, key: string, msgId: string) => {
      if (!inRoom(socket, key)) {
        return;
      }
      //broadcast
      socket.in(`chat:${key}`).emit('seen', socket.data.uid, msgId);
      //latest per user (not in the replay list: frequent, would push out messages); sent on resume
      redis.hset(`seen:${key}`, socket.data.uid, msgId).catch(console.error);
    });
  
    socket.on('typing', (_clientUid: string, key: string, event: string) => {
      if (!inRoom(socket, key)) {
        return;
      }
      //broadcast
      socket.in(`chat:${key}`).emit('typing', socket.data.uid, event);
    });
  
    socket.on('location', (position, key: string) => {
      if (!inRoom(socket, key)) {
        return;
      }
      const messageId = crypto.randomUUID();
      //everyone in room including sender
      io.in(`chat:${key}`).emit('location', position, messageId, socket.data.uid);
    });
  });
} catch (error) {
  console.error(error);
}

async function exitHandler(destroy: boolean, key: string, socket: ChatSocket, uid: string) {
  
  try {
    if (destroy) {

      //delete the chat and empty the room only if the user is the admin
      if (await redis.hget(`chat:${key}`, 'admin') !== uid) {
        console.log('Not an admin');
        return;
      }

      await _R_deleteChatKey(key, uid);
      io.in(`chat:${key}`).emit('selfDestruct', 'Chat destroyed🥺');
      io.in(`waitingRoom:${key}`).emit('updateUserListWR', {});
      //empty the chat room
      socket.rooms.delete(`chat:${key}`);
      socket.rooms.delete(`waitingRoom:${key}`);
    } else {
      socket.leave(`waitingRoom:${key}`);
      socket.leave(`chat:${key}`);
      await exitUser(key, uid);
      socket.emit('selfDestruct', 'You left the chat🥺');
    }
  } catch (error) {
    console.error(error);
  }
}

const GRACE_MS = 90_000;

//bindChatSession sets data.uid before joining the room, so a member always has a uid
function inRoom(socket: ChatSocket, key: string): socket is ChatSocket & { data: SocketData } {
  return socket.rooms.has(`chat:${key}`);
}

//rebinds a handshake-resumed socket, then sends the user list and the events it missed
async function resumeSession(socket: ChatSocket, key: string, uid: string) {
  bindChatSession(socket, key, uid);
  try {
    socket.emit('resumed', await _R_getAllUsersData(key));
    await replayRecent(socket, uid);
    const seen = await redis.hgetall(`seen:${key}`);
    for (let i = 0; i < seen.length; i += 2) {
      if (seen[i] !== uid) {
        socket.emit('seen', seen[i], seen[i + 1]);
      }
    }
  } catch (error) {
    console.error(error);
  }
}

function bindChatSession(socket: ChatSocket, key: string, uid: string) {
  socket.data.uid = uid;
  socket.join(`chat:${key}`);
  socket.leave(`waitingRoom:${key}`);
  socket.on('disconnect', () => markOffline(key, uid));
  socket.on('leaveChat', (destroy: boolean) => exitHandler(destroy, key, socket, uid));
}

async function startChatSession(socket: ChatSocket, key: string, uid: string) {
  const resumeToken = crypto.randomUUID();
  await redis.hset(`uid:${uid}`, 'resumeToken', resumeToken);
  bindChatSession(socket, key, uid);
  return resumeToken;
}

// Recent encrypted events per recipient in Redis list `recent:<uid>` (shared by all instances), replayed on resume (client skips duplicates).
// Kept for every member, not only known-offline ones: a dropped client's socket looks live until ping timeout.
const MAX_RECENT = 200;
type ReplayEvent = [string, ...unknown[]];

//encrypted payloads are binary and don't survive JSON: store them as base64
function packArg(arg: unknown) {
  if (arg instanceof ArrayBuffer) {
    return { b64: encodeBase64(arg) };
  }
  if (ArrayBuffer.isView(arg)) {
    //std encode accepts a Uint8Array at runtime
    return { b64: encodeBase64(new Uint8Array(arg.buffer, arg.byteOffset, arg.byteLength) as unknown as ArrayBuffer) };
  }
  return arg;
}

function unpackArg(arg: unknown) {
  return arg && typeof arg === 'object' && 'b64' in arg ? decodeBase64((arg as { b64: string }).b64) : arg;
}

// replay may repeat events the client already got: messages/reacts carry ids the client dedupes; edits/deletes are idempotent
async function recordRecent(key: string, senderUid: string | undefined, makeEvent: (uid: string) => ReplayEvent | undefined) {
  const at = Date.now();
  for (const uid of await redis.smembers(`chat:${key}:users`)) {
    const event = uid === senderUid ? undefined : makeEvent(uid);
    if (!event) {
      continue;
    }
    //one atomic script: deno redis pipeline/tx on the shared connection corrupts concurrent replies
    await redis.eval(
      "redis.call('rpush', KEYS[1], ARGV[1]); redis.call('ltrim', KEYS[1], -tonumber(ARGV[2]), -1); redis.call('pexpire', KEYS[1], ARGV[3])",
      [`recent:${uid}`],
      [JSON.stringify({ at, event: event.map(packArg) }), String(MAX_RECENT), String(GRACE_MS)],
    );
  }
}

async function replayRecent(socket: ChatSocket, uid: string) {
  //read and clear atomically so an event recorded meanwhile is not lost
  const recent = await redis.eval(
    "local l = redis.call('lrange', KEYS[1], 0, -1); redis.call('del', KEYS[1]); return l",
    [`recent:${uid}`],
    [],
  ) as string[];
  const cutoff = Date.now() - GRACE_MS;
  for (const raw of recent) {
    //payloads are client-supplied: one bad entry (e.g. invalid base64) must not stop the rest
    try {
      const { at, event } = JSON.parse(raw) as { at: number, event: ReplayEvent };
      if (at > cutoff) {
        socket.emit(...event.map(unpackArg) as ReplayEvent);
      }
    } catch (error) {
      console.error('Skipping bad replay event', error);
    }
  }
}

//true if uid has a connected socket in the chat (any instance)
async function isLive(key: string, uid: string) {
  const sockets = await io.in(`chat:${key}`).fetchSockets<SocketData>();
  return sockets.some((soc) => soc.data.uid === uid);
}

// keep user in chat for GRACE_MS so a dropped connection can `resume` with same uid
async function markOffline(key: string, uid: string) {
  try {
    //already left via leaveChat or chat destroyed, or already resumed (stale disconnect of old socket)
    if (!await redis.sismember(`chat:${key}:users`, uid) || await isLive(key, uid)) {
      return;
    }
    //token: only the latest disconnect of this uid may expire it
    const token = crypto.randomUUID();
    await redis.hset(`uid:${uid}`, 'offline', token);

    setTimeout(async () => {
      try {
        const current = await redis.hget(`uid:${uid}`, 'offline');
        //a newer disconnect owns the expiry, or user resumed
        if (current !== token || await isLive(key, uid)) {
          return;
        }
        await exitUser(key, uid);
      } catch (error) {
        console.error(error);
      }
    }, GRACE_MS);
  } catch (error) {
    console.error(error);
  }
}

// Boot: chats survive restarts so members can resume; give every member the grace period, then remove the absent ones.
// (Replaces flushing Redis on boot, which wiped every chat on every instance.)
export async function expireAbsentMembers() {
  let cursor = 0;
  do {
    const [next, usersKeys] = await redis.scan(cursor, { pattern: 'chat:*:users' });
    cursor = Number(next);
    for (const usersKey of usersKeys) {
      const key = usersKey.slice('chat:'.length, -':users'.length);
      for (const uid of await redis.smembers(usersKey)) {
        markOffline(key, uid);
      }
    }
  } while (cursor !== 0);
}

async function exitUser(key: string, uid: string) {

  try {
    //if user not exists in redis, return
    if (!await redis.exists(`uid:${uid}`)) {
      return;
    }
    const data = await redis.hmget(`uid:${uid}`, 'avatar', 'uid');

    if (!data) {
      return;
    }

    const [avatar] = data as [string, string];

    //another instance's timer (or the boot sweep) may have removed this user first;
    //activeUsers is the count after this removal, so only the last exit cleans up the chat
    const [removed, activeUsers] = await _R_exitUserFromSocket(key, uid) ?? [0, -1];
    if (!removed) {
      return;
    }

    console.log(`${avatar} left ${key}`);

    io.in(`chat:${key}`).emit('userLeft', uid);

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

      await _R_deleteChatKey(key, uid);
      io.in(`waitingRoom:${key}`).emit('updateUserListWR', {});

      console.log('Chat deleted on', key);

      return;
    } else {
      const users = await _R_getAllUsersData(key) as { [key: string]: Omit<User, 'joined'> };
      if (!users) {
        return;
      }
      io.in(`waitingRoom:${key}`).emit('updateUserListWR', users);
    }
  } catch (error) {
    console.error(error);
  }
}