// add unstable
///<reference lib="deno.unstable" />


export function makeKey() {
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';

    for (let i = 0; i < 2; i++) {
        key += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    key += '-';
    for (let i = 0; i < 3; i++) {
        key += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    key += '-';
    for (let i = 0; i < 2; i++) {
        key += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return key;
}


//use the c++ compiled dll

const lib = Deno.dlopen("lib.dll", {
    makeKey: {
        parameters: [],
        result: "pointer",
    }
});

const start = Date.now();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
lib.symbols.makeKey();
const end = Date.now();
console.log(`C++ took ${end - start}ms`);

//close the dll
lib.close();

const start2 = Date.now();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
makeKey();
const end2 = Date.now();
console.log(`Deno took ${end2 - start2}ms`);