# Lightweight image for Deploying Deno app
FROM alpine

# Install curl
RUN apk add --no-cache curl

# Working directory
WORKDIR /app

# Copy all files to the container
COPY . .

# Install Deno
RUN curl -fsSL https://deno.land/x/install/install.sh | sh

RUN deno cache server/server.ts

EXPOSE 8000 

CMD ["deno", "run", "-A", "server/server.ts"]
