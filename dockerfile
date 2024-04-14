FROM denoland/deno:alpine

WORKDIR /app

COPY . .

RUN deno cache server/server.ts

EXPOSE 8000 

CMD ["deno", "run", "-A", "server/server.ts"]
