import { redis } from "../db/database.ts";

export async function getRandomKey() {

    const key = makeKey();
    //check if key exists
    const keyExists = await redis.exists(`chat:${key}`);

    if (keyExists) {
        return getRandomKey();
    }
    return key;
}

export function makeKey() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
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
    return key;
}