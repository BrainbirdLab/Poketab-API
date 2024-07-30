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

//delete all scripts
await redis.scriptFlush();

console.log('Redis connected');

export type User = {
	avatar: string;
	uid: string;
	publicKey: string;
	joinedAt: number;
};

export type Key = {
	keyId: string;
	activeUsers?: number;
	maxUsers?: number;
	admin?: string | null;
	createdAt?: number;
};

//load lua scripts
const getAllUsersDataScript = await Deno.readTextFile('server/db/lua/getAllUsersData.lua');
const getAllUsersAvatarScript = await Deno.readTextFile('server/db/lua/getAllUsersAvatar.lua');
const deleteChatScript = await Deno.readTextFile('server/db/lua/deleteKey.lua');
const exitSocketScript = await Deno.readTextFile('server/db/lua/exitSocket.lua');
const joinChatScript = await Deno.readTextFile('server/db/lua/joinChat.lua');
const fileUploadAuthScript = await Deno.readTextFile('server/db/lua/fileUploadAuth.lua');


let SHA_GET_USERS: string;
let SHA_GET_ALL_USERS_AVATAR: string;
let SHA_DELETE_CHAT: string;
let SHA_EXIT_SOCKET: string;
let SHA_JOIN_CHAT: string;
let SHA_FILE_UPLOAD: string;

async function loadScripts(){
	SHA_GET_USERS = await redis.scriptLoad(getAllUsersDataScript);
	SHA_GET_ALL_USERS_AVATAR = await redis.scriptLoad(getAllUsersAvatarScript);
	SHA_DELETE_CHAT = await redis.scriptLoad(deleteChatScript);
	SHA_EXIT_SOCKET = await redis.scriptLoad(exitSocketScript);
	SHA_JOIN_CHAT = await redis.scriptLoad(joinChatScript);
	SHA_FILE_UPLOAD = await redis.scriptLoad(fileUploadAuthScript);
}

export async function _R_getAllUsersAvatar(key: string){
	try{

		//if sha is not available on redis, load it
		const exists = await redis.scriptExists(SHA_GET_ALL_USERS_AVATAR);

		if (!exists[0]){
			SHA_GET_ALL_USERS_AVATAR = await redis.scriptLoad(getAllUsersAvatarScript);
			console.log('Script re-loaded: getAllUsersAvatar.lua');
		}

		const result = await redis.evalsha(SHA_GET_ALL_USERS_AVATAR, [], [key]) as string;
		return JSON.parse(result);
	} catch (err){
		console.error(err);
		return {};
	}
}

export async function _R_getAllUsersData(key: string){
	try{

		//if sha is not available on redis, load it
		const exists = await redis.scriptExists(SHA_GET_USERS);

		if (!exists[0]){
			SHA_GET_USERS = await redis.scriptLoad(getAllUsersDataScript);
			console.log('Script re-loaded: getAllUsersData.lua');
		}

		const result = await redis.evalsha(SHA_GET_USERS, [], [key]) as string;
		return JSON.parse(result);
	} catch (err){
		console.error(err);
		return {};
	}
}

export async function _R_deleteChatKey(key: string, uid: string){
	try{
		//if sha is not available on redis, load it
		const exists = await redis.scriptExists(SHA_DELETE_CHAT);

		if (!exists[0]){
			SHA_DELETE_CHAT = await redis.scriptLoad(deleteChatScript);
			console.log('Script re-loaded: deleteKey.lua');
		}

		await redis.evalsha(SHA_DELETE_CHAT, [], [key, uid]);
	} catch (err){
		console.error(err);
	}
}

export async function _R_exitUserFromSocket(key: string, uid: string){
	try{

		//if sha is not available on redis, load it
		const exists = await redis.scriptExists(SHA_EXIT_SOCKET);

		if (!exists[0]){
			SHA_EXIT_SOCKET = await redis.scriptLoad(exitSocketScript);
			console.log('Script re-loaded: exitSocket.lua');
		}

		await redis.evalsha(SHA_EXIT_SOCKET, [], [key, uid]);
	} catch (err){
		console.error(err);
	}
}

export async function _R_joinChat(create: boolean, key: Key, user: User){
	try{
		//if sha is not available on redis, load it
		const exists = await redis.scriptExists(SHA_JOIN_CHAT);

		if (!exists[0]){
			SHA_JOIN_CHAT = await redis.scriptLoad(joinChatScript);
			console.log('Script re-loaded: joinChat.lua');
		}

		await redis.evalsha(SHA_JOIN_CHAT, [], [create ? 'true' : 'false', JSON.stringify({
			key: key,
			publicKey: user.publicKey,
			user: user,
			uid: user.uid,
			joined: user.joinedAt,
		})]);
	} catch (err){
		console.error(err);
	}
}

export async function _R_fileUploadAuth(key: string, uid: string){
	try{

		//if sha is not available on redis, load it
		const exists = await redis.scriptExists(SHA_FILE_UPLOAD);

		if (!exists[0]){
			SHA_FILE_UPLOAD = await redis.scriptLoad(fileUploadAuthScript);
			console.log('Script re-loaded: fileUploadAuth.lua');
		}

		const res = await redis.evalsha(SHA_FILE_UPLOAD, [], [key, uid]);
		return res;
	} catch (err){
		console.error(err);
	}
}

await loadScripts();