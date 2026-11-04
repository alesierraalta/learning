#!/usr/bin/env python3
"""Synthesise an audio spec's turns with edge-tts, one mp3 + boundaries per turn.

The cache key is the hash of voice, rate and the exact text, identical to
`turnKey` in lib/timeline.mjs, so editing one line re-synthesises one turn and
the renderer can refuse a take whose words no longer match the spec.

    python3 synth.py --spec parts/parte1-debate.json --out ~/.cache/learning-audio/parte1-debate
"""
import argparse
import asyncio
import hashlib
import json
import os
import sys

VOICES = {"Alvaro": "es-ES-AlvaroNeural", "Elvira": "es-ES-ElviraNeural"}
RATE = "-4%"
DEFAULT_VOICES = {
    "debate": {"A": "Alvaro", "B": "Elvira"},
    "entrevista": {"A": "Elvira", "B": "Alvaro"},
    "charla": {"A": "Alvaro", "B": "Elvira"},
    "formal": {"A": "Alvaro"},
}


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
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            boundaries.append({"t": round(chunk["offset"] / 1e7, 3), "d": round(chunk["duration"] / 1e7, 3), "w": chunk["text"]})
    if not audio:
        raise RuntimeError(f"edge-tts returned no audio for {key} ({voice})")
    if not boundaries:
        raise RuntimeError(f"edge-tts returned no word boundaries for {key}; captions and anchoring need them")
    temporary = f"{mp3}.part"
    try:
        with open(temporary, "wb") as handle:
            handle.write(audio)
        os.replace(temporary, mp3)
        with open(meta, "w", encoding="utf-8") as handle:
            json.dump({"key": key, "voice": voice, "rate": rate, "text": text, "boundaries": boundaries}, handle, ensure_ascii=False)
    except OSError as error:
        if os.path.exists(temporary):
            os.unlink(temporary)
        raise RuntimeError(f"cannot write the recording for {key} in {out}: {error}") from error
    return "new"


async def main() -> int:
    parser = argparse.ArgumentParser(description="Synthesise an audio spec with edge-tts.")
    parser.add_argument("--spec", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--rate", default=RATE)
    parser.add_argument("--force", action="store_true", help="re-synthesise even when the cache matches")
    parser.add_argument("--dry-run", action="store_true", help="list the turns without calling the network")
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

    planned = list(turns(spec, args.rate))
    if args.dry_run:
        print(f"{len(planned)} turn(s) -> {args.out}")
        for key, voice, _ in planned:
            print(f"  {key} {voice}")
        return 0

    counts = {"new": 0, "kept": 0}
    for index, (key, voice, text) in enumerate(planned, 1):
        try:
            state = await synthesise(edge_tts, key, voice, text, args.rate, args.out, args.force)
        except Exception as error:  # edge-tts raises network and service errors; stop and keep the cache
            print(f"[{index}/{len(planned)}] failed {key} {voice}: {error}", file=sys.stderr)
            print(f"{counts['new']} new, {counts['kept']} kept before the failure", file=sys.stderr)
            return 1
        counts[state] += 1
        print(f"[{index}/{len(planned)}] {state:4} {key} {voice}", flush=True)
    print(f"{counts['new']} new, {counts['kept']} kept, {len(planned)} total")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
