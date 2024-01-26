#!/usr/bin/env deno run --allow-all

import { serve } from "https://deno.land/std@0.166.0/http/server.ts";

console.log("Booting up...");

import { handler } from "./libs/apiServer.ts";

const port = 3000;

serve(handler, { port: +port });