import { assert, assertEquals } from "https://deno.land/std@0.150.0/testing/asserts.ts";
import "../test_setup.ts";
import { io as client, type Socket } from "npm:socket.io-client@4.7.5";
import { io, expireAbsentMembers } from "./websockets.ts";
import { redis } from "../db/database.ts";

// deno-lint-ignore no-explicit-any
const call = (s: Socket, ev: string, ...args: unknown[]): Promise<any> => new Promise((r) => s.emit(ev, ...args, r));
const connect = (url: string) =>
    new Promise<Socket>((r) => { const s = client(url, { transports: ["websocket"] }); s.on("connect", () => r(s)); });
const next = <T>(s: Socket, ev: string) => new Promise<T>((r) => s.once(ev, (...args: unknown[]) => r(args as T)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.test({
    name: "Handshake resume needs the owner's token, replays missed events, and chat events need membership",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        const server = Deno.serve({ port: 0, onListen() {} }, io.handler());
        const url = `http://localhost:${server.addr.port}`;
        const a = await connect(url);
        const b = await connect(url);
        const sockets: Socket[] = [a, b];
        try {
            const created = await call(a, "createChat", "Mew", 2, "pkA");
            assert(created.success && created.resumeToken, "create returns resumeToken");
            const joined = await call(b, "joinChat", created.key, "Meowth", "pkB");
            assert(joined.success, "join works");

            a.disconnect();
            await sleep(200); //let server run its disconnect handler
            //bad entry first: must not stop the replay of later events
            await call(b, "newMessage", { b64: "!!!" }, created.key, { [created.userId]: "bad" });
            //binary like real encrypted payloads
            const missedId = await call(b, "newMessage", new Uint8Array([1, 2, 3]), created.key, { [created.userId]: new Uint8Array([9, 8]) });
            b.emit("deleteMessage", missedId, created.key, joined.userId);
            b.emit("react", missedId, created.key, joined.userId, "💙");
            b.emit("seen", joined.userId, created.key, missedId);
            await sleep(200); //let server record the delete, react and seen
            assertEquals(await redis.llen(`recent:${created.userId}`), 4, "replay buffer kept in Redis (shared by instances)");

            // b knows a's uid (user list), but not a's token
            const thief = client(url, { transports: ["websocket"], auth: { key: created.key, uid: created.userId, resumeToken: joined.resumeToken } });
            sockets.push(thief);
            assertEquals((await next<[string]>(thief, "resumeFailed"))[0], "Session expired", "other user's token rejected");

            const a2 = client(url, { transports: ["websocket"], auth: { key: created.key, uid: created.userId, resumeToken: created.resumeToken } });
            sockets.push(a2);
            const resumed = next<[Record<string, unknown>]>(a2, "resumed");
            const replayed = next<[ArrayBuffer, ArrayBuffer]>(a2, "newMessage");
            const replayedDelete = next<[string]>(a2, "deleteMessage");
            const replayedReact = next<[string, string, string, string]>(a2, "react");
            const resentSeen = next<[string, string]>(a2, "seen");
            assert((await resumed)[0][created.userId], "resume ok, user still in list");
            const [replayedMessage, replayedKey] = await replayed;
            assertEquals([...new Uint8Array(replayedMessage)], [1, 2, 3], "binary message replayed intact");
            assertEquals([...new Uint8Array(replayedKey)], [9, 8], "binary smKey replayed intact");
            assertEquals((await replayedDelete)[0], missedId, "delete made while offline replayed on resume");
            const [reactMsg, reactUid, react, reactId] = await replayedReact;
            assertEquals([reactMsg, reactUid, react], [missedId, joined.userId, "💙"], "react made while offline replayed");
            assert(reactId, "replayed react carries an id for client dedupe");
            assertEquals(await resentSeen, [joined.userId, missedId], "latest seen of others sent on resume");
            assertEquals(await redis.exists(`recent:${created.userId}`), 0, "replay buffer cleared after resume");

            const smKey = next<[unknown, unknown]>(a2, "newMessage");
            await call(b, "newMessage", "cipher", created.key, { [created.userId]: "keyForA" });
            assertEquals((await smKey)[1], "keyForA", "message routed to resumed user");

            // identity comes from the socket: b cannot delete as a
            const spoofed = next<[string, string]>(a2, "deleteMessage");
            b.emit("deleteMessage", "some-id", created.key, created.userId);
            assertEquals((await spoofed)[1], joined.userId, "client-sent uid ignored");

            // an outsider who knows the key cannot inject into the room
            const outsider = await connect(url);
            sockets.push(outsider);
            let leaked = false;
            a2.once("newMessage", () => leaked = true);
            a2.once("typing", () => leaked = true);
            assertEquals(await call(outsider, "newMessage", "cipher", created.key, { [created.userId]: "x" }), null, "outsider message refused");
            outsider.emit("typing", created.userId, created.key, "start");
            await sleep(200);
            assertEquals(leaked, false, "outsider events not delivered");

            a2.emit("leaveChat", false);
            b.emit("leaveChat", false);
        } finally {
            sockets.forEach((s) => s.disconnect());
            await server.shutdown();
        }
    },
});

Deno.test({
    name: "Boot sweep starts the grace period for members left over from a restart",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        try {
            await redis.sadd("chat:BT-SWP-KY:users", "left-over");
            await redis.hset("uid:left-over", "avatar", "Mew");
            await expireAbsentMembers();
            await new Promise((r) => setTimeout(r, 200));
            assert(await redis.hget("uid:left-over", "offline"), "absent member gets a grace timer");
        } finally {
            await redis.del("chat:BT-SWP-KY:users", "uid:left-over");
        }
    },
});
