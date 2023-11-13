import { createClient } from 'npm:redis';
import { env } from "./config.ts";

const {password, host, port} = env;

export const redis = createClient({
    password: password,
    socket: {
        host: host,
        port: Number(port)
    }
});


try{
    redis.connect();

    //clear redis
    redis.flushAll();

    redis.on('connect', () => {
        console.log('Redis Connected');
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