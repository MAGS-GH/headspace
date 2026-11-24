"""Build Pebble's offline voice pack from the local Danish CoRal Røst checkpoint."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import random
import re
import subprocess
import tempfile
import wave

import numpy as np


ROOT = Path(__file__).resolve().parent.parent
SHORT_CLIPS = {
    "greeting": "Hej med dig. Skal vi tage en lille pause sammen?",
    "welcome": "Lad skuldrene hvile. Vi tager det i dit tempo.",
    "little-stone": "Selv en sten som mig kan godt lide en lille pause.",
    "inhale": "Træk vejret ind.",
    "exhale": "Pust langsomt ud.",
    "pause": "Vi holder en lille pause.",
    "complete": "Tak for stunden. Tag roen med dig.",
}
MODEL_ID = "CoRal-project/roest-v3-chatterbox-500m"
REVISION = "7ce205cea6b3b36d9f60f18abb88ff21fa04ea0d"
CHECKPOINT_HASHES = {
    "t3_mtl23ls_v2.safetensors": "8ba307c4590b8e046369f225aae79fbc22633427a37e6e90f887d764447fc2f6",
    "ve.pt": "4b16d836bc598509860f6fa068165a8bb5e9ac84f05582dfcf278a5a372879f1",
    "s3gen.pt": "9b9ff07e60b20c136e2b1b3d7563a24604e8d2c4c267888d1ee929dd0151d2a3",
    "conds.pt": "6552d70568833628ba019c6b03459e77fe71ca197d5c560cef9411bee9d87f4e",
    "grapheme_mtl_merged_expanded_v1.json": "df81a7ca7c31796cbe97f7a7142d5a53b12e88e12417ebe98f66602cafaf0461",
}
PROFILE = dict(language_id="da", temperature=0.6, cfg_weight=0.5,
               exaggeration=0.5, repetition_penalty=2.0, top_p=0.95)
RATE = 24000
# These readings were selected with a pause between the title and each instruction.
SENTENCE_CLIPS = {"kropsscanning-0", "et-roligt-oejeblik-0", "lette-skuldre-0"}


def sha256(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def clip_catalog():
    # Read the displayed cue texts from the app so audio and captions share a script.
    export = "import { exercises } from './src/coach.ts'; console.log(JSON.stringify(exercises))"
    result = subprocess.run(
        ["node", "--experimental-strip-types", "--input-type=module", "-e", export],
        cwd=ROOT, capture_output=True, encoding="utf-8", check=True,
    )
    clips = {name: (text, 30) for name, text in SHORT_CLIPS.items()}
    for exercise in json.loads(result.stdout):
        if pattern := exercise.get("breath"):
            for name in ("inhale", "exhale"):
                clips[name] = (SHORT_CLIPS[name], min(clips[name][1], pattern[name]))
        else:
            interval = min(exercise["durations"]) * 60 / len(exercise["steps"])
            for index, step in enumerate(exercise["steps"]):
                clips[f"{exercise['id']}-{index}"] = (f"{step['title']}. {step['instruction']}", interval)
    return clips


def load_model(directory, device):
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    import torch
    import perth
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    if perth.PerthImplicitWatermarker is None:
        raise RuntimeError("Install the Perth watermarking dependencies before generating audio.")
    torch.set_num_threads(4)
    return ChatterboxMultilingualTTS.from_local(directory, device=device)


def generate(model, text, seed):
    import torch

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    with torch.inference_mode():
        wav = model.generate(text, **PROFILE)
    samples = wav.detach().cpu().numpy().squeeze()
    if model.sr != RATE or samples.ndim != 1 or not samples.size or not np.isfinite(samples).all():
        raise ValueError(f"Invalid Røst output for {text!r}")
    return samples


def save_raw(model, spec, path):
    import soundfile as sf

    if "sentences" in spec:
        parts = []
        for index, sentence in enumerate(spec["sentences"], start=1):
            part = path.with_suffix(f".s{index}.wav")
            part_spec = {key: spec[key] for key in ("model", "revision", "profile")}
            part_spec.update(sentence)
            if not cache_matches(part, part_spec):
                save_raw(model, part_spec, part)
            samples, _ = sf.read(part, dtype="float32")
            if parts:
                parts.append(np.zeros(RATE * spec["gapMs"] // 1000, dtype=np.float32))
            parts.append(samples[speech_range(samples)])
        samples = np.concatenate(parts)
    else:
        samples = generate(model, spec["text"], spec["seed"])
    tmp = path.with_suffix(".tmp.wav")
    sf.write(tmp, samples, RATE, subtype="PCM_16")
    tmp.replace(path)
    path.with_suffix(".json").write_text(json.dumps({**spec, "sha256": sha256(path)},
                                         ensure_ascii=False), encoding="utf-8")


def clip_seed(label):
    return int.from_bytes(hashlib.sha256(label.encode()).digest()[:4], "big")


def raw_spec(name, text, take=1, split=False):
    label = name if take == 1 else f"{name}:{take}"
    spec = dict(model=MODEL_ID, revision=REVISION, profile=PROFILE, text=text, seed=clip_seed(label))
    if split:
        sentences = re.split(r"(?<=[.!?])\s+", text)
        spec["sentences"] = [dict(text=sentence, seed=clip_seed(f"{label}:s{i}"))
                             for i, sentence in enumerate(sentences, start=1)]
        spec["gapMs"] = 250
    return spec


def cache_matches(path, spec):
    try:
        receipt = json.loads(path.with_suffix(".json").read_text(encoding="utf-8"))
        return receipt == {**spec, "sha256": sha256(path)}
    except (FileNotFoundError, ValueError):
        return False


def speech_range(samples):
    # Remove only silence at the very ends. Preserve internal pauses and quiet consonants.
    block = RATE // 100
    padded = np.pad(samples, (0, (-len(samples)) % block))
    rms = np.sqrt(np.mean(padded.reshape(-1, block) ** 2, axis=1))
    voiced = np.flatnonzero(rms > 10 ** (-48 / 20))
    if voiced.size == 0:
        raise ValueError("No audible speech in model output")
    start = max(0, (voiced[0] - 7) * block)
    stop = min(len(samples), (voiced[-1] + 13) * block)
    return slice(start, stop)


def encode_clip(source, output, max_seconds, guide_text=None):
    with wave.open(str(source), "rb") as wav:
        if (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) != (RATE, 1, 2):
            raise ValueError(f"Expected mono PCM16 at 24 kHz: {source.name}")
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2")
    pcm = samples[speech_range(samples.astype(float) / 32768)]
    seconds = len(pcm) / RATE
    if seconds >= max_seconds - 0.15:
        raise ValueError(f"{source.name} would overrun its {max_seconds:g} second cue")
    filters = ["highpass=f=60"]
    if guide_text:
        # Give fast instructions a little more time, keeping pitch and the next cue intact.
        desired = min(len(guide_text.split()) * 60 / 165, max_seconds - 0.15)
        tempo = max(0.8, min(1.0, seconds / desired))
        if tempo < 1:
            filters.append(f"atempo={tempo:.4f}")
    filters.append("loudnorm=I=-20:TP=-2:LRA=7")
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "s16le", "-ar", str(RATE), "-ac", "1", "-i", "-",
        "-af", ",".join(filters), "-ar", str(RATE),
        "-ac", "1", "-c:a", "libmp3lame", "-b:a", "80k", "-map_metadata", "-1", str(output),
    ], input=pcm.tobytes(), check=True)


def write_mouth_index(output, sources):
    # Decode the shipped MP3, including the same gapless playback timing used by browsers.
    # RMS is measured over 80 ms, gated below -48 dB, and scaled to the individual clip.
    step_ms = 80
    shapes = {}
    for name, path in sources.items():
        decoded = subprocess.check_output([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
            "-ar", "16000", "-ac", "1", "-f", "f32le", "-",
        ])
        audio = np.frombuffer(decoded, dtype="<f4").astype(np.float64)
        chunk_size = 16000 * step_ms // 1000
        frames = np.pad(audio, (0, (-len(audio)) % chunk_size)).reshape(-1, chunk_size)
        rms = np.sqrt(np.mean(frames * frames, axis=1))
        gate = 10 ** (-48 / 20)
        ceiling = max(float(np.percentile(rms, 93)), gate * 2)
        openness = np.clip((rms - gate) / (ceiling - gate), 0, 1) ** 0.70
        shapes[name] = "".join(str(n) for n in np.rint(openness * 9).astype(int))
    data = {"stepMs": step_ms, "clips": shapes}
    (output / "mouth.json").write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True, type=Path, help="Local Røst checkpoint directory")
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--raw-dir", type=Path, help="Reusable directory for raw WAVs and their receipts")
    parser.add_argument("--output", type=Path, default=ROOT / "public" / "voice")
    parser.add_argument("--clip", help="Build one clip in a preview directory or an existing pack")
    parser.add_argument("--take", type=int, help="Audition a different numbered take of a single clip")
    parser.add_argument("--split", action="store_true", help="Audition a clip one sentence at a time")
    args = parser.parse_args()
    clips = clip_catalog()
    if args.clip and args.clip not in clips:
        parser.error(f"Unknown clip: {args.clip}")
    if args.take is not None and (not args.clip or args.take < 1):
        parser.error("--take requires --clip and a positive take number")
    if args.split and not args.clip:
        parser.error("--split requires --clip")
    for filename, digest in CHECKPOINT_HASHES.items():
        path = args.model / filename
        if not path.is_file() or sha256(path) != digest:
            parser.error(f"Expected {MODEL_ID} at revision {REVISION}: {path}")
    args.output.mkdir(parents=True, exist_ok=True)
    # Stage the whole batch so a failed model call or encoding error keeps the working pack intact.
    with tempfile.TemporaryDirectory(dir=args.output.parent) as temp:
        staging = Path(temp)
        raw_dir = args.raw_dir or staging / "raw"
        raw_dir.mkdir(parents=True, exist_ok=True)
        model = None
        sources = {}
        for name, (text, max_seconds) in clips.items():
            if args.clip and args.clip != name:
                old = args.output / (name + ".mp3")
                if old.is_file():
                    sources[name] = old
                continue
            raw = raw_dir / (name + ".wav")
            spec = raw_spec(name, text, args.take or 1, args.split or name in SENTENCE_CLIPS)
            if not cache_matches(raw, spec):
                if model is None:
                    model = load_model(args.model, args.device)
                save_raw(model, spec, raw)
            path = staging / (name + ".mp3")
            encode_clip(raw, path, max_seconds, guide_text=None if name in SHORT_CLIPS else text)
            sources[name] = path
            print(name, flush=True)
        write_mouth_index(staging, sources)
        for path in staging.glob("*.mp3"):
            path.replace(args.output / path.name)
        (staging / "mouth.json").replace(args.output / "mouth.json")


if __name__ == "__main__":
    main()
