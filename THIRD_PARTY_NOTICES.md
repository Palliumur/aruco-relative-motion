# Third-party notices

## OpenCV.js

- Distributed website file: `dist/vendor/opencv.js` (unmodified). It is prepared by `scripts/prepare-opencv.mjs` and is not committed to Git.
- Package: `@techstark/opencv-js@4.12.0-release.1`.
- Download source: <https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.12.0-release.1/dist/opencv.js>.
- Package source: <https://github.com/TechStark/opencv-js/tree/v4.12.0-release.1>.
- OpenCV source: <https://github.com/opencv/opencv/tree/4.12.0>.
- License: Apache License 2.0. A copy is provided in `dist/vendor/LICENSE-OpenCV.txt` and the repository root `LICENSE`.
- Pinned SHA-256: `bd0c3e6448043de04f6a64a12cb7b759f78c3ab8f7c35c9f2e0f71c88bb17103`.

The embedded WebAssembly binary is distributed with the upstream JavaScript build. The application does not modify that build. The upstream projects retain their respective rights and attribution.

## Optional web fonts

`dist/style.css` references DM Sans and IBM Plex Mono via the Google Fonts stylesheet service. Font files are not bundled in this repository. The application falls back to system fonts when the stylesheet or fonts cannot be loaded.

- DM Sans: <https://fonts.google.com/specimen/DM+Sans>.
- IBM Plex Mono: <https://fonts.google.com/specimen/IBM+Plex+Mono>.
