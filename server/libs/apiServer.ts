import http from 'node:http';
// @deno-types="npm:@types/express@4"
import express from "npm:express@4.18.2";
import { redis } from "./database.ts";

export const app = express();

export const httpServer = http.createServer(app);



const port = 3000;


app.get('/', (_, res) => {
  //check system status. If redis ready
    res.send({redis: redis.isReady ? "online" : "offline", system: 'online'});
});

httpServer.listen(port, () => {
    console.log(`Listening on port ${port}`);
});