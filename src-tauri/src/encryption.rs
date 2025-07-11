use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, KeyInit, OsRng, rand_core::RngCore};
use base64::{engine::general_purpose, Engine as _};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use lazy_static::lazy_static;

const KEY_SIZE: usize = 32;
const NONCE_SIZE: usize = 12;

lazy_static! {
    static ref ENCRYPTION: Mutex<Option<Aes256Gcm>> = Mutex::new(None);
}

fn key_file_path() -> PathBuf {
    let mut path = dirs::data_dir().expect("No data dir");
    path.push("clipcrab");
    fs::create_dir_all(&path).ok();
    path.push("key.bin");
    path
}

fn load_or_generate_key() -> Key<Aes256Gcm> {
    let path = key_file_path();
    if path.exists() {
        let bytes = fs::read(path).expect("Failed to read key file");
        Key::<Aes256Gcm>::from_slice(&bytes).clone()
    } else {
        let mut key_bytes = [0u8; KEY_SIZE];
        OsRng.fill_bytes(&mut key_bytes);
        fs::write(&path, &key_bytes).expect("Failed to write key file");
        Key::<Aes256Gcm>::from_slice(&key_bytes).clone()
    }
}

fn get_cipher<'a>() -> std::sync::MutexGuard<'a, Option<Aes256Gcm>> {
    let mut guard = ENCRYPTION.lock().unwrap();
    if guard.is_none() {
        let key = load_or_generate_key();
        *guard = Some(Aes256Gcm::new(&key));
    }
    guard
}

pub fn encrypt(plain: &str) -> Result<String, String> {
    let mut nonce_bytes = [0u8; NONCE_SIZE];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let cipher = get_cipher();
    let cipher = cipher.as_ref().unwrap();
    let ciphertext = cipher.encrypt(nonce, plain.as_bytes()).map_err(|e| e.to_string())?;
    // nonce + ciphertext'i birleştirip base64 ile encode et
    let mut out = nonce_bytes.to_vec();
    out.extend_from_slice(&ciphertext);
    Ok(general_purpose::STANDARD.encode(out))
}

pub fn decrypt(data: &str) -> Result<String, String> {
    let bytes = general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    if bytes.len() < NONCE_SIZE {
        return Err("Invalid data".into());
    }
    let (nonce_bytes, ciphertext) = bytes.split_at(NONCE_SIZE);
    let nonce = Nonce::from_slice(nonce_bytes);
    let cipher = get_cipher();
    let cipher = cipher.as_ref().unwrap();
    let plain = cipher.decrypt(nonce, ciphertext).map_err(|e| e.to_string())?;
    String::from_utf8(plain).map_err(|e| e.to_string())
} 