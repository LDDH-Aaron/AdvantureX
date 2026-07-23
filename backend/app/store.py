import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from .models import EventLog, Rescue, Status


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


class Store:
    def __init__(self, path: str):
        Path(path).parent.mkdir(parents=True, exist_ok=True) if Path(path).parent != Path(".") else None
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.lock = Lock()
        with self.lock:
            self.db.executescript("""
              CREATE TABLE IF NOT EXISTS rescues (
                id TEXT PRIMARY KEY, recipient TEXT NOT NULL, delay_seconds INTEGER NOT NULL,
                message TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL,
                created_at TEXT NOT NULL, execute_at TEXT NOT NULL, completed_at TEXT, error TEXT
              );
              CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT, rescue_id TEXT, event_type TEXT NOT NULL,
                detail TEXT NOT NULL, created_at TEXT NOT NULL
              );
            """)
            self.db.commit()

    def _rescue(self, row: sqlite3.Row) -> Rescue:
        values = dict(row)
        for field in ("created_at", "execute_at", "completed_at"):
            if values[field]:
                values[field] = datetime.fromisoformat(values[field])
        return Rescue(**values)

    def add_rescue(self, rescue: Rescue) -> None:
        with self.lock:
            self.db.execute("""INSERT INTO rescues VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", (
                rescue.id, rescue.recipient, rescue.delay_seconds, rescue.message, rescue.source,
                rescue.status.value, iso(rescue.created_at), iso(rescue.execute_at),
                iso(rescue.completed_at) if rescue.completed_at else None, rescue.error,
            ))
            self.db.commit()

    def get_rescue(self, rescue_id: str) -> Rescue | None:
        with self.lock:
            row = self.db.execute("SELECT * FROM rescues WHERE id = ?", (rescue_id,)).fetchone()
        return self._rescue(row) if row else None

    def list_rescues(self, limit: int = 40) -> list[Rescue]:
        with self.lock:
            rows = self.db.execute("SELECT * FROM rescues ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        return [self._rescue(row) for row in rows]

    def list_pending(self) -> list[Rescue]:
        with self.lock:
            rows = self.db.execute("SELECT * FROM rescues WHERE status = 'scheduled'").fetchall()
        return [self._rescue(row) for row in rows]

    def update_status(self, rescue_id: str, status: Status, error: str | None = None) -> Rescue | None:
        completed = iso(now()) if status in (Status.completed, Status.cancelled, Status.failed) else None
        with self.lock:
            self.db.execute("UPDATE rescues SET status = ?, completed_at = COALESCE(?, completed_at), error = ? WHERE id = ?", (status.value, completed, error, rescue_id))
            self.db.commit()
        return self.get_rescue(rescue_id)

    def reschedule(self, rescue_id: str, delay_seconds: int) -> Rescue | None:
        execute_at = now().timestamp() + delay_seconds
        value = datetime.fromtimestamp(execute_at, tz=timezone.utc)
        with self.lock:
            self.db.execute("UPDATE rescues SET delay_seconds = ?, execute_at = ? WHERE id = ? AND status = 'scheduled'", (delay_seconds, iso(value), rescue_id))
            self.db.commit()
        return self.get_rescue(rescue_id)

    def log(self, event_type: str, detail: str, rescue_id: str | None = None) -> None:
        with self.lock:
            self.db.execute("INSERT INTO events (rescue_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)", (rescue_id, event_type, detail, iso(now())))
            self.db.commit()

    def list_events(self, limit: int = 100) -> list[EventLog]:
        with self.lock:
            rows = self.db.execute("SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [EventLog(**{**dict(row), "created_at": datetime.fromisoformat(row["created_at"])}) for row in rows]
