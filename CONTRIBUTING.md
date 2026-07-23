# Contributing to AdvantureX

## Working together

1. Create a branch such as `feat/ring-double-tap` or `feat/glasses-imu`.
2. Keep a change within one area: `hardware/ring`, `hardware/glasses`, `backend`,
   `snakeone`, or `docs`.
3. Add a short README with setup, board/toolchain version, and a reproducible test.
4. Open a pull request to `main`; do not commit secrets or binary build output.

## Boundaries

- `snakeone/` owns the Spectrum/Photon iMessage identity.
- `backend/` owns orchestration and the web-call state machine.
- `docs/` is the GitHub Pages front end.
- `hardware/` owns device firmware only; it sends normalized events to the backend.

Before handing off a hardware integration, include the board name, transport
(BLE/Wi-Fi/USB), event payload example, and a brief test result in the PR.
