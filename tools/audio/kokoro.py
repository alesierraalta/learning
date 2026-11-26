#!/usr/bin/env python3
"""Synthesise an audio spec's turns with the free, offline Kokoro engine.

The cache is the one render.mjs already reads: <key>.mp3 and <key>.json per
turn, keyed by voice, rate and exact text as in synth.py. edge-tts stays the
default; this is the local alternative for the voices the learner picked.

    python3 tools/audio/kokoro.py --spec <spec.json> --out <cache dir>

Kokoro gives no word timings. The JSON says so in `boundaries_source`: the
boundaries are spread over the measured duration by word count, not measured.
"""
import argparse
import json
import math
import os
import re
import subprocess
import sys
import tempfile

from synth import DEFAULT_VOICES, RATE, turns

# The Spanish voices that work with KPipeline(lang_code="e"). The spec may name
# one of these per speaker; the table is also the allowlist.
VOICES = {"ef_dora": "ef_dora", "em_alex": "em_alex", "em_santa": "em_santa"}
ACCEPTED = ", ".join(VOICES)
DEFAULT_PYTHON = os.path.expanduser("~/.cache/kokoro-venv/bin/python")
# Kokoro ships quiet (about -28 LUFS); lift each take towards the renderer's
# -16 LUFS target so the rendered file still passes its level gate.
TARGET_LUFS = -16.0

# Run in the venv that owns Kokoro, so this script itself needs no ML packages.
WORKER = """
import sys
import numpy as np
import soundfile as sf
from kokoro import KPipeline

voice, text, wav = sys.argv[1:4]
pipe = KPipeline(lang_code="e")
parts = [result.audio.cpu().numpy() for result in pipe(text, voice=voice) if result.audio is not None]
if not parts:
    raise RuntimeError("kokoro returned no audio")
sf.write(wav, np.concatenate(parts), 24000)
"""


def declared_voices(spec: dict) -> set:
    declared = spec.get("voices") or DEFAULT_VOICES[spec["style"]]
    return set(declared.values())


def estimate_boundaries(text: str, duration: float) -> list:
    """Spread the turn's words over its measured audio; Kokoro has no timings.

    Millisecond endpoints make the last boundary end exactly where the recording
    ends after rounding, and keep every earlier boundary before it.
    """
    words = text.split()
    if not words:
        return []
    total = round(duration * 1000)
    boundaries = []
    previous = 0
    for index, word in enumerate(words, 1):
        end = round(total * index / len(words))
        boundaries.append({"t": round(previous / 1000, 3), "d": round((end - previous) / 1000, 3), "w": word})
        previous = end
    return boundaries


def synth_wav(python: str, voice: str, text: str, wav: str) -> None:
    result = subprocess.run([python, "-c", WORKER, voice, text, wav], capture_output=True, text=True)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"kokoro failed for {voice}: {detail}")


def loudness(wav: str) -> float | None:
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", wav, "-af", "ebur128", "-f", "null", "-"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg could not measure {wav}: {result.stderr.strip()}")
    summary = result.stderr[result.stderr.rfind("Summary:"):]
    found = re.search(r"I:\s*(-\d+(?:\.\d+)?)\s*LUFS", summary)
    return float(found.group(1)) if found else None  # digital silence has no I


def encode_mp3(wav: str, mp3: str) -> None:
    measured = loudness(wav)
    args = ["ffmpeg", "-y", "-loglevel", "error", "-i", wav]
    if measured is not None:
        # A limiter keeps the lift from clipping a loud take.
        args += ["-af", f"volume={round(TARGET_LUFS - measured, 1)}dB,alimiter=limit=0.708"]
    args += ["-ar", "24000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "48k", mp3]
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg could not encode {mp3}: {result.stderr.strip()}")


def duration(mp3: str) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", mp3],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe could not measure {mp3}: {result.stderr.strip()}")
    seconds = float(result.stdout.strip())
    if not math.isfinite(seconds) or seconds <= 0:
        raise RuntimeError(f"{mp3} has no measurable duration")
    return seconds


def synthesise(python: str, key: str, voice: str, text: str, out: str, force: bool, work: str) -> str:
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

    wav = os.path.join(work, f"{key}.wav")
    synth_wav(python, voice, text, wav)
    encode_mp3(wav, mp3)
    boundaries = estimate_boundaries(text, duration(mp3))
    # `rate` is the shared cache-key constant; Kokoro speaks at its own pace.
    written = {
        "key": key,
        "voice": voice,
        "rate": RATE,
        "text": text,
        "boundaries": boundaries,
        "boundaries_source": "estimated:proportional word count, not Kokoro word timings",
    }
    temporary = f"{meta}.part"
    try:
        with open(temporary, "w", encoding="utf-8") as handle:
            json.dump(written, handle, ensure_ascii=False)
        os.replace(temporary, meta)
    except OSError as error:
        if os.path.exists(temporary):
            os.unlink(temporary)
        raise RuntimeError(f"cannot write the boundaries for {key} in {out}: {error}") from error
    return "new"


def main() -> int:
    parser = argparse.ArgumentParser(description="Synthesise an audio spec with free, offline Kokoro voices.")
    parser.add_argument("--spec", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--force", action="store_true", help="re-synthesise even when the cache matches")
    parser.add_argument("--dry-run", action="store_true", help="list the turns without synthesising")
    parser.add_argument("--python", default=os.environ.get("KOKORO_PYTHON", DEFAULT_PYTHON), help="interpreter with kokoro and soundfile")
    args = parser.parse_args()

    try:
        with open(args.spec, encoding="utf-8") as handle:
            spec = json.load(handle)
    except (OSError, json.JSONDecodeError) as error:
        print(f"cannot prepare {args.spec}: {error}", file=sys.stderr)
        return 2

    unknown = sorted(declared_voices(spec) - VOICES.keys())
    if unknown:
        print(f"unknown voice(s) {', '.join(unknown)}; accepted: {ACCEPTED}", file=sys.stderr)
        return 2

    planned = list(turns(spec, RATE, VOICES))
    if args.dry_run:
        print(f"{len(planned)} turn(s) -> {args.out}")
        for key, voice, _ in planned:
            print(f"  {key} {voice}")
        return 0

    try:
        os.makedirs(args.out, exist_ok=True)
    except OSError as error:
        print(f"cannot prepare {args.out}: {error}", file=sys.stderr)
        return 2
    counts = {"new": 0, "kept": 0}
    with tempfile.TemporaryDirectory(prefix="kokoro-") as work:
        for index, (key, voice, text) in enumerate(planned, 1):
            try:
                state = synthesise(args.python, key, voice, text, args.out, args.force, work)
            except Exception as error:  # stop at the first failure and keep the cache
                print(f"[{index}/{len(planned)}] failed {key} {voice}: {error}", file=sys.stderr)
                print(f"{counts['new']} new, {counts['kept']} kept before the failure", file=sys.stderr)
                return 1
            counts[state] += 1
            print(f"[{index}/{len(planned)}] {state:4} {key} {voice}", flush=True)
    print(f"{counts['new']} new, {counts['kept']} kept, {len(planned)} total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
