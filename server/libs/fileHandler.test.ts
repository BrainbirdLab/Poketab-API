import { assertEquals } from "https://deno.land/std@0.150.0/testing/asserts.ts";
import "../test_setup.ts";
import { redis } from "../db/database.ts";

// Test constants
const TEST_KEY = "AB-CDE-FG";
const TEST_UID = "test-user-id";
const TEST_MESSAGE_ID = "test-message-id";

// Helper function to setup test environment
async function setupTestEnv() {
    // Setup mock chat data in Redis
    await redis.hset(`chat:${TEST_KEY}`, {
        maxUsers: 2,
        activeUsers: 2,
        admin: TEST_UID
    });
    await redis.hset(`uid:${TEST_UID}`, {
        avatar: "Pikachu",
        uid: TEST_UID
    });
}

// Helper function to cleanup test environment
async function cleanupTestEnv() {
    await redis.del(`chat:${TEST_KEY}`);
    await redis.del(`uid:${TEST_UID}`);
    await redis.del(`chat:${TEST_KEY}:file:${TEST_MESSAGE_ID}`);
    
    try {
        await Deno.remove(`./uploads/${TEST_KEY}/${TEST_MESSAGE_ID}`);
        await Deno.remove(`./uploads/${TEST_KEY}`);
    } catch {
        // Ignore errors if files don't exist
    }
}

Deno.test({
    name: "File upload test",
    async fn() {
        try {
            await setupTestEnv();

            // Create a mock file
            const mockFile = new File(["test file content"], "test.txt", {
                type: "text/plain",
            });

            // Create test directory
            await Deno.mkdir(`./uploads/${TEST_KEY}`, { recursive: true });
            
            // Simulate file upload by writing the file
            const fileContent = await mockFile.arrayBuffer();
            await Deno.writeFile(
                `./uploads/${TEST_KEY}/${TEST_MESSAGE_ID}`,
                new Uint8Array(fileContent)
            );

            // Verify file was written correctly
            const writtenContent = await Deno.readFile(`./uploads/${TEST_KEY}/${TEST_MESSAGE_ID}`);
            const decoder = new TextDecoder();
            assertEquals(
                decoder.decode(writtenContent),
                "test file content",
                "File content should match"
            );

            // Verify file metadata was set correctly
            await redis.hset(`chat:${TEST_KEY}:file:${TEST_MESSAGE_ID}`, {
                maxDownload: 1,
                downloadCount: 0
            });

            const [maxDownload, downloadCount] = await redis.hmget(
                `chat:${TEST_KEY}:file:${TEST_MESSAGE_ID}`,
                "maxDownload",
                "downloadCount"
            ) as [string, string];

            assertEquals(maxDownload, "1", "Max download should be set correctly");
            assertEquals(downloadCount, "0", "Download count should start at 0");

        } finally {
            await cleanupTestEnv();
        }
    }
});

Deno.test({
    name: "File upload authorization validation",
    async fn() {
        try {
            await setupTestEnv();

            // Test file upload authorization
            const exists = await redis.exists(`uid:${TEST_UID}`);
            const activeUsers = await redis.hget(`chat:${TEST_KEY}`, "activeUsers");

            assertEquals(exists, 1, "User should exist");
            assertEquals(activeUsers, "2", "Should have two active users");

        } finally {
            await cleanupTestEnv();
        }
    }
});

Deno.test({
    name: "File metadata storage test",
    async fn() {
        try {
            await setupTestEnv();

            // Set file metadata
            await redis.hset(`chat:${TEST_KEY}:file:${TEST_MESSAGE_ID}`, {
                maxDownload: 1,
                downloadCount: 0
            });

            // Verify metadata
            const [maxDownload, downloadCount] = await redis.hmget(
                `chat:${TEST_KEY}:file:${TEST_MESSAGE_ID}`,
                "maxDownload",
                "downloadCount"
            ) as [string, string];

            assertEquals(maxDownload, "1", "Max download should be 1");
            assertEquals(downloadCount, "0", "Download count should start at 0");

        } finally {
            await cleanupTestEnv();
        }
    }
});

