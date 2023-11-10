export type User = {
	name: string;
	avatar: string;
	uid: string;
	joined: number;
}

export type Key = {
	users: {[key: string]: User};
	activeUsers: number;
	maxUsers: number;
	admin: string | null;
	created: number;
	keyName: string;
}