var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { createClient } from 'redis';
//use dotenv to get environment variables
import dotenv from 'dotenv';
dotenv.config();
const { host, password, port } = process.env;
export const redis = createClient({
    password: password,
    socket: {
        host: host,
        port: Number(port)
    }
});
redis.connect();
//clear redis
redis.flushAll();
try {
    redis.on('connect', () => __awaiter(void 0, void 0, void 0, function* () {
        console.log('Redis Connected');
    }));
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
}
catch (error) {
    console.error(error);
}
