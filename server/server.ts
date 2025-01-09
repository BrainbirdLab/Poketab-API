#!/usr/bin/env deno run --allow-all

console.log("Booting up...");

import { redis } from "./db/database.ts";
import { io } from "./libs/websockets.ts";

const port = 5000;

redis.flushdb().then(() => {
    console.log('Redis flushed');
}).catch(() => {
    console.log("Error flushing redis")
});

Deno.stat('./uploads')
.then(() => {
    Deno.remove('./uploads', { recursive: true }).then(() => {
        console.log('Cleaned all garbage files');
    }).catch((err) => {
        console.log(err);
    });
})
.catch(() => {
    console.log('No garbage files found');
});

//listen on port and bind handler
//serve(handler, { port: port });

Deno.serve({
    handler: io.handler(),
    port: port,
});