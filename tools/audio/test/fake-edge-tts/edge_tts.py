"""A local stand-in for edge-tts: no network, deterministic bytes, and a trace.

The suite puts this directory on `PYTHONPATH`, so `synth.py` imports this module
instead of the real service. Every stream appends a line to `SYNTH_FAKE_TRACE`
when it starts and when it ends, which is what lets a test prove that two turns
were in flight at the same time — and what makes a real voice unnecessary.

Environment:
  SYNTH_FAKE_TRACE       append one JSON line per stream event
  SYNTH_FAKE_DELAY       seconds a whole stream takes (default 0.2)
  SYNTH_FAKE_CHUNKS      audio chunks per stream (default 4)
  SYNTH_FAKE_SIZE        bytes of audio per stream (default 32: a real turn is
                         ~100 kB, a big payload only widens the window in which
                         two processes would collide on one cache file)
  SYNTH_FAKE_FAIL_ON     text fragment whose stream dies mid-way (network error)
  SYNTH_FAKE_RATE_LIMIT  text fragment whose stream answers 429

The audio is a hash of the voice, the rate and the words, so the same turn is
always the same bytes: a concurrent run and a sequential run must be identical.
"""
import asyncio
import hashlib
import json
import os
import time

DELAY = float(os.environ.get("SYNTH_FAKE_DELAY", "0.2"))
CHUNKS = int(os.environ.get("SYNTH_FAKE_CHUNKS", "4"))
FAIL_ON = os.environ.get("SYNTH_FAKE_FAIL_ON") or None
SIZE = int(os.environ.get("SYNTH_FAKE_SIZE", "0"))
RATE_LIMIT = os.environ.get("SYNTH_FAKE_RATE_LIMIT") or None

TICKS = 1e7  # edge-tts reports boundaries in 100 ns units


def trace(event: str, text: str, voice: str) -> None:
    path = os.environ.get("SYNTH_FAKE_TRACE")
    if not path:
        return
    line = json.dumps({"event": event, "voice": voice, "text": text, "pid": os.getpid(), "at": time.monotonic()})
    handle = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
    try:
        os.write(handle, (line + "\n").encode())
    finally:
        os.close(handle)


class RateLimited(Exception):
    """What edge-tts surfaces when the endpoint answers 429 Too Many Requests."""


class Communicate:
    def __init__(self, text, voice, rate="+0%", boundary="SentenceBoundary", **_ignored):
        self.text = text
        self.voice = voice
        self.rate = rate

    async def stream(self):
        trace("start", self.text, self.voice)
        if RATE_LIMIT and RATE_LIMIT in self.text:
            trace("limited", self.text, self.voice)
            raise RateLimited("HTTP 429 Too Many Requests")
        if FAIL_ON and FAIL_ON in self.text:
            yield {"type": "audio", "data": b"\x00" * 16}
            await asyncio.sleep(DELAY / CHUNKS)
            trace("fail", self.text, self.voice)
            raise ConnectionResetError("connection reset by peer")
        seed = hashlib.sha256(f"{self.voice}|{self.rate}|{self.text}".encode()).digest()
        if SIZE:
            seed *= (SIZE // len(seed) + 1)
        for _ in range(CHUNKS):
            await asyncio.sleep(DELAY / CHUNKS)
            yield {"type": "audio", "data": seed}
        for position, word in enumerate(self.text.split()):
            yield {"type": "WordBoundary", "offset": int(position * 0.4 * TICKS), "duration": int(0.4 * TICKS), "text": word}
        trace("end", self.text, self.voice)
