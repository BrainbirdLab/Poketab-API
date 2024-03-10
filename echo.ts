const listener = Deno.listen({ port: 4000 });
console.log("listening on 0.0.0.0:4000");
for await (const conn of listener) {
  conn.readable.pipeTo(conn.writable);
}