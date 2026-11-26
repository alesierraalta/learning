#!/usr/bin/env python3
"""Synthesise an audio spec's turns with edge-tts, one mp3 + boundaries per turn.

The cache key is the hash of voice, rate and the exact text, identical to
`turnKey` in lib/timeline.mjs, so editing one line re-synthesises one turn and
the renderer can refuse a take whose words no longer match the spec.

Turns are independent of each other, and almost all of a turn is spent waiting
for the service, so a bounded pool keeps several in flight. The files, their
names and the order the log lists them in do not change: `--concurrency 1` is
the old sequential path, kept as the reference it is measured against.

    python3 synth.py --spec parts/parte1-debate.json --out ~/.cache/learning-audio/parte1-debate
"""
import argparse
import asyncio
import hashlib
import json
import os
import re
import sys
import tempfile

VOICES = {"Alvaro": "es-ES-AlvaroNeural", "Elvira": "es-ES-ElviraNeural"}
RATE = "-4%"
DEFAULT_VOICES = {
    "debate": {"A": "Alvaro", "B": "Elvira"},
    "entrevista": {"A": "Elvira", "B": "Alvaro"},
    "charla": {"A": "Alvaro", "B": "Elvira"},
    "formal": {"A": "Alvaro"},
}
# Four in flight already hides the wait without asking the service for more than
# a small part of its capacity; a bigger pool only queues more sockets.
DEFAULT_CONCURRENCY = 4
# A rate limited endpoint is not hammered: two retries with a growing pause, then
# the run stops and says so. Nothing is retried forever.
MAX_ATTEMPTS = 3
RETRY_PAUSE_SECONDS = 1.0
RETRY_PAUSE_CAP = 4.0
RATE_LIMIT_HINT = re.compile(r"\b429\b|too many requests|rate.?limit|throttl", re.IGNORECASE)


def turn_key(voice: str, text: str, rate: str) -> str:
    return hashlib.sha256(f"{voice}|{rate}|{text}".encode()).hexdigest()[:16]


def turns(spec: dict, rate: str):
    declared = spec.get("voices") or DEFAULT_VOICES[spec["style"]]
    seen = set()
    for chapter in spec["chapters"]:
        for segment in chapter["segments"]:
            name = declared[segment["speaker"]]
            voice = VOICES.get(name, name)
            text = segment["text"]
            key = turn_key(voice, text, rate)
            if key in seen:
                continue
            seen.add(key)
            yield key, voice, text


def communicator(edge_tts, text: str, voice: str, rate: str):
    """Ask for word boundaries: 7.x would otherwise stream sentence ones.

    The transcript and every cue are anchored on word timings, so a sentence
    boundary is not a substitute. edge-tts 6.x has no such keyword and always
    streams words, so a TypeError means the older, sufficient behaviour.
    """
    try:
        return edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    except TypeError:
        return edge_tts.Communicate(text, voice, rate=rate)


def atomic_write(path: str, payload: bytes) -> None:
    """Publish a cache file whole or not at all.

    The temporary name carries the pid, so two synthesisers racing on the same
    key never share a partial file, and the rename is what makes a reader see
    either the previous take or the new one — never half of either. A crash
    leaves a `*.part` nobody reads, which is why the cache is keyed by name.
    """
    handle, temporary = tempfile.mkstemp(dir=os.path.dirname(path) or ".", prefix=f"{os.path.basename(path)}.", suffix=".part")
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except BaseException:
        if os.path.exists(temporary):
            os.unlink(temporary)
        raise


async def synthesise(edge_tts, key: str, voice: str, text: str, rate: str, out: str, force: bool) -> str:
    mp3 = os.path.join(out, f"{key}.mp3")
    meta = os.path.join(out, f"{key}.json")
    if not force and os.path.exists(mp3) and os.path.exists(meta):
        try:
            with open(meta, encoding="utf-8") as handle:
                written = json.load(handle)
            if written.get("text") == text and written.get("voice") == voice:
                return "kept"
        except (OSError, json.JSONDecodeError):
            pass
    boundaries = []
    audio = bytearray()
    communicate = communicator(edge_tts, text, voice, rate)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            boundaries.append({"t": round(chunk["offset"] / 1e7, 3), "d": round(chunk["duration"] / 1e7, 3), "w": chunk["text"]})
    if not audio:
        raise RuntimeError(f"edge-tts returned no audio for {key} ({voice})")
    if not boundaries:
        raise RuntimeError(
            f"edge-tts returned no word boundaries for {key}: the transcript is built from word "
            f"timings, so check that this edge-tts version honours boundary=\"WordBoundary\""
        )
    record = {"key": key, "voice": voice, "rate": rate, "text": text, "boundaries": boundaries}
    try:
        atomic_write(mp3, bytes(audio))
        atomic_write(meta, json.dumps(record, ensure_ascii=False).encode("utf-8"))
    except OSError as error:
        raise RuntimeError(f"cannot write the recording for {key} in {out}: {error}") from error
    return "new"


def is_rate_limited(error: BaseException) -> bool:
    """Whether the service asked us to slow down.

    edge-tts wraps the HTTP status inside whatever aiohttp raised, so the status
    is not reliably an attribute: the message is the dependable signal.
    """
    for candidate in (error, error.__cause__, getattr(error, "response", None)):
        status = getattr(candidate, "status", None) or getattr(candidate, "status_code", None)
        if status == 429:
            return True
    return bool(RATE_LIMIT_HINT.search(str(error)))


