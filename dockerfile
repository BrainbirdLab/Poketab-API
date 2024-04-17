FROM denoland/deno:1.42.4

# Set the working directory inside the container
WORKDIR /app

# Create a directory for your application
RUN mkdir -p /app

# Copy the application code into the container
COPY . .

# Change ownership of the application directory to the deno user
RUN chown -R deno:deno /app

# Set permissions for the application directory to allow read-write access
RUN chmod -R 777 /app

# Switch to the deno user
USER deno

# Specify the command to run your application
CMD ["run", "-A", "server/server.ts"]
