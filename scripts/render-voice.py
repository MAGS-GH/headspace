"""Render Åndehul's Danish voice clips using a local Piper model and FFmpeg."""

import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tempfile
import wave

import numpy as np
import onnxruntime
from piper import PiperVoice, SynthesisConfig


ROOT = Path(__file__).resolve().parent.parent
SHORT_CLIPS = {
    "greeting": "Hej med dig. Skal vi tage en lille pause sammen?",
    "welcome": "Lad skuldrene hvile. Vi tager det i dit tempo.",
    "little-stone": "Psst. Selv en sten som mig kan godt lide en lille pause.",
    "inhale": "Træk vejret ind.",
    "exhale": "Pust langsomt ud.",
    "pause": "Vi holder en lille pause.",
    "complete": "Tak for stunden. Tag roen med dig.",
}
MODEL_SHA256 = "b9271efd25f7b8494bbd28d48dd675c8c119daa284f3ee488008935f515f1241"
CONFIG_SHA256 = "89fe13bd251406cc0088570d103ea7ac35823211d8466faf913268ab8506f41b"


def exercise_scripts():
    # Read the displayed cue texts from the app so audio and captions share a script.
    export = "import { exercises } from './src/coach.ts'; console.log(JSON.stringify(exercises))"
    result = subprocess.run(
        ["node", "--experimental-strip-types", "--input-type=module", "-e", export],
        cwd=ROOT, capture_output=True, encoding="utf-8", check=True,
    )
    for exercise in json.loads(result.stdout):
        if not exercise.get("breath"):
            for index, step in enumerate(exercise["steps"]):
                yield f"{exercise['id']}-{index}", f"{step['title']}. {step['instruction']}"


def render(voice, config, text, output):
    rate = voice.config.sample_rate
    pause = bytes(round(rate * 0.22) * 2)
    with tempfile.TemporaryDirectory() as temp_dir:
        wav_path = Path(temp_dir, "clip.wav")
        with wave.open(str(wav_path), "wb") as dest:
            dest.setparams((1, 2, rate, 0, "NONE", "not compressed"))
            for index, sentence in enumerate(re.split(r"(?<=[.?!])\s+", text)):
                if index:
                    dest.writeframes(pause)
                raw = io.BytesIO()
                with wave.open(raw, "wb") as sample:
                    voice.synthesize_wav(sentence, sample, syn_config=config)
                raw.seek(0)
                with wave.open(raw, "rb") as sample:
                    dest.writeframes(sample.readframes(sample.getnframes()))
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_path),
            "-af", "highpass=f=60,loudnorm=I=-20:TP=-2:LRA=7",
            "-ar", str(rate), "-ac", "1", "-c:a", "libmp3lame", "-b:a", "56k",
            "-map_metadata", "-1", str(output),
        ], check=True)


def write_mouth_index(output, clips):
    # Decode the shipped MP3, including the same gapless playback timing used by browsers.
    # RMS is measured over 80 ms, gated below -48 dB, and scaled to the individual clip.
    step_ms = 80
    shapes = {}
    for name in clips:
        decoded = subprocess.check_output([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(output / (name + ".mp3")),
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
    parser.add_argument("model", type=Path, help="Path to da_DK-talesyntese-medium.onnx")
    parser.add_argument("--output", type=Path, default=ROOT / "public" / "voice")
    args = parser.parse_args()
    for path, digest in [(args.model, MODEL_SHA256), (Path(str(args.model) + ".json"), CONFIG_SHA256)]:
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            parser.error(f"Unexpected model or config file: {path}")
    args.output.mkdir(parents=True, exist_ok=True)
    onnxruntime.set_seed(17)
    voice = PiperVoice.load(args.model)
    style = SynthesisConfig(length_scale=1.12, noise_scale=0.58, noise_w_scale=0.66)
    clips = {**SHORT_CLIPS, **dict(exercise_scripts())}
    for name, script in clips.items():
        render(voice, style, script, args.output / (name + ".mp3"))
        print(name, flush=True)
    write_mouth_index(args.output, clips)


if __name__ == "__main__":
    main()
