import { assertEquals } from "https://deno.land/std@0.150.0/testing/asserts.ts";
import { validateKey, validatename, validateAll, avList } from "./utils.ts";

Deno.test({
    name: "Key validation tests",
    fn() {
        // Valid key format tests
        assertEquals(validateKey("AB-CDE-FG"), true, "Valid key format should pass");
        assertEquals(validateKey("12-345-67"), true, "Valid key with numbers should pass");
        assertEquals(validateKey("A1-B2C-D3"), true, "Valid key with mixed characters should pass");

        // Invalid key format tests
        assertEquals(validateKey(""), false, "Empty key should fail");
        assertEquals(validateKey("AB-CDE"), false, "Incomplete key should fail");
        assertEquals(validateKey("ABCDEFGH"), false, "Key without hyphens should fail");
        assertEquals(validateKey("AB-CDEF-GH"), false, "Key with wrong segment lengths should fail");
        assertEquals(validateKey("AB-CDE-FGH"), false, "Key with extra characters should fail");
        assertEquals(validateKey("A@-CDE-FG"), false, "Key with special characters should fail");
    }
});

Deno.test({
    name: "Avatar validation tests",
    fn() {
        // Test all predefined avatars
        for (const avatar of avList) {
            assertEquals(validatename(avatar), true, `Predefined avatar ${avatar} should be valid`);
        }

        // Invalid avatar tests
        assertEquals(validatename(""), false, "Empty avatar name should fail");
        assertEquals(validatename("NonExistentPokemon"), false, "Non-existent Pokemon should fail");
        assertEquals(validatename("pikachu"), false, "Case-sensitive validation - lowercase should fail");
        assertEquals(validatename(" Pikachu "), false, "Avatar with whitespace should fail");
    }
});

Deno.test({
    name: "Combined validation tests",
    fn() {
        // Valid combinations
        assertEquals(validateAll("AB-CDE-FG", "Pikachu"), true, "Valid key and avatar should pass");
        assertEquals(validateAll("12-345-67", "Mewtwo"), true, "Valid numeric key and avatar should pass");

        // Invalid combinations
        assertEquals(validateAll("invalid-key", "Pikachu"), false, "Invalid key should fail");
        assertEquals(validateAll("AB-CDE-FG", "InvalidPokemon"), false, "Invalid avatar should fail");
        assertEquals(validateAll("invalid-key", "InvalidPokemon"), false, "Both invalid should fail");
    }
}); 