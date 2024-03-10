#!/usr/bin/env deno run --allow-all

console.log("Booting up...");

import { serve } from "https://deno.land/std@0.166.0/http/server.ts";
import { handler } from "./libs/apiServer.ts";

const port = 3000;


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
serve(handler, { port: port });