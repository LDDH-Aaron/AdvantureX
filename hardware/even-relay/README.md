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

Run the Mac relay server:

```bash
npm run relay
```

On the phone console page, set the forward endpoint to:

```text
http://<your-mac-ip>:8787/even
```

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
FORWARD_URL=http://192.168.1.50/gesture npm run relay
```

If posting directly from the phone to a microcontroller that cannot return CORS headers, enable `No-CORS fire-and-forget` in the page. The request body is still JSON, but it is sent as `text/plain` so simple hardware endpoints can receive it.

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
