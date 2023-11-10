var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import http from 'http';
import { Server } from 'socket.io';
import { instrument } from '@socket.io/admin-ui';
import { keyGenerator } from './keyGen.js';
import { redis } from './database.js';
import { validateAvatar, validateKey, validateUserName } from './utils.js';
export const httpServer = http.createServer();
//this will only serve websocket connections and not http requests
const io = new Server(httpServer, {
    cors: {
        origin: ['http://localhost:5173', 'http://localhost:5174', 'https://admin.socket.io'],
        credentials: true
    }
});
instrument(io, {
    auth: false,
});
io.on('connection', (socket) => {
    console.log('Socket Connected');
    socket.on('fetchKeyData', (key, callback) => __awaiter(void 0, void 0, void 0, function* () {
        console.log('fetchKeyData for key: ', key);
        if (!validateKey(key)) {
            callback({ success: false, message: 'Invalid Key', statusCode: 400, icon: 'fa-solid fa-triangle-exclamation', users: {}, maxUsers: null });
            return;
        }
        console.log('Searching database...');
        try {
            const exists = yield redis.exists(`chat:${key}`);
            if (!exists) {
                console.log('Key Does Not Exist');
                callback({ success: false, message: 'Key Does Not Exist', statusCode: 404, icon: 'fa-solid fa-ghost', users: {}, maxUsers: null });
                return;
            }
            const { activeUsers, maxUsers, users } = yield redis.json.get(`chat:${key}`, { path: ["activeUsers", "maxUsers", "users"] });
            console.log('maxUsers: ', maxUsers);
            console.log('activeUsers: ', activeUsers);
            if (activeUsers >= maxUsers) {
                callback({ success: false, message: 'Key Full', statusCode: 401, icon: 'fa-solid fa-door-closed', users: {}, maxUsers: null });
                return;
            }
            socket.join(`waitingRoom:${key}`);
            callback({ success: true, message: 'Key Data Found', statusCode: 200, icon: '', users: Object.assign({}, users), maxUsers: maxUsers });
        }
        catch (error) {
            console.error(error);
            callback({ success: false, message: 'Server Error', statusCode: 500, icon: 'fa-solid fa-triangle-exclamation', users: {}, maxUsers: null });
        }
    }));
    socket.on('createChat', (name, avatar, maxUsers, callback) => __awaiter(void 0, void 0, void 0, function* () {
        console.log('createChat', name, avatar, maxUsers);
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
            const key = yield keyGenerator();
            const user = {
                name: name,
                avatar,
                uid,
                joined: Date.now(),
            };
            const chatKey = {
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
            yield Promise.all([
                redis.json.set(`chat:${key}`, '.', chatKey),
                redis.json.set(`socket:${socket.id}`, '.', { name, uid }),
            ]);
            callback({ success: true, message: 'Chat Created', key, userId: uid, maxUsers: maxUsers });
            //get name, avatar, and id of all users in the room
            const me = {
                name,
                avatar,
                uid,
            };
            console.log('Chat Created');
            io.to(`chat:${key}`).emit('updateUserList', { [uid]: me });
            console.log(`sent update user list to ${key}. users count: 1`);
            io.to(`waitingRoom:${key}`).emit('updateUserList', { uid: me });
            socket.on('disconnect', () => __awaiter(void 0, void 0, void 0, function* () {
                console.log(`Chat Socket ${socket.id} Disconnected`);
                yield exitSocket(socket, key);
            }));
            socket.on('leaveChat', (callback) => __awaiter(void 0, void 0, void 0, function* () {
                yield exitSocket(socket, key);
                console.log('Chat Left');
                callback();
            }));
        }
        catch (error) {
            console.error(error);
            callback({ success: false, message: 'Chat Creation Failed', icon: 'fa-solid fa-triangle-exclamation' });
        }
    }));
    socket.on('joinChat', (key, name, avatar, callback) => __awaiter(void 0, void 0, void 0, function* () {
        console.log('joinChat', key, name, avatar);
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
            if (yield redis.exists(`chat:${key}`)) {
                //retrive .activeUsers, .maxUsers, and .users from redis in one call
                const redisData = yield redis.json.get(`chat:${key}`, { path: ["activeUsers", "maxUsers", "users"] });
                console.log('redisData: ', redisData);
                if (redisData) {
                    const { activeUsers, maxUsers, users } = redisData;
                    if (activeUsers >= maxUsers) {
                        callback({ success: false, message: 'Chat Full', icon: 'fa-solid fa-door-closed' });
                        return;
                    }
                    const uid = crypto.randomUUID();
                    const me = {
                        name: name,
                        avatar,
                        uid,
                        joined: Date.now(),
                    };
                    socket.join(`chat:${key}`);
                    socket.leave(`waitingRoom-${key}`);
                    yield Promise.all([
                        redis.json.set(`chat:${key}`, `.users.${uid}`, me),
                        redis.json.set(`socket:${socket.id}`, '.', { name, uid }),
                        //redis.json.set(key, '.activeUsers', activeUsers + 1),
                        redis.json.numIncrBy(`chat:${key}`, '.activeUsers', 1),
                    ]);
                    callback({ success: true, message: 'Chat Joined', key, userId: uid, maxUsers: maxUsers });
                    console.log('Chat Joined');
                    //log the connected users on that room
                    io.to(`chat:${key}`).emit('updateUserList', Object.assign(Object.assign({}, users), { [uid]: me }));
                    console.log(`sent update user list to ${key}. users count: ${activeUsers + 1}`);
                    io.to(`waitingRoom-${key}`).emit('updateUserList', Object.assign(Object.assign({}, users), { [uid]: me }));
                    socket.on('disconnect', () => __awaiter(void 0, void 0, void 0, function* () {
                        console.log(`Chat Socket ${socket.id} Disconnected`);
                        yield exitSocket(socket, key);
                    }));
                    socket.on('leaveChat', (callback) => __awaiter(void 0, void 0, void 0, function* () {
                        yield exitSocket(socket, key);
                        console.log('Chat Left');
                        callback();
                    }));
                }
                else {
                    // Handle the case where the data doesn't exist or is null.
                    callback({ success: false, message: 'Key Data Not Found', icon: 'fa-solid fa-ghost' });
                }
            }
            else {
                callback({ success: false, message: 'Key Does Not Exist', icon: 'fa-solid fa-ghost' });
                return;
            }
        }
        catch (error) {
            console.error(error);
            callback({ success: false, message: 'Chat Join Failed' });
        }
    }));
    socket.on('newMessage', (message, callback) => {
        //send message to all users in the room except the sender
        const messageId = crypto.randomUUID();
        //broadcast the message
        socket.broadcast.emit('newMessage', message, messageId);
        callback(messageId);
    });
});
function exitSocket(socket, key) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            socket.leave(`waitingRoom-${key}`);
            socket.leave(`chat:${key}`);
            //if socket not exists in redis, return
            if (!(yield redis.exists(`socket:${socket.id}`))) {
                console.log('Socket no longer exists in database');
                return;
            }
            //get uid from redis
            const { name, uid } = yield redis.json.get(`socket:${socket.id}`);
            //remove user from redis
            yield Promise.all([
                redis.json.del(`socket:${socket.id}`),
                redis.json.del(`chat:${key}`, `.users.${uid}`),
                //redis.json.set(key, '.activeUsers', activeUsers - 1),
                redis.json.numIncrBy(`chat:${key}`, '.activeUsers', -1),
            ]);
            console.log(`User ${name} left ${key}`);
            const { activeUsers, maxUsers } = yield redis.json.get(`chat:${key}`, { path: ["activeUsers", "maxUsers"] });
            if (activeUsers == null || maxUsers == null) {
                console.log('Invalid key');
                return;
            }
            if (activeUsers <= 0) {
                //delete key from redis
                yield redis.del(`chat:${key}`);
                console.log('Key deleted');
            }
            else {
                //get users from redis
                const users = yield redis.json.get(`chat:${key}`, { path: ["users"] });
                io.to(`chat:${key}`).emit('updateUserList', users);
                console.log(`sent update user list to ${key}. users count: ${activeUsers}`);
                io.to(`waitingRoom-${key}`).emit('updateUserList', users);
            }
        }
        catch (error) {
            console.error(error);
        }
    });
}
