import { createClient } from 'redis';

const host = Deno.env.get('host');
const port = Deno.env.get('port');
const password = Deno.env.get('password');

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