# Even R1 ring integration

The current R1 implementation lives in [`../even-relay`](../even-relay). It
uses the Even Hub phone bridge to forward R1 events to the Mac.

For the Wingman demo, use **R1 double-click**:

```text
R1 double-click → Mac relay :8788 → Wingman backend → iMessage
                → 10 seconds → web incoming call → 接听 → MP3
```

Keep future board-specific firmware, flashing notes, and tests in this folder.
