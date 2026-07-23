# Hardware workspace

This directory is the landing area for Wingman prototype hardware. It is kept
separate from the browser and cloud code so each device can use its own toolchain
without disrupting the Photon Agent.

| Directory | Owner / purpose |
| --- | --- |
| `ring/` | Ring prototype firmware, BLE transport, tap sensing |
| `glasses/` | Glasses prototype firmware, touch / IMU input |
| `shared/` | Small cross-device protocol libraries and test fixtures |

Every device should emit a normalized Wingman event, rather than sending an
iMessage itself. The event contract is in [`../docs/hardware-event-contract.md`](../docs/hardware-event-contract.md).

Do not commit device Wi-Fi passwords, API keys, phone numbers, provisioning
profiles, build directories, or binary firmware images.
