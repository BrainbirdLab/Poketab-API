

/*
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

*/

const char* makeKey(){
    const char* characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    char* key = (char*)malloc(8);
    for (int i = 0; i < 2; i++) {
        key[i] = characters[rand() % 62];
    }

    key[2] = '-';

    for (int i = 3; i < 5; i++) {
        key[i] = characters[rand() % 62];
    }

    key[5] = '-';

    for (int i = 6; i < 8; i++) {
        key[i] = characters[rand() % 62];
    }

    return key;
}