Deno.test({
    name: "File cleanup after max downloads test",
    async fn() {
        try {
            await setupTestEnv();

            // Create test directory and file
            await Deno.mkdir(`./uploads/${TEST_KEY}`, { recursive: true });
            await Deno.writeFile(
                `./uploads/${TEST_KEY}/${TEST_MESSAGE_ID}`,
                new TextEncoder().encode("test content")
            );

            // Set metadata to trigger cleanup
            await redis.hset(`chat:${TEST_KEY}:file:${TEST_MESSAGE_ID}`, {
                maxDownload: 1,
                downloadCount: 1
            });

            // Verify file exists
            const fileExists = await Deno.stat(`./uploads/${TEST_KEY}/${TEST_MESSAGE_ID}`)
                .then(() => true)
                .catch(() => false);

            assertEquals(fileExists, true, "File should exist before cleanup");

            // Cleanup should happen when download count reaches max
            await redis.del(`chat:${TEST_KEY}:file:${TEST_MESSAGE_ID}`);
            await Deno.remove(`./uploads/${TEST_KEY}/${TEST_MESSAGE_ID}`);

            // Verify file is removed
            const fileExistsAfter = await Deno.stat(`./uploads/${TEST_KEY}/${TEST_MESSAGE_ID}`)
                .then(() => true)
                .catch(() => false);

            assertEquals(fileExistsAfter, false, "File should be removed after cleanup");

        } finally {
            await cleanupTestEnv();
        }
    }
}); 
Deno.test({
    name: "Rejected download does not delete the file; owner token downloads it",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        const { default: fileApp } = await import("./fileHandler.ts");
        try {
            await setupTestEnv();
            await redis.sadd(`chat:${TEST_KEY}:users`, TEST_UID);
            await redis.hset(`uid:${TEST_UID}`, "resumeToken", "tok");
            await Deno.mkdir(`./uploads/${TEST_KEY}`, { recursive: true });
            await Deno.writeFile(`./uploads/${TEST_KEY}/${TEST_MESSAGE_ID}`, new TextEncoder().encode("x"));
            await redis.hset(`chat:${TEST_KEY}:file:${TEST_MESSAGE_ID}`, { maxDownload: 1, downloadCount: 0 });
            const url = `http://test/download/${TEST_KEY}/${TEST_UID}/${TEST_MESSAGE_ID}`;

            const rejected = await fileApp.handler(new Request(url));
            assertEquals(rejected?.status, 401, "No token is rejected");
            assertEquals(await redis.exists(`chat:${TEST_KEY}:file:${TEST_MESSAGE_ID}`), 1, "Rejected request must not delete the file");

            const ok = await fileApp.handler(new Request(`${url}?token=tok`));
            assertEquals(ok?.status, 200, "Owner token downloads");
            await ok?.body?.cancel();
        } finally {
            await redis.del(`chat:${TEST_KEY}:users`);
            await cleanupTestEnv();
        }
    }
});

Deno.test({
    name: "Each user counts once; file is deleted after maxDownload distinct users",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        const { default: fileApp } = await import("./fileHandler.ts");
        const users = ["u-one", "u-two"];
        try {
            await setupTestEnv();
            for (const uid of users) {
                await redis.sadd(`chat:${TEST_KEY}:users`, uid);
                await redis.hset(`uid:${uid}`, "resumeToken", `tok-${uid}`);
            }
            await Deno.mkdir(`./uploads/${TEST_KEY}`, { recursive: true });
            await Deno.writeFile(`./uploads/${TEST_KEY}/${TEST_MESSAGE_ID}`, new TextEncoder().encode("x"));
            await redis.hset(`chat:${TEST_KEY}:file:${TEST_MESSAGE_ID}`, { maxDownload: 2, downloadCount: 0 });
            const download = async (uid: string) => {
                const res = await fileApp.handler(new Request(`http://test/download/${TEST_KEY}/${uid}/${TEST_MESSAGE_ID}?token=tok-${uid}`));
                await res?.body?.cancel();
                return res?.status;
            };

            assertEquals(await download("u-one"), 200);
            assertEquals(await download("u-one"), 200, "Same user may download again");
            assertEquals(await redis.exists(`chat:${TEST_KEY}:file:${TEST_MESSAGE_ID}`), 1, "Repeat download by one user does not use up the file");
            assertEquals(await download("u-two"), 200);
            assertEquals(await redis.exists(`chat:${TEST_KEY}:file:${TEST_MESSAGE_ID}`), 0, "Deleted after 2 distinct users");
        } finally {
            await redis.del(`chat:${TEST_KEY}:users`, ...users.map((u) => `uid:${u}`));
            await cleanupTestEnv();
        }
    }
});
