export class User {
    constructor(username, uid, avatar) {
        this.username = username;
        this.avatar = avatar;
        this.uid = uid;
        this.socketId = '';
        this.joined = Date.now();
    }
}
export class Key {
    constructor(key) {
        this.activeUsers = 0;
        this.maxUser = 2;
        this.created = Date.now();
        this.keyName = key;
        this.users = {};
        this.admin = null;
    }
    __addUser(user) {
        if (!this.users[user.uid]) {
            if (this.activeUsers === this.maxUser) {
                //console.log(`Key: ${this.key} is full`);
                return;
            }
            if (this.activeUsers === 0) {
                this.admin = user.uid;
            }
            this.users[user.uid] = user;
            this.activeUsers++;
            //console.log(`User added to key: ${this.key}`);
        }
        //console.log(`User count: ${this.userCount} | Admin: ${this.admin} | Key: ${this.key} | Max User: ${this.maxUser}`);
    }
    removeUser(uid) {
        delete this.users[uid];
        this.activeUsers > 0 ? this.activeUsers-- : this.activeUsers = 0;
        //console.log(`User removed from key: ${this.key}`);
        //console.log(`User count: ${this.userCount}`);
    }
    getUser(uid) {
        return this.users[uid];
    }
    getUsers() {
        return this.users;
    }
    getUserList() {
        const users = Object.values(this.users);
        return users;
    }
    hasUser(uid) {
        return this.users[uid] !== null;
    }
    isEmpty() {
        return this.activeUsers === 0;
    }
    isFull() {
        return this.activeUsers >= this.maxUser;
    }
    getAvatarList() {
        const users = this.getUserList();
        const avatarArray = users.map((user) => user.avatar);
        return avatarArray;
    }
}
