import os
import re
import gc
import json
import math
import time
import shutil
import random
import tempfile
import traceback
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
import soundfile as sf
import torch
import ipywidgets as widgets
from IPython.display import display, Video, HTML, clear_output
from google.colab import files as colab_files

WORK_DIR = Path("/content/reelforge_cloud")
UPLOAD_DIR = WORK_DIR / "uploads"
OUTPUT_DIR = WORK_DIR / "output"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

WIDTH, HEIGHT, FPS = 720, 1280, 30
CROSSFADE = 0.32
SD_MODEL = "stable-diffusion-v1-5/stable-diffusion-v1-5"
MOTION_MODEL = "guoyww/animatediff-motion-adapter-v1-5-2"
DIRECTOR_MODEL = "Qwen/Qwen2.5-0.5B-Instruct"

def _is_hindi(text):
    return bool(re.search(r"[\u0900-\u097f]", str(text))) or bool(re.search(r"\bhindi\b", str(text), re.I))

def _upload_items(widget):
    value = widget.value
    if not value:
        return []
    if isinstance(value, dict):
        items = []
        for key, info in value.items():
            if isinstance(info, dict):
                items.append((info.get("name") or key, info.get("content")))
            else:
                items.append((key, info))
        return [(str(name), bytes(content)) for name, content in items if content is not None]
    items = []
    for info in value:
        if isinstance(info, dict) and info.get("content") is not None:
            items.append((str(info.get("name") or "upload.bin"), bytes(info["content"])))
    return items

def _safe_filename(name):
    name = Path(str(name)).name
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    return name[:100] or "media"

STATUS_WIDGET = None

def _progress(text):
    global STATUS_WIDGET
    if STATUS_WIDGET is not None:
        safe = str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        STATUS_WIDGET.value = f"<div style='padding:10px 12px;border-radius:10px;background:#202530;color:#f1e7d9;font:13px/1.5 system-ui'>{safe}</div>"


def _fallback_plan(prompt, duration):
    hindi = _is_hindi(prompt)
    if hindi:
        voice = "हर सफ़र अपने साथ कुछ यादें छोड़ जाता है। इन पलों को फिर से जीना ही इस वीडियो की खूबसूरती है।"
        title = "कुछ यादगार पल"
    else:
        voice = "Every frame holds a moment. This is your story, told one scene at a time."
        title = "A story in motion"
    clean = prompt.strip() or "cinematic personal reel"
    return {
        "title": title,
        "voiceover": voice if re.search(r"story|travel|journey|romantic|emotional|motiv|explainer|voice|narrat|कहानी|सफ़र|यात्रा|प्यार", clean, re.I) else "",
        "mood": "romantic" if re.search(r"love|romantic|emotional|memory|प्यार|याद", clean, re.I) else "energetic" if re.search(r"car|sport|fast|energetic|bike|गाड़ी", clean, re.I) else "cinematic",
        "music_prompt": "original cinematic instrumental score, evolving warm synth pads, piano, soft percussion, no vocals",
        "visual_prompts": [
            clean + ", cinematic wide establishing shot, beautiful composition, natural motion",
            clean + ", close-up detail shot, cinematic lighting, controlled camera movement",
            clean + ", dynamic middle scene, strong composition, subtle environmental movement",
            clean + ", emotional final scene, atmospheric light, elegant visual storytelling"
        ][:max(3, min(4, math.ceil(duration / 10)))]
    }

