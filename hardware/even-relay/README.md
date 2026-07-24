# Even G2 / R1 relay starter

Vite + TypeScript + Even Hub SDK starter for logging G2/R1 input events and forwarding them to other hardware.

## Run

```bash
npm install
npm run dev
```

Then either:
- **Simulator:** `npm run simulate`
- **Real glasses:** `./node_modules/.bin/evenhub qr --url http://<your-ip>:5173` and scan with the Even Hub companion app.

## Relay to Hardware

Run the Ring → Wingman relay server in a third terminal. `8788` is deliberate:
`8787` belongs to the Photon iMessage Agent.

```bash
npm run relay:wingman
```

The current demo build defaults to this public relay endpoint:

```text
https://trading-begins-instruction-variable.trycloudflare.com/even
```

Keep **Forward events** enabled, leave **No-CORS** off, and press **Save** if
you previously stored a different endpoint. A physical R1 **single click**,
**swipe up**, or **swipe down** is forwarded to Wingman. Wingman sends the
configured iMessage, waits 10 seconds, then places the published mobile page
into its incoming-call state. Swipe to answer on that page to play the
configured MP3. A 30-second server cooldown prevents a swipe followed by its
confirmation click from sending duplicate messages.

The relay accepts:

```http
POST /even
Content-Type: application/json
```

Payload shape:

```json
{
  "schema": "even-r1-relay/v1",
  "context": {
    "app": { "url": "http://30.201.217.2:5173/", "launchSource": "glassesMenu" },
    "device": { "model": "g2", "sn": "..." },
    "status": { "batteryLevel": 80 },
    "location": null,
    "recentGestures": []
  },
  "event": {
    "gesture": "ring.click",
    "source": { "label": "ring", "kind": "ring" },
    "eventType": { "code": 0, "label": "click" }
  },
  "action": { "name": "ring_select", "confidence": 0.8 }
}
```

To have the Mac relay forward events to another device:

```bash
PORT=8788 FORWARD_URL=http://192.168.1.50/gesture npm run relay
```

If posting directly from the phone to a microcontroller that cannot return CORS headers, enable `No-CORS fire-and-forget` in the page. The request body is still JSON, but it is sent as `text/plain` so simple hardware endpoints can receive it.

## Phone on cellular data: temporary public demo

When the phone is on 4G/5G and the Mac is on a separate robot or venue
network, the phone cannot reach `http://<your-mac-ip>`. Keep Wingman and the
relay on the Mac, then expose **two temporary HTTPS tunnels**:

```bash
# Terminal 1, from the repository root. Leave PHOTON_BRIDGE_URL blank for a
# fake-call-only demo; USER_PHONE_NUMBER may be a non-deliverable demo value.
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000

# Terminal 2, from hardware/even-relay.
npm run relay:wingman

# Terminals 3 and 4. Each command prints a different trycloudflare.com URL.
cloudflared tunnel --url http://127.0.0.1:8788
cloudflared tunnel --url http://127.0.0.1:8000
```

Use the resulting addresses as follows:

| Address | Put it here |
|---|---|
| `https://<relay>.trycloudflare.com/even` | Even page's **Forward endpoint** |
| `https://<wingman>.trycloudflare.com/mobile` | Phone's fake incoming-call page |

Enable **Forward events**, leave **No-CORS** off, and save. Open the fake-call
page first and tap **Enable ringtone** once: mobile browsers require that user
gesture before a later ring event can play audio. A physical R1 click or swipe
then follows `Even → public relay → local Wingman → public mobile page` and
the page enters its ringing state after the configured delay.

Quick tunnels are public and short-lived. Do not put Photon credentials in the
Even page, and stop both tunnel processes after the demo. For a production
deployment, use authenticated named tunnels and protect the event endpoint.

## Pack for distribution

```bash
npm run build
npm run pack
```

Produces an `.ehpk` file.

## What's in here

| File | Purpose |
|---|---|
| `index.html` | WebView host. Viewport meta tag locks zoom; CSS kills iOS double-tap zoom + rubber-band scroll. |
| `src/main.ts` | R1/G2 event logger, gesture recognizer, context collector, and webhook forwarder. |
| `tools/relay-server.mjs` | Local CORS relay for forwarding phone events to hardware. |
| `app.json` | Even Hub manifest. No permissions by default. |
| `tsconfig.json` | Standard Vite vanilla-ts config. |
| `vite.config.ts` | Dev server on port 5173, host binding for LAN QR access. |
