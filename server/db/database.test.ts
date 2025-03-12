import { assertEquals, assertExists } from "https://deno.land/std@0.150.0/testing/asserts.ts";
import "../test_setup.ts";
import { _R_getAllUsersData, _R_getAllUsersAvatar, _R_joinChat, _R_exitUserFromSocket, _R_deleteChatKey, _R_fileUploadAuth, type User, type Key } from "./database.ts";

// Mock data for testing
const mockUser: User = {
    avatar: "Pikachu",
    uid: "test-user-id",
    publicKey: "test-public-key",
    joinedAt: Date.now()
};

const mockKey: Key = {
    keyId: "AB-CDE-FG",
    activeUsers: 1,
    maxUsers: 2,
    admin: "test-admin-id",
    createdAt: Date.now()
};

// Helper function to create test data
async function setupTestChat() {
    await _R_joinChat(true, mockKey, mockUser);
}

// Helper function to clean up test data
async function cleanupTestChat() {
    await _R_deleteChatKey(mockKey.keyId, mockUser.uid);
}

Deno.test({
    name: "Chat creation and user join test",
    async fn() {
        try {
            await setupTestChat();
            
            // Test getting user data
            const users = await _R_getAllUsersData(mockKey.keyId);
            assertExists(users[mockUser.uid], "User should exist in chat");
            assertEquals(users[mockUser.uid].avatar, mockUser.avatar, "User avatar should match");
            assertEquals(users[mockUser.uid].publicKey, mockUser.publicKey, "User public key should match");
        } finally {
            await cleanupTestChat();
        }
    }
});

Deno.test({
    name: "Get users avatar test",
    async fn() {
        try {
            await setupTestChat();
            
            // Test getting user avatars
            const avatars = await _R_getAllUsersAvatar(mockKey.keyId);
            assertExists(avatars[mockUser.uid], "User avatar entry should exist");
            assertEquals(avatars[mockUser.uid].avatar, mockUser.avatar, "Avatar should match");
        } finally {
            await cleanupTestChat();
        }
    }
});

Deno.test({
    name: "User exit test",
    async fn() {
        try {
            await setupTestChat();
            
            // Test user exit
            await _R_exitUserFromSocket(mockKey.keyId, mockUser.uid);
            
            // Verify user was removed
            const users = await _R_getAllUsersData(mockKey.keyId);
            assertEquals(Object.keys(users).length, 0, "No users should remain in chat");
        } finally {
            await cleanupTestChat();
        }
    }
});

Deno.test({
    name: "File upload authorization test",
    async fn() {
        try {
            await setupTestChat();
            
            // Test file upload authorization
            const [exists, activeUsers] = await _R_fileUploadAuth(mockKey.keyId, mockUser.uid) as [number, number];
            assertEquals(+exists, 1, "User should exist");
            assertEquals(+activeUsers, 1, "Should have one active user");
        } finally {
            await cleanupTestChat();
        }
    }
}); 