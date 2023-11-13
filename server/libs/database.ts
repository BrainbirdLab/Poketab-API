import { createClient } from 'npm:redis';
import 'https://deno.land/x/dotenv/load.ts';

const {password, host, port} = Deno.env.toObject();

console.log('Cred: ', password, host, port);

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