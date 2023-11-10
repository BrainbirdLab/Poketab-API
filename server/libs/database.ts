import { createClient } from 'redis';

export const redis = createClient({
    password: 'vRFKwyYjKAyT3JlHjOvRj1tzGkFKYsnR',
    socket: {
        host: 'redis-10025.c282.east-us-mz.azure.cloud.redislabs.com',
        port: 10025
    }
});

redis.connect();

//clear redis
redis.flushAll();

import { type Key } from './schema';

try{

    redis.on('connect', async () => {
        console.log('Redis Connected');
        /*
        redis.json.set("chat:12345", ".", {
            "users": {
                "123-456": {
                    "name": "Alex",
                    "avatar": "mew",
                    "uid": "abc-def",
                    "socketId": "socket-123",
                    "joined": 1626240000000
                },
                "123-457": {
                    "name": "Kyra",
                    "avatar": "pikachu",
                    "uid": "acd-def",
                    "socketId": "socket-124",
                    "joined": 1626240000000
                },
                "123-458": {
                    "name": "Kai",
                    "avatar": "bulbasaur",
                    "uid": "abe-def",
                    "socketId": "socket-125",
                    "joined": 1626240000000
                }
            },
            "activeUsers": 1,
            "maxUsers": 2,
            "admin": "1",
            "created": 1626240000000,
            "keyName": "12345"
        });

        redis.json.set("chat:12346", ".", {
            "users": {
                "234-456": {
                    "name": "Wayne",
                    "avatar": "raichu",
                    "uid": "sbc-def",
                    "socketId": "socket-001",
                    "joined": 1626240000000
                },
                "234-457": {
                    "name": "Hannah",
                    "avatar": "charmander",
                    "uid": "sbd-pqf",
                    "socketId": "socket-002",
                    "joined": 1626240000000
                }
            },
            "activeUsers": 1,
            "maxUsers": 2,
            "admin": "1",
            "created": 1626240000000,
            "keyName": "12346"
        });

        const {activeUsers, maxUsers, users} = await redis.json.get("chat:12345", {
            path: ["activeUsers", "maxUsers", "users"]
          }) as Key;
          
        console.log(activeUsers, maxUsers, users);
        */
    });
    
    redis.on('error', (error) => {
        console.log('Redis Error', error);
    });
    
    redis.on('ready', () => {
        console.log('Redis Ready');
    });
    
    redis.on('end', () => {
        console.log('Redis End');
    });
    
    redis.on('warning', (warning) => {
        console.log('Redis Warning', warning);
    });
    
    redis.on('reconnecting', () => {
        console.log('Redis Reconnecting');
    });
} catch (error) {
    console.error(error);
}