// Set up test environment variables if they don't exist
const testEnv = {
    clienturl: "http://localhost:3000",
    host: "localhost",
    port: "6379",
    password: "",
    adminPasskey: "test-admin-key",
    devMode: "true"
};

// Set environment variables if they don't exist
Object.entries(testEnv).forEach(([key, value]) => {
    if (!Deno.env.get(key)) {
        Deno.env.set(key, value);
    }
}); 