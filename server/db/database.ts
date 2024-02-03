import { connect } from "https://deno.land/x/redis@v0.32.1/mod.ts";
import "https://deno.land/x/dotenv@v3.2.2/load.ts";

const { host, password, port } = Deno.env.toObject();

console.log('Connecting to Redis');

export const redis = await connect({
	hostname: host,
	port: +port,
	password: password,
	maxRetryCount: 5,
});

//delete all keys
await redis.flushdb();

//delete all scripts
await redis.scriptFlush();

console.log('Redis connected');

export type User = {
	name: string;
	avatar: string;
	uid: string;
	joinedAt: number;
};

export type Key = {
	//users: { [key: string]: User };
	keyId: string;
	activeUsers?: number;
	maxUsers?: number;
	admin?: string | null;
	createdAt?: number;
	// Shared files
	//files: { [id: string]: SharedFile };
};

//load lua scripts
const getAllUsersDataScript = await Deno.readTextFile('server/db/lua/getAllUsersData.lua');
const deleteChatScript = await Deno.readTextFile('server/db/lua/deleteKey.lua');
const exitSocketScript = await Deno.readTextFile('server/db/lua/exitSocket.lua');
const joinChatScript = await Deno.readTextFile('server/db/lua/joinChat.lua');

console.log('Lua scripts loaded');

const SHA_GET_USERS = await redis.scriptLoad(getAllUsersDataScript);
const SHA_DELETE_CHAT = await redis.scriptLoad(deleteChatScript);
const SHA_EXIT_SOCKET = await redis.scriptLoad(exitSocketScript);
const joinChatScriptSHA = await redis.scriptLoad(joinChatScript);

export async function _R_getAllUsersData(key: string){
	try{
		const result = await redis.evalsha(SHA_GET_USERS, [], [key]) as string;
		return JSON.parse(result);
	} catch (err){
		console.error(err);
		return {};
	}
}

export async function _R_deleteChatKey(key: string, socketid: string){
	try{
		await redis.evalsha(SHA_DELETE_CHAT, [], [key, socketid]);
	} catch (err){
		console.error(err);
	}
}

export async function _R_exitUserFromSocket(key: string, uid: string, socketid: string){
	try{
		await redis.evalsha(SHA_EXIT_SOCKET, [], [key, uid, socketid]);
	} catch (err){
		console.error(err);
	}
}

export async function _R_joinChat(create: boolean, key: Key, user: User, socketid: string){
	try{
		await redis.evalsha(joinChatScriptSHA, [], [create ? 'true' : 'false', JSON.stringify({
			key: key,
			user: user,
			socket: socketid,
		})]);
	} catch (err){
		console.error(err);
	}
}
