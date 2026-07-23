import asyncio
from html import escape
import httpx
from .config import Settings


class PhotonAdapter:
    """Delivery is live only when the local Spectrum bridge is configured."""
    def __init__(self, settings: Settings):
        self.settings = settings

    @property
    def live(self) -> bool:
        return bool(self.settings.photon_bridge_url and self.settings.wingman_shared_secret)

    async def send(self, recipient: str, message: str) -> dict:
        if not self.live:
            await asyncio.sleep(0.15)
            return {"mode": "demo", "message_id": "simulated"}
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{self.settings.photon_bridge_url.rstrip('/')}/send",
                headers={"X-Wingman-Secret": self.settings.wingman_shared_secret},
                json={"to": recipient, "text": message},
            )
            response.raise_for_status()
            return response.json()


class PhoneAdapter:
    def __init__(self, settings: Settings):
        self.settings = settings

    @property
    def enabled(self) -> bool:
        return all((self.settings.twilio_account_sid, self.settings.twilio_auth_token,
                    self.settings.twilio_from_number, self.settings.user_phone_number,
                    self.settings.call_audio_url))

    async def call_user(self) -> str:
        if not self.enabled:
            raise RuntimeError("Calling is not configured. Set Twilio credentials, USER_PHONE_NUMBER, and a public CALL_AUDIO_URL first.")
        if not self.settings.call_audio_url.startswith("https://"):
            raise RuntimeError("CALL_AUDIO_URL must be a public HTTPS URL that Twilio can fetch.")
        # Twilio SDK is synchronous; run it off the event loop.
        def place_call() -> str:
            from twilio.rest import Client
            client = Client(self.settings.twilio_account_sid, self.settings.twilio_auth_token)
            audio_url = escape(self.settings.call_audio_url, quote=True)
            call = client.calls.create(
                to=self.settings.user_phone_number,
                from_=self.settings.twilio_from_number,
                twiml=f"<Response><Play>{audio_url}</Play></Response>",
            )
            return call.sid
        return await asyncio.to_thread(place_call)
