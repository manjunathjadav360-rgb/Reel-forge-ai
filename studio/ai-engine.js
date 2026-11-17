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
    let result;
    try {
      sayProgress(onProgress, "Listening for spoken words…", 32);
      result = await model(audio.samples, {
        return_timestamps: "word",
        chunk_length_s: 20,
        stride_length_s: 3
      });
    } finally {
      if (model && typeof model.dispose === "function") {
        try { await model.dispose(); } catch (_) {}
      }
      asrPromise = null;
    }
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
    compressor.threshold.value = -19;
    compressor.knee.value = 18;
    compressor.ratio.value = 3.2;
    compressor.attack.value = 0.012;
    compressor.release.value = 0.24;
    master.gain.setValueAtTime(0.0001, 0);
    master.gain.linearRampToValueAtTime(0.76, 1.1);
    master.gain.setValueAtTime(0.76, Math.max(1.1, duration - 1.1));
    master.gain.linearRampToValueAtTime(0.0001, duration);
    master.connect(compressor);
    compressor.connect(ctx.destination);

    const reverb = ctx.createConvolver();
    const impulse = ctx.createBuffer(2, Math.floor(sampleRate * 1.35), sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        const decay = Math.pow(1 - i / data.length, 2.8);
        data[i] = (Math.random() * 2 - 1) * decay * 0.42;
      }
    }
    reverb.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = mood === "romantic" || mood === "cinematic" ? 0.24 : 0.14;
    master.connect(reverb);
    reverb.connect(wet);
    wet.connect(compressor);

    const bpm = mood === "energetic" ? 122 : mood === "romantic" ? 88 : mood === "travel" ? 108 : mood === "motivational" ? 112 : 96;
    const beat = 60 / bpm;
    const barLength = beat * 4;
    const bars = Math.ceil(duration / barLength);
    const progressions = mood === "romantic"
      ? [[220,261.63,329.63],[174.61,220,261.63],[261.63,329.63,392],[196,246.94,293.66]]
      : mood === "energetic"
        ? [[196,246.94,293.66],[146.83,185,220],[174.61,220,261.63],[164.81,207.65,246.94]]
        : mood === "travel"
          ? [[261.63,329.63,392],[196,246.94,293.66],[220,261.63,329.63],[174.61,220,261.63]]
          : mood === "motivational"
            ? [[196,246.94,293.66],[220,277.18,329.63],[261.63,329.63,392],[174.61,220,261.63]]
            : [[220,261.63,329.63],[174.61,220,261.63],[196,246.94,293.66],[146.83,185,220]];
    const notes = mood === "energetic" ? [0,3,5,7,10] : [0,2,4,7,9];

    function envelope(gain, start, peak, attack, hold, release) {
      const safeStart = Math.max(0, start);
      const peakAt = Math.min(duration, safeStart + Math.max(0.004, attack));
      const holdAt = Math.min(duration, peakAt + Math.max(0.01, hold));
      const endAt = Math.min(duration, holdAt + Math.max(0.025, release));
      gain.gain.setValueAtTime(0.0001, safeStart);
      gain.gain.linearRampToValueAtTime(peak, peakAt);
      gain.gain.setValueAtTime(peak * 0.72, holdAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, Math.max(peakAt + 0.02, endAt));
      return endAt;
    }

    function voice(frequency, start, seconds, volume, type, cutoff, attack, release, pan = 0) {
      if (start >= duration) return;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner();
      osc.type = type || "triangle";
      osc.frequency.setValueAtTime(frequency, start);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(cutoff || 3000, start);
      filter.Q.value = 0.65;
      panner.pan.value = pan;
      const stopAt = envelope(gain, start, volume, attack || 0.02, seconds * 0.58, release || 0.2);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(master);
      osc.start(start);
      osc.stop(Math.min(duration, stopAt + 0.03));
    }

    function kick(start, volume) {
      if (start >= duration) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(132, start);
      osc.frequency.exponentialRampToValueAtTime(42, Math.min(duration, start + 0.16));
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, Math.min(duration, start + 0.008));
      gain.gain.exponentialRampToValueAtTime(0.0001, Math.min(duration, start + 0.22));
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(Math.min(duration, start + 0.24));
    }

    const noiseBuffer = ctx.createBuffer(1, Math.ceil(sampleRate * 0.2), sampleRate);
    const noise = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 2 - 1) * (1 - i / noise.length);

    function noiseHit(start, volume, frequency, lengthSeconds, pan = 0) {
      if (start >= duration) return;
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner();
      source.buffer = noiseBuffer;
      filter.type = "highpass";
      filter.frequency.value = frequency;
      panner.pan.value = pan;
      const stopAt = envelope(gain, start, volume, 0.004, lengthSeconds * 0.22, lengthSeconds * 0.78);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(master);
      source.start(start);
      source.stop(Math.min(duration, stopAt + 0.015));
    }

    function pluck(frequency, start, volume, pan = 0) {
      if (start >= duration) return;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(frequency, start);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2600, start);
      filter.frequency.exponentialRampToValueAtTime(720, Math.min(duration, start + 0.28));
      panner.pan.value = pan;
      const stopAt = envelope(gain, start, volume, 0.006, 0.035, 0.28);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(master);
      osc.start(start);
      osc.stop(Math.min(duration, stopAt + 0.02));
    }

    for (let bar = 0; bar < bars; bar++) {
      const start = bar * barLength;
      const chord = progressions[bar % progressions.length];
      const build = bar / Math.max(1, bars - 1);
      for (let i = 0; i < chord.length; i++) {
        const frequency = chord[i];
        const pan = (i - 1.5) * 0.12;
        voice(frequency, start, barLength * 0.92, 0.025, "sawtooth", 1250, 0.55, 0.4, pan);
        voice(frequency * 2, start + 0.04, barLength * 0.8, 0.012, "sine", 2600, 0.7, 0.34, -pan);
      }
      const root = chord[0] / 2;
      for (let beatNo = 0; beatNo < 4; beatNo++) {
        const t = start + beat * beatNo;
        voice(root, t, beat * 0.8, mood === "energetic" ? 0.11 : 0.075, "triangle", 520, 0.012, 0.18, -0.08);
        if (beatNo === 0 || (mood === "energetic" && beatNo === 2)) kick(t, mood === "energetic" ? 0.22 : 0.12);
        if (beatNo === 1 || beatNo === 3) noiseHit(t, mood === "energetic" ? 0.055 : 0.025, 1700, 0.12, 0.1);
        noiseHit(t + beat * 0.5, mood === "energetic" ? 0.045 : 0.022, 6200, 0.07, beatNo % 2 ? -0.25 : 0.25);
      }
      const arpCount = mood === "energetic" || mood === "travel" ? 8 : 4;
      for (let step = 0; step < arpCount; step++) {
        const interval = barLength / arpCount;
        const degree = notes[(step + bar) % notes.length];
        const base = chord[step % chord.length];
        const frequency = base * Math.pow(2, degree / 12);
        pluck(frequency, start + step * interval, (0.026 + build * 0.012) * (mood === "energetic" ? 1.45 : 1), (step % 2 ? 0.34 : -0.34));
      }
    }

    return await ctx.startRendering();
  }

  let detectorPromise = null;
  async function makeDetector(onProgress) {
    if (detectorPromise) return detectorPromise;
    detectorPromise = (async () => {
      sayProgress(onProgress, "Loading the local smart-framing model…", 9);
      const { pipeline, env } = await getTransformers();
      env.allowRemoteModels = true;
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      const useGPU = !!navigator.gpu;
      const progress_callback = event => {
        if (event && event.status === "progress" && Number.isFinite(event.progress)) {
          sayProgress(onProgress, "Downloading smart-framing model… " + Math.round(event.progress) + "%", 9 + event.progress * 0.2);
        }
      };
      try {
        return await pipeline("object-detection", "Xenova/yolos-tiny", {
          dtype: "q8", device: useGPU ? "webgpu" : "wasm", progress_callback
        });
      } catch (error) {
        if (!useGPU) throw error;
        console.warn("Smart-framing WebGPU fallback:", error);
        return await pipeline("object-detection", "Xenova/yolos-tiny", {
          dtype: "q8", device: "wasm", progress_callback
        });
      }
    })().catch(error => {
      detectorPromise = null;
      throw error;
    });
    return detectorPromise;
  }

  async function analyzeVisual(imageInput, onProgress) {
    if (!imageInput) return [];
    const detector = await makeDetector(onProgress);
    sayProgress(onProgress, "Finding the main subject in this scene…", 36);
    const result = await detector(imageInput, { threshold: 0.28 });
    return (Array.isArray(result) ? result : [])
      .filter(item => item && item.box && Number.isFinite(item.score))
      .map(item => ({
        label: String(item.label || "object"),
        score: Number(item.score),
        box: {
          xmin: Number(item.box.xmin), ymin: Number(item.box.ymin),
          xmax: Number(item.box.xmax), ymax: Number(item.box.ymax)
        }
      }))
      .filter(item => item.box.xmax > item.box.xmin && item.box.ymax > item.box.ymin)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }

  async function releaseVision() {
    if (!detectorPromise) return;
    try {
      const detector = await detectorPromise;
      if (detector && typeof detector.dispose === "function") await detector.dispose();
    } catch (_) {}
    detectorPromise = null;
  }

  window.ReelForgeAI = {
    transcribe,
    synthesize,
    generateMusic,
    analyzeVisual,
    releaseVision
  };
})();