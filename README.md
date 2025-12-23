# ClipCrab

A lightweight and secure clipboard manager built with Tauri and Rust.

![ClipCrab Screenshot](https://img.crefax.net/i/ouTIG.png)

## Features

- 📋 **Clipboard History** - Automatically saves everything you copy
- 🔍 **Search** - Quickly find items in your history
- 📌 **Pin Items** - Keep important items at the top
- 🔄 **Auto-start** - Launch with your system
- 🔐 **Encrypted Storage** - All data is encrypted at rest

## Security

ClipCrab takes your privacy seriously. All clipboard data is encrypted before being stored on disk.

### Encryption Method

- **Algorithm**: AES-256-GCM (Advanced Encryption Standard with Galois/Counter Mode)
- **Key Size**: 256-bit
- **Nonce**: 12-byte random nonce for each encryption
- **Key Storage**: A unique encryption key is automatically generated and stored locally on first launch
- **Encoding**: Encrypted data is Base64 encoded for safe storage

AES-256-GCM provides both confidentiality and authenticity, ensuring your clipboard data cannot be read or tampered with without the encryption key.

### Data Storage

Your data is stored locally in:
- **Windows**: `%LOCALAPPDATA%\clipcrab\`
- **macOS**: `~/Library/Application Support/clipcrab/`
- **Linux**: `~/.local/share/clipcrab/`

## Installation

Download the latest release from the [Releases](https://github.com/crefax/clipcrab/releases) page.

## Tech Stack

- **Backend**: Rust + Tauri 2.0
- **Frontend**: HTML, CSS, JavaScript
- **Database**: SQLite (encrypted)
- **Encryption**: aes-gcm crate

## License

MIT
