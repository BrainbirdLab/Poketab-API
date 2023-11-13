import { redis } from "./database.ts";

export async function keyGenerator() {
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';

    for (let i = 0; i < 2; i++) {
        key += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    key += '-';
    for (let i = 0; i < 3; i++) {
        key += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    key += '-';
    for (let i = 0; i < 2; i++) {
        key += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    //check if key exists
    const keyExists = await redis.exists(key);
    if (keyExists) {
        return keyGenerator();
    }
    return key;
}