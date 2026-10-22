# vendor/

On Windows, the app ships with [scrcpy](https://github.com/Genymobile/scrcpy)
(which bundles `adb`) in `vendor/scrcpy-win64/`. These binaries are **not**
committed to the repository — only the `VERSION` file that pins the expected
release is tracked.

The pinned version is recorded in [`VERSION`](./VERSION).

## Populating this folder for a build

You have two options:

1. **Let the app fetch it at runtime.** If `vendor/scrcpy-win64/` is missing,
   the app offers an **Install adb + scrcpy** button that downloads the latest
   scrcpy win64 release from GitHub.

2. **Download it manually** (required to produce a bundled installer with
   `npm run dist`):

   ```sh
   # Download scrcpy-win64-<version>.zip from:
   #   https://github.com/Genymobile/scrcpy/releases
   # Extract its contents into vendor/scrcpy-win64/
   ```

   After extraction, `vendor/scrcpy-win64/` should contain `scrcpy.exe`,
   `adb.exe`, `scrcpy-server`, and the accompanying DLLs.

scrcpy is distributed under the Apache License 2.0.
