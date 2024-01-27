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
await redis.sendCommand('FLUSHALL');

console.log('Redis connected');

export type User = {
	name: string;
	avatar: string;
	uid: string;
	joined: number;
}

export type SharedFile = {
	originalName: string;
	sendBy: string; // User who sent the file
	recievedBy: string[]; // Users who has downloaded the file
}

export type Key = {
	//users: { [key: string]: User };
	activeUsers: number;
	maxUsers: number;
	admin: string | null;
	created: number;
	// Shared files
	//files: { [id: string]: SharedFile };
}