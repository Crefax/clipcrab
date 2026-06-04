# ClipCrab

A lightweight, local-first clipboard manager built with Tauri and Rust.

## Features

- Clipboard history for text and images
- Fast search with type filters
- Pinned items
- Encrypted local storage
- System tray background mode
- Autostart and updater support
- Thumbnail-based image history for lower WebView memory use
- Diagnostics panel with DB size, image payload, WebView2 version, logs, repair, and compact actions
- Retention and privacy settings: opt-in automatic cleanup, max history, max DB payload, max text/image size, image capture toggle, app ignore list
- Keyboard workflow: `Ctrl+Alt+V` quick open on Windows, arrows to select, `Enter` copy and hide, `Ctrl+Enter` copy only, `Space` open details, `Delete` delete, `P` pin, `1-9` quick pick

## Security And Privacy

ClipCrab encrypts clipboard data before writing it to disk.

- Algorithm: AES-256-GCM
- Nonce: 12-byte random nonce per encryption
- Key storage: a local key file generated on first launch
- Logs are content-free by design; clipboard text/image payloads are not written to stdout or the app log
- Password manager presets and user-defined ignored apps can be skipped by the watcher on Windows
- Automatic cleanup is disabled by default so upgrades do not prune existing history unless the user enables it

## Data Storage

Your data is stored locally in:

- Windows: `%APPDATA%\clipcrab\`
- macOS: `~/Library/Application Support/clipcrab/`
- Linux: `~/.local/share/clipcrab/`

The main database is `clipboard.db`. App logs are written under `logs/clipcrab.log` in the same app data directory.

## Installation

Download the latest release from the [Releases](https://github.com/crefax/clipcrab/releases) page.

### Windows

- Download the `.msi` or `.exe` installer.
- The app registers `Ctrl+Alt+V` for quick open when the shortcut is available.

### Linux

- Debian/Ubuntu: download the `.deb` file
- Fedora/RHEL: download the `.rpm` file
- Other distros: download the `.AppImage`

Linux dependencies:

```bash
sudo apt install libwebkit2gtk-4.1-0 libappindicator3-1
sudo dnf install webkit2gtk4.1 libappindicator-gtk3
```

## Building From Source

```bash
git clone https://github.com/crefax/clipcrab.git
cd clipcrab
npm install
npm run tauri build
```

## Tech Stack

- Rust + Tauri 2
- Vanilla HTML/CSS/JavaScript
- SQLite with WAL
- AES-GCM encryption
- WebView2 on Windows

## License

MIT
