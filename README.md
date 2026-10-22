<div align="center">

<img src="renderer/assets/logo.png" alt="scrcpy Desktop" width="96" />

# scrcpy Desktop

**A clean desktop UI for [scrcpy](https://github.com/Genymobile/scrcpy) — mirror your Android screen in one click.**

[![Download](https://img.shields.io/github/v/release/sentrize/scrcpy-desktop?label=download&style=flat-square)](https://github.com/sentrize/scrcpy-desktop/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows-0A84FF?style=flat-square)](https://github.com/sentrize/scrcpy-desktop/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)

</div>

---

scrcpy Desktop wraps the excellent `scrcpy` and `adb` command-line tools in a
friendly interface. No terminal, no memorising flags — plug in a device (or
connect over Wi-Fi) and mirror it with a single click.

## ✨ Features

- **Live device list** — polls `adb devices -l` every 2 seconds and shows each
  device as *Ready*, *Waiting for approval*, or *Offline*, with model, brand,
  Android version, and battery level.
- **One-click mirroring** — start and stop screen mirroring instantly.
- **Wi-Fi debugging** — switch a USB-connected device to wireless with one
  click, or connect directly by IP address.
- **Remembers your devices** — previously connected devices are saved (model,
  serial, Android version, last seen); Wi-Fi devices reconnect in a single tap.
- **Empty-state guidance** — a clear "Please connect a device" screen walks you
  through enabling USB debugging.
- **Batteries included (Windows)** — ships with scrcpy + adb bundled, so there
  is nothing else to install. If the bundle is missing, the app can download the
  latest scrcpy release for you.
- **Settings that matter** — custom adb/scrcpy paths, max resolution, turn the
  device screen off while mirroring, disable audio, and record sessions to MP4.

## 📥 Download

Grab the latest build from the [**Releases**](https://github.com/sentrize/scrcpy-desktop/releases/latest) page:

| File | Description |
| --- | --- |
| `scrcpy-Desktop-Setup-<version>.exe` | Windows installer (recommended) |
| `scrcpy-Desktop-portable-<version>.exe` | Portable — run without installing |

Both Windows builds include scrcpy and adb — nothing else is required.

## 🚀 Usage

1. Enable **USB debugging** on your Android device
   (*Settings → Developer options → USB debugging*).
2. Connect the device by USB and approve the debugging prompt.
3. Launch scrcpy Desktop and click **Mirror**.

To go wireless, click **Switch to Wi-Fi** on a connected device (both must be on
the same network), then unplug the cable.

## 🛠️ Running from source

### Requirements

- [Node.js](https://nodejs.org/) 18 or newer
- `adb` and `scrcpy` available on your `PATH` or set in **Settings**
  - **Windows:** `winget install Genymobile.scrcpy` (bundles adb)
  - **macOS:** `brew install scrcpy android-platform-tools`
  - **Linux:** `sudo apt install scrcpy adb`

### Run

```sh
npm install
npm start
```

### Build installers

```sh
npm run dist
```

Output lands in `dist/`. On Windows, place the scrcpy binaries in
`vendor/scrcpy-win64/` first so they are bundled — see [`vendor/README.md`](vendor/README.md).

## 🧩 Tech stack

- [Electron](https://www.electronjs.org/) with a secure `contextIsolation` +
  preload bridge (no `nodeIntegration`)
- A thin wrapper around `adb` and `scrcpy`
- [electron-builder](https://www.electron.build/) for packaging

## 📄 License

Released under the [MIT License](LICENSE).

scrcpy and adb are the work of the [Genymobile](https://github.com/Genymobile/scrcpy)
team and the Android Open Source Project, bundled here under their respective
licenses.

---

<div align="center">
Made by <a href="https://ryn.bd">Md Raihan Hasan (ryn.bd)</a>
</div>
