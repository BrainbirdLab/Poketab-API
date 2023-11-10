var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { redis } from "./database.js";
export function keyGenerator() {
    return __awaiter(this, void 0, void 0, function* () {
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
        const keyExists = yield redis.exists(key);
        if (keyExists) {
            return keyGenerator();
        }
        return key;
    });
}
