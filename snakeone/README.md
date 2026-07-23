# snakeone

A [Spectrum](https://photon.codes/docs/spectrum-ts) project. Wired with: imessage.

## Environment

Before running, open `.env` and fill in the values:

From your project Settings on the [Photon dashboard](https://app.photon.codes):

- `PROJECT_ID`
- `PROJECT_SECRET`

## Run

```sh
npm install
npm run start
```

`npm run start` explicitly loads `.env` before the Spectrum SDK initializes. Run
it through the project's Conda environment to use the tested Node 22 runtime:

```sh
conda run -n wingman-photon npm run start
```

## Where to go next

- [Spectrum docs](https://photon.codes/docs/spectrum-ts)
- Add more providers from `spectrum-ts/providers/*`.

## Wingman commands

This project is configured as the Wingman Photon Agent. Text the agent from an
authorized iMessage number (or from a group containing the agent) to use:

| Message | Result |
| --- | --- |
| `救我` / `救场` | Schedule a private reminder in 10 seconds. |
| `救场 30 秒` | Schedule the reminder after a chosen delay. |
| `取消` | Cancel the active reminder in this conversation. |
| `延后 30 秒` | Replace the active timer with a new delay. |
| `状态` | Show the remaining time. |
| `下一句聊什么？` | Return a short conversation suggestion. |
| `帮助` | Show the command menu. |

The delayed reminder is sent by the Agent without needing a second incoming
message. Each direct message and group chat has an independent task.
