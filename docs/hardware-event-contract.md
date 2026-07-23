# Hardware event contract

Hardware does not send messages or make calls directly. It reports a simple
intent to the Wingman backend, which owns consent, message identity, logging,
and the web-call sequence.

## Endpoint

```http
POST /api/v1/events/zilo
Content-Type: application/json
X-Wingman-Key: <device gateway key, when enabled>
```

```json
{
  "kind": "double_tap",
  "device_id": "ring-prototype-01"
}
```

Supported `kind` values:

- `double_tap` — start the configured rescue flow.
- `long_press` — reserve for an on-device assistant action.
- `voice` — attach a short `transcript` string.

The production device should call a local gateway or authenticated HTTPS backend;
it must not embed Photon credentials. For local testing, start the FastAPI service
and send the JSON above to `http://<Mac-LAN-IP>:8000`.

## Demo behavior

The published web demo uses a restricted endpoint instead: it sends one
server-configured iMessage text to one server-configured recipient, then switches
the browser to an incoming-call state. This is intentionally separate from the
general hardware endpoint.
