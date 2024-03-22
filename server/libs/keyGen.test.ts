import { assertEquals } from "https://deno.land/std@0.150.0/testing/asserts.ts";
import { makeKey } from "./keyGen.ts";

//Deno test

Deno.test({
    name: "Unique key generation test",
    fn() {

        const generatedKeys: string[] = [];

        function getRandomKey() {

            const key = makeKey();
            //check if key exists
            if (generatedKeys.includes(key)) {
                return getRandomKey();
            }
            return key;
        }

        for (let i = 0; i < 1000; i++){
            const key = getRandomKey();
            generatedKeys.push(key);
        }

        //create a set
        const set = new Set(generatedKeys);

        assertEquals(set.size, generatedKeys.length);
    }
});