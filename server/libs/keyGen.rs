//Not Using this code anymore

use std::ffi::CString;
use std::os::raw::c_char;

extern "C" {
    fn make_key() -> *const c_char;
}

#[no_mangle]
pub extern "C" fn make_key() -> *const c_char {
    let characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut key = String::new();

    for _ in 0..2 {
        let random_char = characters.chars().nth(rand::random::<usize>() % characters.len()).unwrap();
        key.push(random_char);
    }
    key.push('-');
    for _ in 0..3 {
        let random_char = characters.chars().nth(rand::random::<usize>() % characters.len()).unwrap();
        key.push(random_char);
    }
    key.push('-');
    for _ in 0..2 {
        let random_char = characters.chars().nth(rand::random::<usize>() % characters.len()).unwrap();
        key.push(random_char);
    }

    CString::new(key).unwrap().into_raw()
}