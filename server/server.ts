#!/usr/bin/env deno run --allow-all

console.log("Booting up...");

import { handler } from "./libs/apiServer.ts";
import { expireAbsentMembers } from "./libs/websockets.ts";

const port = 5000;

expireAbsentMembers().then(() => {
    console.log('Absent members scheduled for expiry');
}).catch((err) => {
    console.log("Error scheduling member expiry", err)
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
    handler,
    port: port,
});