def _creative_plan(prompt, filenames, duration):
    hindi = _is_hindi(prompt)
    try:
        from transformers import AutoTokenizer, AutoModelForCausalLM
        _progress("Planning the edit with ReelForge's local creative director…")
        dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        tokenizer = AutoTokenizer.from_pretrained(DIRECTOR_MODEL)
        model = AutoModelForCausalLM.from_pretrained(
            DIRECTOR_MODEL,
            torch_dtype=dtype,
            low_cpu_mem_usage=True
        )
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model.to(device)
        system = (
            "You are ReelForge, a professional short-form video director. Return JSON only. "
            "Keys: title, mood (cinematic|romantic|travel|energetic|motivational|calm), "
            "voiceover (one to three original sentences or empty), music_prompt, "
            "visual_prompts (three to six detailed self-contained text-to-video prompts). "
            "If there are no uploaded clips, design a complete visual story with a clear opening, middle and ending. "
            "Do not invent facts about uploaded footage. Use the prompt's language. "
            "For Hindi, write Hindi in Devanagari. Keep all visuals original and coherent."
        )
        user = (
            f"EDIT BRIEF: {prompt}\nOUTPUT LENGTH: {duration} seconds\n"
            f"UPLOADED FILES: {', '.join(filenames)}\n"
            "Make a strong beginning, visual development and a memorable ending. "
            "Visual prompts should be self-contained and suitable for 2-second vertical video clips."
        )
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        inputs = tokenizer.apply_chat_template(
            messages, tokenize=True, add_generation_prompt=True,
            return_tensors="pt"
        ).to(device)
        with torch.inference_mode():
            output = model.generate(
                inputs, max_new_tokens=360, do_sample=True,
                temperature=0.65, top_p=0.9, repetition_penalty=1.08
            )
        answer = tokenizer.decode(output[0][inputs.shape[-1]:], skip_special_tokens=True)
        match = re.search(r"\{.*\}", answer, re.S)
        plan = json.loads(match.group(0)) if match else {}
        fallback = _fallback_plan(prompt, duration)
        result = {
            "title": str(plan.get("title") or fallback["title"])[:70],
            "mood": str(plan.get("mood") or fallback["mood"]).lower(),
            "voiceover": str(plan.get("voiceover") or "")[:600],
            "music_prompt": str(plan.get("music_prompt") or fallback["music_prompt"])[:400],
            "visual_prompts": plan.get("visual_prompts") if isinstance(plan.get("visual_prompts"), list) else fallback["visual_prompts"]
        }
        result["visual_prompts"] = [str(x)[:450] for x in result["visual_prompts"][:6]]
        if not result["visual_prompts"]:
            result["visual_prompts"] = fallback["visual_prompts"]
        if hindi and result["voiceover"] and not _is_hindi(result["voiceover"]):
            result["voiceover"] = fallback["voiceover"]
        del model, tokenizer, inputs, output
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        return result
    except Exception as exc:
        print("Creative director fallback:", str(exc)[:300])
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        return _fallback_plan(prompt, duration)

def _scene_prompts(plan, count):
    base = [str(x) for x in plan.get("visual_prompts", []) if str(x).strip()]
    if not base:
        base = _fallback_plan(plan.get("title", "cinematic reel"), 30)["visual_prompts"]
    variations = [
        "alternate wide establishing angle, gentle forward camera dolly",
        "medium cinematic composition, subtle side tracking movement",
        "intimate close-up detail, shallow depth of field and soft parallax",
        "dramatic final angle, atmospheric light and graceful camera pullback",
        "low-angle cinematic perspective, layered foreground and background"
    ]
    prompts = base[:count]
    while len(prompts) < count:
        source = base[len(prompts) % len(base)]
        variation = variations[len(prompts) % len(variations)]
        prompts.append(source + ", " + variation)
    return prompts[:count]

def _generate_broll(plan, count):
    from diffusers import AnimateDiffPipeline, MotionAdapter, DDIMScheduler
    import imageio.v2 as imageio

    prompts = _scene_prompts(plan, count)
    adapter = None
    pipe = None
    paths = []
    try:
        _progress("Loading the open video-generation models (first run downloads them)…")
        adapter = MotionAdapter.from_pretrained(
            MOTION_MODEL, torch_dtype=torch.float16, variant="fp16"
        )
        pipe = AnimateDiffPipeline.from_pretrained(
            SD_MODEL,
            motion_adapter=adapter,
            torch_dtype=torch.float16,
            variant="fp16",
            use_safetensors=True
        )
        pipe.scheduler = DDIMScheduler.from_config(
            pipe.scheduler.config,
            beta_schedule="linear",
            clip_sample=False,
            timestep_spacing="linspace",
            steps_offset=1
        )
        pipe.enable_vae_slicing()
        pipe.enable_attention_slicing()
        pipe.enable_model_cpu_offload()
        pipe.set_progress_bar_config(disable=True)

        for index, prompt in enumerate(prompts):
            _progress(f"Generating original AI video scene {index + 1} of {len(prompts)}…")
            with torch.inference_mode():
                result = pipe(
                    prompt=prompt,
                    negative_prompt="low quality, flicker, distorted faces, text, watermark, artifacts, bad anatomy",
                    num_frames=32,
                    height=512,
                    width=384,
                    num_inference_steps=14,
                    guidance_scale=6.8,
                    generator=torch.Generator("cuda").manual_seed(2400 + index)
                )
            frames = [np.asarray(frame.convert("RGB")) for frame in result.frames[0]]
            out = OUTPUT_DIR / f"ai_scene_{index + 1}.mp4"
            imageio.mimsave(str(out), frames, fps=8, codec="libx264", quality=8, macro_block_size=None)
            paths.append(str(out))
            del result, frames
            gc.collect()
            torch.cuda.empty_cache()
    except Exception as exc:
        print("Animated scene generation fallback:", str(exc)[:400])
        if pipe is not None:
            del pipe
            pipe = None
        if adapter is not None:
            del adapter
            adapter = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        for item in paths:
            try: os.remove(item)
            except Exception: pass
        paths = _generate_stills(plan, count)
    finally:
        if pipe is not None:
            del pipe
        if adapter is not None:
            del adapter
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    return paths

