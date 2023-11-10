import { redis } from "./database";
import { io } from "./websockets";
const authSocket = io.of('/auth');
authSocket.on('connection', (socket) => {
    console.log('Auth Socket Connected');
    socket.on('fetchKeyData', (key, callback) => {
        console.log('Searching database...');
        redis.exists(key).then((exists) => {
            if (exists) {
                redis.get(key).then((data) => {
                    if (!data) {
                        callback({ success: false, message: 'Key Data Not Found' });
                        return;
                    }
                    const _key = JSON.parse(data);
                    //get the usernames and avatars of all users in the key
                    const [usernames, avatars] = Object.values(_key.users).reduce((acc, user) => {
                        acc[0].push(user.username);
                        acc[1].push(user.avatar);
                        return acc;
                    }, [[], []]);
                    callback({ success: true, message: 'Key Data Found', usernames: usernames, avatars: avatars });
                }).catch((error) => {
                    console.log(error);
                    callback({ success: false, message: 'Key Data Not Found' });
                });
            }
            else {
                callback({ success: false, message: 'Key Data Not Found' });
            }
        });
    });
});
authSocket.on('disconnect', () => {
    console.log('Auth Socket Disconnected');
});
