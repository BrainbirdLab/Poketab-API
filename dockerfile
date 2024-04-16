# Lightweight image for Deploying Deno app
FROM alpine

# Install curl
RUN apk add --no-cache curl

# Working directory
WORKDIR /app

# Copy all files to the container
COPY . .

# Install Deno
RUN curl -fsSL https://deno.land/x/install/install.sh | sh \
    && export DENO_INSTALL="/root/.deno" \
    && export PATH="$DENO_INSTALL/bin:$PATH"

# Expose port
EXPOSE 3000

# compile the app
RUN deno compile server/server.ts

# Run the app
CMD ["./server"]