def _generate_stills(plan, count):
    from diffusers import StableDiffusionPipeline
    paths = []
    pipe = None
    try:
        _progress("Switching to original AI scene images with animated camera motion…")
        pipe = StableDiffusionPipeline.from_pretrained(
            SD_MODEL, torch_dtype=torch.float16, variant="fp16",
            use_safetensors=True
        )
        pipe.enable_vae_slicing()
        pipe.enable_attention_slicing()
        pipe.enable_model_cpu_offload()
        for index, prompt in enumerate(_scene_prompts(plan, count)):
            result = pipe(
                prompt=prompt,
                negative_prompt="low quality, watermark, text, deformed",
                num_inference_steps=18,
                guidance_scale=7.0,
                height=640,
                width=384
            )
            path = OUTPUT_DIR / f"ai_scene_{index + 1}.jpg"
            result.images[0].save(path, quality=94)
            paths.append(str(path))
            del result
            gc.collect()
            torch.cuda.empty_cache()
    finally:
        if pipe is not None: del pipe
        gc.collect()
        if torch.cuda.is_available(): torch.cuda.empty_cache()
    return paths

def _generate_music(plan, duration, audio_path=None):
    if audio_path:
        return audio_path
    # No third-party generative music model is used here. The soundtrack is
    # composed locally from original synthesized instruments, so this path
    # does not inherit MusicGen's CC-BY-NC model restriction.
    return _procedural_music(duration, plan.get("mood", "cinematic"))

