(() => {
  "use strict";

  let asrPromise = null;
  let ttsPromise = null;
  const ASR_MODEL = "onnx-community/whisper-tiny";
  const TTS_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

  function sayProgress(callback, text, percent) {
    if (typeof callback === "function") callback(text, percent);
  }

  async function getTransformers() {
    return import("https://esm.sh/@huggingface/transformers@3.8.1");
  }

  async function makeASR(onProgress) {
    if (asrPromise) return asrPromise;
    asrPromise = (async () => {
      sayProgress(onProgress, "Loading the free on-device caption model…", 8);
      const { pipeline, env } = await getTransformers();
      env.allowRemoteModels = true;
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      const progress_callback = (event) => {
        if (event && event.status === "progress" && Number.isFinite(event.progress)) {
          sayProgress(onProgress, "Downloading caption model… " + Math.round(event.progress) + "%", 8 + event.progress * 0.18);
        }
      };
      const useGPU = !!(navigator.gpu);
      try {
        return await pipeline("automatic-speech-recognition", ASR_MODEL, {
          dtype: "q8",
          device: useGPU ? "webgpu" : "wasm",
          progress_callback
        });
      } catch (error) {
        if (!useGPU) throw error;
        console.warn("Whisper WebGPU fallback:", error);
        sayProgress(onProgress, "Switching caption model to phone-compatible mode…", 12);
        return await pipeline("automatic-speech-recognition", ASR_MODEL, {
          dtype: "q8",
          device: "wasm",
          progress_callback
        });
      }
    })().catch(error => {
      asrPromise = null;
      throw error;
    });
    return asrPromise;
  }

  async function audioSamples16k(file) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error("This browser cannot decode audio for automatic captions.");
    const context = new AudioCtx({ sampleRate: 16000 });
    try {
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      const channels = [];
      for (let i = 0; i < decoded.numberOfChannels; i++) channels.push(decoded.getChannelData(i));
      const targetLength = Math.max(1, Math.floor(decoded.duration * 16000));
      const mono = new Float32Array(targetLength);
      const sourceRate = decoded.sampleRate;
      for (let i = 0; i < targetLength; i++) {
        const sourcePosition = i * sourceRate / 16000;
        const left = Math.floor(sourcePosition);
        const fraction = sourcePosition - left;
        let sum = 0;
        let count = 0;
        for (const channel of channels) {
          const a = channel[Math.min(left, channel.length - 1)] || 0;
          const b = channel[Math.min(left + 1, channel.length - 1)] || 0;
          sum += a + (b - a) * fraction;
          count++;
        }
        mono[i] = sum / Math.max(1, count);
      }
      return { samples: mono, duration: decoded.duration };
    } finally {
      await context.close().catch(() => {});
    }
  }

  async function transcribe(file, onProgress) {
    if (!file) return { text: "", chunks: [], duration: 0 };
    if (file.size > 120 * 1024 * 1024) throw new Error("The audio file is too large for on-device captions. Use a shorter or smaller file.");
    sayProgress(onProgress, "Preparing speech recognition…", 7);
    const audio = await audioSamples16k(file);
    if (audio.duration > 120) throw new Error("Automatic captions are limited to 2 minutes per source file on this phone-first version.");
    if (audio.samples.length < 8000) return { text: "", chunks: [], duration: audio.duration };
    const model = await makeASR(onProgress);
    sayProgress(onProgress, "Listening for spoken words…", 32);
    const result = await model(audio.samples, {
      return_timestamps: "word",
      chunk_length_s: 20,
      stride_length_s: 3
    });
    const chunks = (result && result.chunks ? result.chunks : []).map(item => ({
      text: String(item.text || "").trim(),
      start: Array.isArray(item.timestamp) ? Number(item.timestamp[0]) : 0,
      end: Array.isArray(item.timestamp) ? Number(item.timestamp[1]) : 0
    })).filter(item => item.text && Number.isFinite(item.start) && Number.isFinite(item.end) && item.end >= item.start);
    return { text: result && result.text ? result.text.trim() : "", chunks, duration: audio.duration };
  }

  async function makeTTS(onProgress) {
    if (ttsPromise) return ttsPromise;
    ttsPromise = (async () => {
      sayProgress(onProgress, "Loading the free voice model (first use downloads it once)…", 10);
      const { KokoroTTS } = await import("https://esm.sh/kokoro-js@1.2.1");
      const useGPU = !!(navigator.gpu);
      try {
        return await KokoroTTS.from_pretrained(TTS_MODEL, {
          dtype: useGPU ? "fp16" : "q8",
          device: useGPU ? "webgpu" : "wasm"
        });
      } catch (error) {
        if (!useGPU) throw error;
        console.warn("Kokoro WebGPU fallback:", error);
        sayProgress(onProgress, "Switching voice generation to phone-compatible mode…", 14);
        return await KokoroTTS.from_pretrained(TTS_MODEL, {
          dtype: "q8",
          device: "wasm"
        });
      }
    })().catch(error => {
      ttsPromise = null;
      throw error;
    });
    return ttsPromise;
  }

  async function synthesize(text, language, voiceGender, onProgress) {
    const clean = String(text || "").trim().slice(0, 1200);
    if (!clean) throw new Error("Add a short narration script before generating a voice.");
    if (clean.length > 800) throw new Error("Keep narration under 800 characters for reliable phone rendering.");
    const model = await makeTTS(onProgress);
    const hindi = language === "hi" || /[\u0900-\u097F]/.test(clean);
    const voice = hindi
      ? (voiceGender === "male" ? "hm_omega" : "hf_alpha")
      : (voiceGender === "male" ? "am_michael" : "af_bella");
    sayProgress(onProgress, "Creating the narration on your phone…", 48);
    const result = await model.generate(clean, { voice, speed: 1.02 });
    const samples = result && result.audio ? result.audio : null;
    if (!samples || !samples.length) throw new Error("The voice model did not return audio.");
    return { samples: new Float32Array(samples), sampleRate: result.sampling_rate || 24000, text: clean };
  }

  async function generateMusic(duration, mood) {
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineContext) throw new Error("Your browser does not support offline music generation.");
    const sampleRate = 24000;
    const length = Math.ceil(duration * sampleRate);
    const ctx = new OfflineContext(2, length, sampleRate);
    const master = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    master.gain.value = 0.82;
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.22;
    master.connect(compressor);
    compressor.connect(ctx.destination);

    const progressions = mood === "romantic"
      ? [[261.63,329.63,392],[220,261.63,329.63],[174.61,220,261.63],[196,246.94,293.66]]
      : mood === "energetic"
        ? [[196,246.94,293.66],[155.56,196,233.08],[174.61,220,261.63],[146.83,185,220]]
        : [[220,261.63,329.63],[174.61,220,261.63],[130.81,164.81,196],[196,246.94,293.66]];
    const bars = Math.ceil(duration / 4);
    const barLength = 4;
    const scale = mood === "energetic"
      ? [0,3,5,7,10]
      : [0,2,4,7,9];

    function tone(frequency, start, seconds, volume, type, attack, release, filterFrequency) {
      if (start >= duration) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(frequency, start);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(filterFrequency || 3200, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(volume, start + (attack || 0.03));
      gain.gain.setValueAtTime(volume * 0.82, Math.min(duration, start + seconds * 0.55));
      gain.gain.exponentialRampToValueAtTime(0.0001, Math.min(duration, start + seconds + (release || 0.1)));
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(Math.min(duration, start + seconds + (release || 0.1) + 0.02));
    }

    function kick(start, volume) {
      if (start >= duration) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(115, start);
      osc.frequency.exponentialRampToValueAtTime(43, start + 0.14);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + 0.22);
    }

    const noiseBuffer = ctx.createBuffer(1, Math.ceil(sampleRate * 0.12), sampleRate);
    const noise = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 2 - 1) * (1 - i / noise.length);
    function hat(start) {
      if (start >= duration) return;
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      source.buffer = noiseBuffer;
      filter.type = "highpass";
      filter.frequency.value = 6500;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.055, start + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.075);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(start);
      source.stop(start + 0.09);
    }

    for (let bar = 0; bar < bars; bar++) {
      const start = bar * barLength;
      const chord = progressions[bar % progressions.length];
      for (const frequency of chord) {
        tone(frequency, start, barLength * 0.92, 0.032, "triangle", 0.45, 0.35, 1500);
        tone(frequency * 2, start + 0.08, barLength * 0.75, 0.009, "sine", 0.7, 0.4, 2400);
      }
      const root = chord[0] / 2;
      for (let beat = 0; beat < 4; beat++) {
        const t = start + beat;
        tone(root, t, 0.46, mood === "energetic" ? 0.11 : 0.07, "triangle", 0.01, 0.18, 600);
        if (beat === 0 || (mood === "energetic" && beat === 2)) kick(t, mood === "energetic" ? 0.22 : 0.13);
        hat(t + 0.5);
        const note = chord[0] * Math.pow(2, scale[(bar + beat) % scale.length] / 12);
        tone(note, t + 0.52, 0.16, mood === "energetic" ? 0.055 : 0.026, "sine", 0.006, 0.16, 5000);
      }
    }
    const buffer = await ctx.startRendering();
    return buffer;
  }

  window.ReelForgeAI = {
    transcribe,
    synthesize,
    generateMusic
  };
})();