async def synthesise_turn(edge_tts, key: str, voice: str, text: str, rate: str, out: str, force: bool, notice) -> str:
    attempt = 1
    while True:
        try:
            return await synthesise(edge_tts, key, voice, text, rate, out, force)
        except Exception as error:
            if not is_rate_limited(error) or attempt >= MAX_ATTEMPTS:
                raise
            pause = min(RETRY_PAUSE_SECONDS * 2 ** (attempt - 1), RETRY_PAUSE_CAP)
            notice(f"rate limited on {key} {voice}: retry {attempt}/{MAX_ATTEMPTS - 1} in {pause:.1f}s")
            await asyncio.sleep(pause)
            attempt += 1


async def synthesise_planned(edge_tts, planned, out: str, force: bool, concurrency: int, emit, notice):
    """Synthesise every planned turn with at most `concurrency` in flight.

    Results are announced in plan order whatever order they finish in, so the log
    reads exactly like the sequential run it replaces. The first failure stops
    new turns from starting and lets the ones already in flight finish, because
    their cache entries are complete and throwing them away would be work lost;
    the failure itself is reported once, by the caller.
    """
    total = len(planned)
    counts = {"new": 0, "kept": 0}
    finished: dict[int, tuple[str, str, str]] = {}
    failures: list[tuple[int, str, str, BaseException]] = []
    stopped = asyncio.Event()
    slots = asyncio.Semaphore(concurrency)
    next_to_announce = 1

    def announce() -> None:
        """Walk the plan forward, printing what finished and stepping over the failed.

        A turn that finished while the failure was being handled is announced too:
        it is in the cache, and a log that hid it would report less work kept than
        the cache actually holds. The sequential path has nothing left to announce,
        so its log stays exactly the one it printed before.
        """
        nonlocal next_to_announce
        while True:
            if next_to_announce in finished:
                state, key, voice = finished.pop(next_to_announce)
                counts[state] += 1
                emit(f"[{next_to_announce}/{total}] {state:4} {key} {voice}")
            elif next_to_announce not in {failure[0] for failure in failures}:
                return
            next_to_announce += 1

    async def one(index: int, key: str, voice: str, text: str) -> None:
        async with slots:
            if stopped.is_set():
                return
            try:
                state = await synthesise_turn(edge_tts, key, voice, text, RATE, out, force, notice)
            except Exception as error:  # edge-tts raises network and service errors; keep the cache
                failures.append((index, key, voice, error))
                stopped.set()
                return
            finished[index] = (state, key, voice)
            announce()

    await asyncio.gather(*(one(index, key, voice, text) for index, (key, voice, text) in enumerate(planned, 1)))
    announce()
    return counts, failures


def positive(text: str) -> int:
    try:
        value = int(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"{text} is not a number") from None
    if value < 1:
        raise argparse.ArgumentTypeError(f"{value} is not a positive number of turns")
    return value


async def main() -> int:
    parser = argparse.ArgumentParser(description="Synthesise an audio spec with edge-tts.")
    parser.add_argument("--spec", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--force", action="store_true", help="re-synthesise even when the cache matches")
    parser.add_argument("--dry-run", action="store_true", help="list the turns without calling the network")
    parser.add_argument(
        "--concurrency",
        type=positive,
        default=DEFAULT_CONCURRENCY,
        metavar="N",
        help=f"turns synthesised at once (default {DEFAULT_CONCURRENCY}; 1 is the sequential path)",
    )
    args = parser.parse_args()
    try:
        import edge_tts  # pyright: ignore[reportMissingImports]  # installed on the synthesis host
    except ImportError:
        print("edge-tts is not installed here: run this on the VPS with ~/learnings-video/.venv/bin/python", file=sys.stderr)
        return 2
    try:
        with open(args.spec, encoding="utf-8") as handle:
            spec = json.load(handle)
        os.makedirs(args.out, exist_ok=True)
    except (OSError, json.JSONDecodeError) as error:
        print(f"cannot prepare {args.spec}: {error}", file=sys.stderr)
        return 2

    planned = list(turns(spec, RATE))
    if args.dry_run:
        print(f"{len(planned)} turn(s) -> {args.out}")
        for key, voice, _ in planned:
            print(f"  {key} {voice}")
        return 0

    counts, failures = await synthesise_planned(
        edge_tts,
        planned,
        args.out,
        args.force,
        args.concurrency,
        emit=lambda line: print(line, flush=True),
        notice=lambda line: print(line, file=sys.stderr, flush=True),
    )
    if failures:
        index, key, voice, error = min(failures, key=lambda failure: failure[0])
        print(f"[{index}/{len(planned)}] failed {key} {voice}: {error}", file=sys.stderr)
        print(f"{counts['new']} new, {counts['kept']} kept before the failure", file=sys.stderr)
        if is_rate_limited(error):
            print(
                f"edge-tts still answered 429 after {MAX_ATTEMPTS} attempts: stopped instead of hammering it; "
                f"every finished turn is cached, so re-run once it recovers",
                file=sys.stderr,
            )
        return 1
    print(f"{counts['new']} new, {counts['kept']} kept, {len(planned)} total")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