def _procedural_music(duration, mood):
    sr = 24000
    length = max(1, int(sr * duration))
    t = np.arange(length, dtype=np.float32) / sr
    left = np.zeros(length, dtype=np.float32)
    right = np.zeros(length, dtype=np.float32)

    if mood == "energetic":
        bpm, progressions, scale = 122, [[196.0,246.94,293.66],[146.83,185.0,220.0],[174.61,220.0,261.63],[164.81,207.65,246.94]], [0,3,5,7,10]
    elif mood == "romantic":
        bpm, progressions, scale = 88, [[220.0,261.63,329.63],[174.61,220.0,261.63],[261.63,329.63,392.0],[196.0,246.94,293.66]], [0,2,4,7,9]
    elif mood == "travel":
        bpm, progressions, scale = 108, [[261.63,329.63,392.0],[196.0,246.94,293.66],[220.0,261.63,329.63],[174.61,220.0,261.63]], [0,2,4,7,9]
    else:
        bpm, progressions, scale = 98, [[220.0,261.63,329.63],[174.61,220.0,261.63],[196.0,246.94,293.66],[146.83,185.0,220.0]], [0,2,4,7,9]

    beat = 60.0 / bpm
    bar = beat * 4
    rng = np.random.default_rng(20261117)

    def add_tone(start, seconds, frequency, amplitude, pan=0.0, kind="sine"):
        start_i = max(0, int(start * sr))
        end_i = min(length, int((start + seconds) * sr))
        if end_i <= start_i:
            return
        local = np.arange(end_i - start_i, dtype=np.float32) / sr
        attack = min(0.18, max(0.008, seconds * 0.12))
        release = min(0.55, max(0.035, seconds * 0.28))
        env = np.minimum(1.0, local / attack)
        env *= np.minimum(1.0, np.maximum(0.0, (seconds - local) / release))
        if kind == "pad":
            wave = (np.sin(2*np.pi*frequency*local)
                    + 0.42*np.sin(2*np.pi*frequency*2.005*local)
                    + 0.2*np.sin(2*np.pi*frequency*0.5*local))
        elif kind == "pluck":
            decay = np.exp(-local * (5.5 if mood == "energetic" else 3.8))
            wave = decay * (np.sin(2*np.pi*frequency*local)
                    + 0.34*np.sin(2*np.pi*frequency*2.01*local)
                    + 0.12*np.sin(2*np.pi*frequency*3.02*local))
        elif kind == "bass":
            wave = np.sin(2*np.pi*frequency*local) + 0.25*np.sin(2*np.pi*frequency*2*local)
        else:
            wave = np.sin(2*np.pi*frequency*local)
        wave = (wave * env * amplitude).astype(np.float32)
        l_gain = math.sqrt((1.0 - pan) * 0.5)
        r_gain = math.sqrt((1.0 + pan) * 0.5)
        left[start_i:end_i] += wave * l_gain
        right[start_i:end_i] += wave * r_gain

    def add_kick(start, amplitude):
        start_i = int(start * sr)
        end_i = min(length, start_i + int(0.23 * sr))
        if end_i <= start_i:
            return
        local = np.arange(end_i - start_i, dtype=np.float32) / sr
        freq = 105.0 * np.exp(-local * 17.0) + 38.0
        phase = 2*np.pi*np.cumsum(freq) / sr
        wave = np.sin(phase) * np.exp(-local * 17.0) * amplitude
        left[start_i:end_i] += wave
        right[start_i:end_i] += wave * 0.92

    def add_noise_hit(start, amplitude, duration_s, highpass=False, pan=0.0):
        start_i = int(start * sr)
        end_i = min(length, start_i + int(duration_s * sr))
        if end_i <= start_i:
            return
        n = end_i - start_i
        noise = rng.normal(0, 1, n).astype(np.float32)
        if highpass:
            noise = np.concatenate([[0.0], np.diff(noise)])
        env = np.exp(-np.linspace(0, 6.5, n, dtype=np.float32))
        wave = noise * env * amplitude
        l_gain = math.sqrt((1.0-pan)*0.5)
        r_gain = math.sqrt((1.0+pan)*0.5)
        left[start_i:end_i] += wave*l_gain
        right[start_i:end_i] += wave*r_gain

    bars = math.ceil(duration / bar)
    for bar_index in range(bars):
        start = bar_index * bar
        chord = progressions[bar_index % len(progressions)]
        build = bar_index / max(1, bars - 1)
        for voice_index, note in enumerate(chord):
            pan = (voice_index - 1) * 0.24
            add_tone(start, bar*0.96, note, 0.027, pan, "pad")
            add_tone(start+0.04, bar*0.82, note*2, 0.008, -pan, "sine")

        root = chord[0] / 2
        for beat_index in range(4):
            at = start + beat_index*beat
            add_tone(at, beat*0.82, root, 0.065 if mood != "energetic" else 0.085, -0.12, "bass")
            if beat_index in (0,2):
                add_kick(at, 0.18 if mood == "energetic" else 0.115)
            if beat_index in (1,3):
                add_noise_hit(at, 0.035 if mood == "energetic" else 0.022, 0.15, False, 0.08)
            add_noise_hit(at+beat*0.5, 0.032 if mood == "energetic" else 0.018, 0.075, True, -0.18 if beat_index%2 else 0.18)

        arp_steps = 8 if mood in ("energetic","travel") else 4
        for step in range(arp_steps):
            interval = bar / arp_steps
            base = chord[step % len(chord)]
            semitone = scale[(step + bar_index) % len(scale)]
            note = base * (2.0 ** (semitone / 12.0))
            add_tone(start+step*interval, 0.34 if mood=="energetic" else 0.48,
                     note, 0.038 if mood=="energetic" else 0.025,
                     -0.36 if step%2 else 0.36, "pluck")

    # Gentle stereo delay/reverb and a clean master fade.
    dry_l, dry_r = left.copy(), right.copy()
    for delay, gain in ((int(.12*sr),.12),(int(.23*sr),.075),(int(.37*sr),.045)):
        if delay < length:
            left[delay:] += dry_r[:-delay] * gain
            right[delay:] += dry_l[:-delay] * gain
    fade = min(int(sr*1.2), length//2)
    if fade:
        ramp = np.linspace(0,1,fade,dtype=np.float32)
        left[:fade] *= ramp; right[:fade] *= ramp
        left[-fade:] *= ramp[::-1]; right[-fade:] *= ramp[::-1]
    stereo = np.stack([left,right],axis=1)
    peak = float(np.max(np.abs(stereo))) if stereo.size else 0.0
    if peak > 0:
        stereo = np.tanh(stereo / max(peak,0.85) * 1.4) * 0.72
    out = OUTPUT_DIR / "original_music.wav"
    sf.write(str(out), stereo.astype(np.float32), sr)
    return str(out)

def _generate_voice(plan):
    text = str(plan.get("voiceover") or "").strip()
    if not text:
        return None
    try:
        from kokoro import KPipeline
        hindi = _is_hindi(text)
        lang_code = "h" if hindi else "a"
        voice = "hf_alpha" if hindi else "af_heart"
        _progress("Creating a natural voice-over with the local Kokoro voice model…")
        pipeline = KPipeline(lang_code=lang_code)
        parts = []
        for _, _, audio in pipeline(text, voice=voice, speed=1.0):
            if hasattr(audio, "cpu"):
                audio = audio.cpu().numpy()
            parts.append(np.asarray(audio, dtype=np.float32).reshape(-1))
        if not parts:
            return None
        samples = np.concatenate(parts)
        out = OUTPUT_DIR / "voiceover.wav"
        sf.write(str(out), samples, 24000)
        del pipeline, parts, samples
        gc.collect()
        return str(out)
    except Exception as exc:
        print("Voice-over fallback:", str(exc)[:300])
        gc.collect()
        return None

def _vertical(clip):
    from moviepy.editor import vfx
    scale = max(WIDTH / clip.w, HEIGHT / clip.h)
    clip = clip.resize(scale)
    clip = clip.crop(x_center=clip.w / 2, y_center=clip.h / 2, width=WIDTH, height=HEIGHT)
    return clip

def _caption_image(text):
    image = Image.new("RGBA", (WIDTH, 190), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    hindi_font = "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf"
    default_font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    font_path = hindi_font if _is_hindi(text) and Path(hindi_font).exists() else default_font
    font = ImageFont.truetype(font_path, 34)
    words = str(text).split()
    lines, current = [], ""
    for word in words:
        candidate = (current + " " + word).strip()
        box = draw.textbbox((0, 0), candidate, font=font, stroke_width=1)
        if box[2] - box[0] > 630 and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    lines = lines[:2]
    y = 26
    for line in lines:
        box = draw.textbbox((0, 0), line, font=font, stroke_width=1)
        x = (WIDTH - (box[2] - box[0])) / 2
        draw.rounded_rectangle((x-18, y-9, x+(box[2]-box[0])+18, y+49), radius=14, fill=(0,0,0,172))
        draw.text((x, y), line, font=font, fill=(255,255,255,255), stroke_width=2, stroke_fill=(0,0,0,200))
        y += 64
    return np.asarray(image)

def _script_captions(text, duration):
    words = str(text).split()
    if not words:
        return []
    groups = [" ".join(words[i:i+4]) for i in range(0, len(words), 4)]
    total = len(words)
    rows, cursor, word_count = [], 0.0, 0
    for group in groups:
        n = len(group.split())
        span = duration * n / total
        rows.append((group, cursor, cursor + span))
        cursor += span
        word_count += n
    return rows

def _whisper_captions(video_rows):
    captions = []
    try:
        from faster_whisper import WhisperModel
        _progress("Listening to the original clips for spoken dialogue…")
        model = WhisperModel("base", device="cpu", compute_type="int8")
        transcript_cache = {}
        for path, source_start, source_end, timeline_start in video_rows:
            if path not in transcript_cache:
                segments, _ = model.transcribe(path, word_timestamps=True, vad_filter=True)
                transcript_cache[path] = list(segments)
            for segment in transcript_cache[path]:
                text = str(segment.text or "").strip()
                if not text:
                    continue
                seg_start = max(float(segment.start), source_start)
                seg_end = min(float(segment.end), source_end)
                if seg_end <= seg_start:
                    continue
                mapped_start = timeline_start + (seg_start - source_start)
                mapped_end = timeline_start + (seg_end - source_start)
                captions.append((text, mapped_start, mapped_end))
        del model
        gc.collect()
    except Exception as exc:
        print("Automatic speech captions fallback:", str(exc)[:300])
    return captions

def _mix_audio(final, raw_audio, music_path, voice_path):
    from moviepy.editor import AudioFileClip, CompositeAudioClip
    from moviepy.audio.fx.all import audio_loop
    tracks = []
    for track in raw_audio:
        tracks.append(track)
    music = AudioFileClip(music_path)
    music = audio_loop(music, duration=final.duration).set_duration(final.duration)
    music = music.volumex(0.22 if voice_path else 0.48)
    tracks.append(music)
    if voice_path:
        voice = AudioFileClip(voice_path).set_start(0).volumex(1.0)
        if voice.duration > final.duration:
            voice = voice.subclip(0, final.duration)
        tracks.append(voice)
    composite = CompositeAudioClip(tracks).set_duration(final.duration)
    return final.set_audio(composite), tracks

def _assemble(raw_paths, ai_paths, duration, music_path, voice_path, plan):
    from moviepy.editor import VideoFileClip, ImageClip, concatenate_videoclips, CompositeVideoClip, AudioFileClip
    from moviepy.video.fx.all import fadein, fadeout, colorx, loop, mirror_x
    raw_entries, source_objects = [], []
    for path in raw_paths:
        ext = Path(path).suffix.lower()
        if ext in (".jpg", ".jpeg", ".png", ".webp"):
            image = Image.open(path).convert("RGB")
            base = ImageClip(np.asarray(image)).set_duration(4.2)
            clip = _vertical(base)
            clip = clip.resize(lambda t: 1.0 + 0.045 * (t / max(0.1, clip.duration)))
            clip = clip.fx(fadein, 0.22).fx(fadeout, 0.22)
            raw_entries.append({"clip": clip, "audio": None, "source": None})
        else:
            source = VideoFileClip(path, audio=True)
            source_objects.append(source)
            parts = min(3, max(1, math.ceil(source.duration / 9.0)))
            seg_len = min(5.0, max(2.0, source.duration / parts))
            for index in range(parts):
                start = max(0.0, (source.duration - seg_len) * index / max(1, parts - 1))
                end = min(source.duration, start + seg_len)
                if end - start < 0.8:
                    continue
                segment = source.subclip(start, end)
                clip = _vertical(segment.without_audio())
                clip = clip.fx(colorx, 1.06).fx(fadein, 0.22).fx(fadeout, 0.22)
                audio = segment.audio.volumex(0.2) if segment.audio is not None else None
                raw_entries.append({
                    "clip": clip,
                    "audio": audio,
                    "source": (path, start, end)
                })

    ai_entries = []
    for path in ai_paths:
        if Path(path).suffix.lower() in (".jpg", ".jpeg", ".png"):
            still = ImageClip(path).set_duration(4.0)
            clip = _vertical(still)
            clip = clip.resize(lambda t: 1.0 + 0.055 * (t / max(0.1, clip.duration)))
        else:
            generated = VideoFileClip(path, audio=False)
            source_objects.append(generated)
            clip = _vertical(generated)
        clip = clip.fx(colorx, 1.08).fx(fadein, 0.18).fx(fadeout, 0.18)
        ai_entries.append({"clip": clip, "audio": None, "source": None})

    sequence = []
    raw_index = ai_index = 0
    while raw_index < len(raw_entries) or ai_index < len(ai_entries):
        if raw_index < len(raw_entries):
            sequence.append(raw_entries[raw_index])
            raw_index += 1
        if ai_index < len(ai_entries):
            sequence.append(ai_entries[ai_index])
            ai_index += 1
    if not sequence:
        raise RuntimeError("No usable media was created from your uploads.")

    # Extend the timeline with additional source moments or alternate AI shots.
    extension_index = 0
    max_sequence = min(42, max(6, math.ceil(duration / 1.35) + 4))
    while sum(entry["clip"].duration for entry in sequence) < duration + 0.5 and len(sequence) < max_sequence:
        if raw_entries:
            source_entry = raw_entries[extension_index % len(raw_entries)]
            if source_entry["source"] and source_entry["source"][2] - source_entry["source"][1] > 1.0:
                path, start, end = source_entry["source"]
                base = next((v for v in source_objects if getattr(v, "filename", None) == path), None)
                if base is not None:
                    next_start = max(0, min(base.duration - 1.8, end + 0.12))
                    next_end = min(base.duration, next_start + min(3.2, duration/10))
                    if next_end - next_start > 0.8:
                        segment = base.subclip(next_start, next_end)
                        extra = _vertical(segment.without_audio()).fx(colorx, 1.05).fx(fadein, 0.18).fx(fadeout, 0.18)
                        raw_entries.append({
                            "clip": extra,
                            "audio": segment.audio.volumex(0.18) if segment.audio else None,
                            "source": (path, next_start, next_end)
                        })
                        sequence.append(raw_entries[-1])
                        extension_index += 1
                        continue
            sequence.append(source_entry)
        elif ai_entries:
            source_entry = ai_entries[extension_index % len(ai_entries)]
            extra = source_entry["clip"].copy()
            if extension_index % 2:
                extra = extra.fx(mirror_x)
            else:
                extra = extra.fx(colorx, 1.04)
            sequence.append({"clip": extra, "audio": None, "source": None})
        else:
            break
        extension_index += 1

    sequence = sequence[:max(3, min(max_sequence, len(sequence)))]
    crossfade = 0.28
    clips = []
    raw_audio = []
    video_rows = []
    cursor = 0.0
    for index, entry in enumerate(sequence):
        clip = entry["clip"]
        if index > 0:
            clip = clip.crossfadein(crossfade)
        clips.append(clip)
        if entry["audio"] is not None:
            raw_audio.append(entry["audio"].set_start(cursor))
        if entry["source"]:
            path, start, end = entry["source"]
            video_rows.append((path, start, end, cursor))
        cursor += clip.duration - (crossfade if index > 0 else 0)

    final = concatenate_videoclips(clips, method="compose", padding=-crossfade)
    if final.duration > duration:
        final = final.subclip(0, duration)
    elif final.duration < duration:
        final = final.fx(loop, duration=duration)

    # Original audio from videos, user-selected music or MusicGen, and voice-over.
    final, audio_tracks = _mix_audio(final, raw_audio, music_path, voice_path)

    overlays = []
    title_text = str(plan.get("title") or "").strip()
    if title_text:
        title_img = Image.new("RGBA", (WIDTH, HEIGHT), (0,0,0,0))
        draw = ImageDraw.Draw(title_img)
        title_font = "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf" if _is_hindi(title_text) and Path("/usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf").exists() else "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        font = ImageFont.truetype(title_font, 58)
        draw.rounded_rectangle((40, 110, WIDTH-40, 245), radius=24, fill=(4,7,12,145))
        draw.text((68, 143), title_text[:42], font=font, fill=(255,248,236,255), stroke_width=2, stroke_fill=(0,0,0,170))
        overlays.append(ImageClip(np.asarray(title_img)).set_start(0).set_duration(min(4.5, final.duration)).set_position(("center","center")))

    voice_duration = min(final.duration, float(sf.info(voice_path).duration)) if voice_path else 0.0
    caption_rows = _script_captions(plan.get("voiceover",""), voice_duration) if voice_path else []
    if not caption_rows:
        caption_rows = _whisper_captions(video_rows)
    for text, start, end in caption_rows:
        start = max(0.0, float(start))
        end = min(final.duration, max(start + 0.25, float(end)))
        if end <= start:
            continue
        img = _caption_image(text)
        overlays.append(ImageClip(img).set_start(start).set_duration(end-start).set_position(("center", 1000)))

    if overlays:
        final = CompositeVideoClip([final] + overlays, size=(WIDTH, HEIGHT)).set_duration(final.duration)

    out = OUTPUT_DIR / "reelforge_final.mp4"
    _progress("Rendering the final vertical MP4 with audio, transitions and captions…")
    final.write_videofile(
        str(out), fps=FPS, codec="libx264", audio_codec="aac",
        preset="ultrafast", bitrate="5500k",
        ffmpeg_params=["-pix_fmt", "yuv420p", "-movflags", "+faststart"],
        threads=2, logger=None
    )
    try:
        final.close()
        for clip in clips:
            clip.close()
        for source in source_objects:
            source.close()
        for track in audio_tracks:
            track.close()
    except Exception:
        pass
    gc.collect()
    return str(out)

def _verify_final_mp4(path, expected_duration):
    command = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,pix_fmt",
        "-of", "json", str(path)
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=True, timeout=60)
    report = json.loads(result.stdout or "{}")
    streams = report.get("streams", [])
    video = next((item for item in streams if item.get("codec_type") == "video"), None)
    audio = next((item for item in streams if item.get("codec_type") == "audio"), None)
    if not video:
        raise RuntimeError("The export has no readable video stream.")
    if not audio:
        raise RuntimeError("The export has no audio stream. The audio mix did not complete.")
    duration = float(report.get("format", {}).get("duration") or 0)
    if duration < expected_duration * 0.92:
        raise RuntimeError(f"The MP4 is incomplete ({duration:.1f}s of {expected_duration}s).")
    if int(video.get("width") or 0) != WIDTH or int(video.get("height") or 0) != HEIGHT:
        raise RuntimeError("The export did not keep the required vertical 720×1280 frame.")
    codec = str(video.get("codec_name") or "")
    pixel_format = str(video.get("pix_fmt") or "")
    if codec != "h264" or pixel_format != "yuv420p":
        raise RuntimeError(f"Instagram compatibility check failed: video={codec}, pixel format={pixel_format}.")
    size = Path(path).stat().st_size
    if size < 100_000:
        raise RuntimeError("The rendered MP4 is unexpectedly small and may be incomplete.")
    return {
        "duration": round(duration, 2),
        "width": int(video["width"]),
        "height": int(video["height"]),
        "video_codec": codec,
        "pixel_format": pixel_format,
        "audio_codec": str(audio.get("codec_name") or "unknown"),
        "size_mb": round(size / (1024 * 1024), 2)
    }

def _run_pipeline(raw_files, audio_files, prompt, duration):
    if not torch.cuda.is_available():
        raise RuntimeError("A free GPU is not attached. In Colab choose Runtime → Change runtime type → T4 GPU, then Run all again.")
    if not raw_files and not str(prompt or "").strip():
        raise RuntimeError("Add an editing prompt. You can create a video without uploading any clips.")
    for file in OUTPUT_DIR.glob("*"):
        if file.is_file():
            try: file.unlink()
            except Exception: pass
    plan = _creative_plan(prompt, [Path(p).name for p in raw_files], duration)
    _progress("Generating original AI motion scenes…")
    ai_count = min(12, max(8, math.ceil(duration / (4 if not raw_files else 12))))
    ai_paths = _generate_broll(plan, ai_count)
    gc.collect()
    torch.cuda.empty_cache()

    voice_path = _generate_voice(plan)
    music_path = _generate_music(plan, duration, audio_files[0] if audio_files else None)
    gc.collect()
    if torch.cuda.is_available(): torch.cuda.empty_cache()

    final_path = _assemble(raw_files, ai_paths, duration, music_path, voice_path, plan)
    _progress("Verifying the finished MP4, audio track and Instagram-compatible format…")
    plan["export"] = _verify_final_mp4(final_path, duration)
    return final_path, plan

def _start_ui():
    global STATUS_WIDGET
    title = widgets.HTML(
        "<div style='font:800 25px system-ui;color:#e8c59b'>REELFORGE CLOUD STUDIO</div>"
        "<div style='font:13px system-ui;color:#9ca6b6;margin:4px 0 14px'>One prompt · your raw media · original AI scenes · watermark-free MP4</div>"
    )
    prompt_box = widgets.Textarea(
        value="Make a cinematic 30-second reel from my clips. Choose the strongest moments, add original AI-generated B-roll, smooth transitions, cinematic colour grading, stylish Hindi/English captions when speech is present, a natural voice-over when it suits the story, and an original background score.",
        description="Edit prompt",
        layout=widgets.Layout(width="100%", height="115px")
    )
    upload_box = widgets.FileUpload(
        accept=".mp4,.mov,.m4v,.webm,.avi,.jpg,.jpeg,.png,.webp",
        multiple=True,
        description="Add raw clips (optional)"
    )
    audio_box = widgets.FileUpload(
        accept=".mp3,.wav,.m4a,.aac,.ogg",
        multiple=False,
        description="Optional music/audio"
    )
    duration_box = widgets.Dropdown(options=[15,20,30,45,60], value=30, description="Length")
    run_button = widgets.Button(
        description="Create my video",
        button_style="success",
        icon="video",
        layout=widgets.Layout(width="100%", height="44px")
    )
    status = widgets.HTML(
        "<div style='padding:10px;background:#202530;border-radius:10px;color:#f1e7d9'>Ready. Upload your media and write one prompt.</div>"
    )
    STATUS_WIDGET = status
    output = widgets.Output()

    def on_run(_):
        with output:
            clear_output(wait=True)
            try:
                raw_items = _upload_items(upload_box)
                audio_items = _upload_items(audio_box)
                if not raw_items and not prompt_box.value.strip():
                    raise RuntimeError("Write an editing prompt. You can create a video without uploading any clips.")
                raw_paths = []
                for index, (name, content) in enumerate(raw_items):
                    out = UPLOAD_DIR / f"{index:02d}_{_safe_filename(name)}"
                    out.write_bytes(content)
                    raw_paths.append(str(out))
                audio_paths = []
                for index, (name, content) in enumerate(audio_items):
                    out = UPLOAD_DIR / f"audio_{_safe_filename(name)}"
                    out.write_bytes(content)
                    audio_paths.append(str(out))
                run_button.disabled = True
                start = time.time()
                path, plan = _run_pipeline(
                    raw_paths, audio_paths, prompt_box.value.strip(), int(duration_box.value)
                )
                elapsed = int(time.time() - start)
                _progress(f"Finished in {elapsed//60}m {elapsed%60}s · MP4 ready")
                display(Video(path, embed=True, width=300))
                display(HTML(f"<div style='color:#d8c7ad;font:13px system-ui;margin:8px 0'>Title: {plan.get('title','ReelForge edit')} · Mood: {plan.get('mood','cinematic')}</div>"))
                export_info = plan.get("export", {})
                display(HTML(
                    f"<div style='font:12px/1.6 system-ui;color:#a7d8b8'>"
                    f"Verified MP4 · {export_info.get('width')}×{export_info.get('height')} · "
                    f"{export_info.get('duration')}s · H.264 + {export_info.get('audio_codec')} · "
                    f"{export_info.get('size_mb')} MB · no added watermark</div>"
                ))
                colab_files.download(path)
            except Exception as exc:
                _progress(f"Could not finish this render: {str(exc)[:600]}")
                traceback.print_exc()
            finally:
                run_button.disabled = False

    run_button.on_click(on_run)
    display(title)
    display(prompt_box)
    display(widgets.HTML("<b style='color:#d8c7ad'>1. Add raw photos/videos (optional — prompt-only works too)</b>"))
    display(upload_box)
    display(widgets.HTML("<b style='color:#d8c7ad;margin-top:8px'>2. Add your own audio (optional)</b>"))
    display(audio_box)
    display(widgets.HBox([duration_box]))
    display(run_button)
    display(status)
    display(output)

_start_ui()
