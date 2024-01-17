import { connect } from "https://deno.land/x/redis/mod.ts";
import "https://deno.land/x/dotenv@v3.2.2/load.ts";

//this will only serve websocket connections and not http requests

const { host, password, port } = Deno.env.toObject();

export const redis = await connect({
  hostname: host,
  port: +port,
  password: password,
  maxRetryCount: 5,
});

const reply = await redis.sendCommand('JSON.GET', ['chat:pP-NUj-cJ', 'activeUsers', 'maxUsers']);

console.log("Redis reply:");
console.log(reply);