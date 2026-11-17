(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = { assets: [], audioFile: null, audioUrl: null, outputUrl: null, outputBlob: null, rendering: false };
  const mediaInput = $("mediaFiles");
  const audioInput = $("audioFile");
  const promptInput = $("editPrompt");
  const generateBtn = $("generateBtn");
  const hiddenMedia = document.createElement("div");
  hiddenMedia.setAttribute("aria-hidden", "true");
  hiddenMedia.style.cssText = "position:fixed;left:-10000px;top:0;width:2px;height:2px;overflow:hidden;pointer-events:none";
  document.body.appendChild(hiddenMedia);

  const formatBytes = (n) => n < 1024 * 1024 ? (n / 1024).toFixed(0) + " KB" : (n / 1024 / 1024).toFixed(1) + " MB";
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const safeName = (name) => String(name).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const setStatus = (text, percent) => {
    $("statusText").textContent = text;
    $("progressBar").style.width = clamp(percent, 0, 100) + "%";
  };
  const revoke = (url) => { if (url) URL.revokeObjectURL(url); };

  function clearOutput() {
    revoke(state.outputUrl);
    state.outputUrl = null;
    state.outputBlob = null;
    $("outputWrap").hidden = true;
    $("outputVideo").removeAttribute("src");
    $("downloadBtn").removeAttribute("href");
    $("renderPanel").hidden = true;
  }

  function loadAsset(file) {
    const url = URL.createObjectURL(file);
    const image = file.type.startsWith("image/");
    const element = image ? new Image() : document.createElement("video");
    const asset = { file, url, image, element, duration: image ? 5 : 0, width: 0, height: 0, ready: false };
    if (!image) {
      element.muted = true;
      element.defaultMuted = true;
      element.playsInline = true;
      element.preload = "auto";
      element.setAttribute("playsinline", "");
      element.loop = true;
      hiddenMedia.appendChild(element);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Could not read " + file.name)), 25000);
      const done = () => {
        clearTimeout(timer);
        asset.width = image ? element.naturalWidth : element.videoWidth;
        asset.height = image ? element.naturalHeight : element.videoHeight;
        asset.duration = image ? 5 : Math.max(0.5, element.duration || 0);
        asset.ready = true;
        resolve(asset);
      };
      if (image) {
        element.onload = done;
        element.onerror = () => { clearTimeout(timer); reject(new Error("Unsupported image: " + file.name)); };
        element.src = url;
      } else {
        element.onloadedmetadata = done;
        element.onerror = () => { clearTimeout(timer); reject(new Error("This video could not be opened: " + file.name)); };
        element.src = url;
        if (element.readyState >= 1 && element.videoWidth) done();
      }
    });
  }

  async function addFiles(files) {
    clearOutput();
    const incoming = Array.from(files || []).filter(f => f.type.startsWith("video/") || f.type.startsWith("image/"));
    if (!incoming.length) return;
    if (state.assets.length + incoming.length > 12) {
      alert("Choose up to 12 photos and videos.");
      return;
    }
    $("assetList").innerHTML = '<p class="empty-state">Reading your files…</p>';
    generateBtn.disabled = true;
    try {
      for (const file of incoming) {
        if (file.size > 250 * 1024 * 1024) {
          alert(file.name + " is over 250 MB. For phone stability, choose a smaller file.");
          continue;
        }
        const asset = await loadAsset(file);
        state.assets.push(asset);
      }
      renderAssets();
    } catch (error) {
      alert(error.message + ". Try a different file format.");
      renderAssets();
    }
    updateReady();
  }

  function renderAssets() {
    if (!state.assets.length) {
      $("assetList").innerHTML = '<p class="empty-state">Your selected files will appear here.</p>';
      return;
    }
    $("assetList").innerHTML = state.assets.map((asset, i) => {
      const thumb = asset.image ? asset.url : "";
      const kind = asset.image ? "PHOTO" : "VIDEO · " + asset.duration.toFixed(1) + "s";
      return '<div class="asset-item">' +
        (thumb ? '<img class="asset-thumb" src="' + thumb + '" alt="">' : '<div class="asset-thumb video-thumb">▶</div>') +
        '<div class="asset-details"><strong>' + safeName(asset.file.name) + '</strong><small>' + kind + ' · ' + formatBytes(asset.file.size) + '</small></div>' +
        '<button class="remove-asset" type="button" data-remove="' + i + '" aria-label="Remove file">×</button></div>';
    }).join("");
    $("assetList").querySelectorAll("[data-remove]").forEach(button => button.addEventListener("click", () => {
      const index = Number(button.dataset.remove);
      const [asset] = state.assets.splice(index, 1);
      if (asset) { revoke(asset.url); if (!asset.image) asset.element.remove(); }
      clearOutput();
      renderAssets();
      updateReady();
    }));
  }

  function updateReady() {
    generateBtn.disabled = state.assets.length === 0 || state.rendering;
  }

  function parsePrompt() {
    const prompt = promptInput.value.trim();
    const durationMatch = prompt.match(/(15|30|45|60)\s*(?:s|sec|secs|seconds)\b/i);
    if (durationMatch) $("duration").value = durationMatch[1];
    const lower = prompt.toLowerCase();
    const quoteMatch = prompt.match(/["“]([^"”]{2,80})["”]/);
    const words = [];
    let look = "clean";
    let mood = "cinematic";
    if (/cinematic|film|movie|dramatic/.test(lower)) { look = "cinematic"; words.push("Cinematic colour and framing"); }
    if (/warm|golden|sunset|nostalgic/.test(lower)) { look = "warm"; words.push("Warm colour tone"); }
    if (/black.?and.?white|monochrome|b&w/.test(lower)) { look = "mono"; words.push("Monochrome grade"); }
    if (/romantic|love|emotional|memory/.test(lower)) { mood = "romantic"; words.push("Emotional pacing"); }
    if (/travel|journey|holiday|vacation/.test(lower)) { mood = "travel"; words.push("Travel-film pacing"); }
    if (/fast|energetic|quick|car edit|sports|beat cut/.test(lower)) { mood = "energetic"; words.push("Dynamic beat cuts"); }
    if (/motivational|inspirational|success/.test(lower)) { mood = "motivational"; words.push("Motivational build"); }
    if (/beat|music|rhythm|sync/.test(lower) && (state.audioFile || $("autoMusic").checked)) words.push("Beat-aware cut timing");
    if (/title|text|caption|words/.test(lower) && quoteMatch) words.push("Animated title: “" + quoteMatch[1] + "”");
    const transition = /flash|strobe|punchy/.test(lower) ? "flash" : /slide|swipe/.test(lower) ? "slide" : /zoom transition/.test(lower) ? "zoom" : "crossfade";
    words.push(transition === "flash" ? "Flash transitions" : transition === "slide" ? "Slide transitions" : transition === "zoom" ? "Zoom transitions" : "Cross-fade transitions");
    words.push("Animated camera movement", "VFX light leaks and vignette");
    if ($("autoCaptions").checked) words.push("Automatic timed captions");
    if (!state.audioFile && $("autoMusic").checked) words.push("Original generated music");
    if (!words.length) words.push("Balanced cuts", "Vertical crop", "Animated motion");
    const audioText = state.audioFile ? "Your uploaded audio will be mixed into the edit. " : ($("autoMusic").checked ? "An original instrumental score will be created. " : "The export will be silent unless the source clips contain audio. ");
    $("planText").textContent = "I’ll build a " + $("duration").value + "-second vertical edit from " + state.assets.length + " item(s). " + audioText + "Captions and voice-over are generated locally when selected or suitable.";
    $("planTags").innerHTML = words.map(w => "<span>" + safeName(w) + "</span>").join("");
    $("plan").hidden = false;
    return {
      prompt, look, mood, transition,
      title: quoteMatch ? quoteMatch[1] : "",
      beatSync: /beat|music|rhythm|sync/.test(lower) && !!state.audioFile,
      fast: /fast|energetic|quick|car edit|sports/.test(lower),
      slow: /slow|emotional|calm|memory/.test(lower),
      fades: /fade|smooth|transition/.test(lower),
      vfx: true,
      particles: /spark|glow|light|cinematic|night|neon/.test(lower),
      whooshes: /vfx|effect|transition|cinematic|dynamic/.test(lower)
    };
  }

  function narrationFor(plan) {
    const manual = $("narrationText").value.trim();
    const setting = $("voiceLanguage").value;
    const hindi = setting === "hi" || (setting === "auto" && (/hindi|हिंदी|[ऀ-ॿ]/i.test(plan.prompt)));
    if (manual) return { text: manual, language: hindi || /[ऀ-ॿ]/.test(manual) ? "hi" : "en" };
    if (!$("autoVoice").checked) return null;
    const p = plan.prompt.toLowerCase();
    const romantic = /love|romantic|relationship|emotional story|memory|yaad|प्यार|कहानी/.test(p);
    const travel = /travel|journey|trip|vacation|mountain|beach|safar|सफ़र|यात्रा/.test(p);
    const motivation = /motivational|motivation|inspirational|success|discipline|मेहनत|प्रेरणा/.test(p);
    const explain = /educational|explain|explainer|documentary|tutorial|history|science|facts|जानकारी/.test(p);
    const explicitlyRequested = /voice.?over|voiceover|narrat|speak|spoken words|storytelling/.test(p);
    if (!(romantic || travel || motivation || explain || explicitlyRequested)) return null;
    if (hindi) {
      if (romantic) return { text: "कुछ पल बिना कहे भी बहुत कुछ कह जाते हैं। कुछ कहानियाँ खत्म होकर भी दिल में रह जाती हैं।", language: "hi" };
      if (travel) return { text: "हर सफ़र सिर्फ़ मंज़िल तक पहुँचने के लिए नहीं होता। कुछ रास्ते यादों में बस जाते हैं।", language: "hi" };
      if (motivation) return { text: "हर बड़ी शुरुआत एक छोटे कदम से होती है। चलते रहिए, आपकी कहानी अभी बाकी है।", language: "hi" };
      if (explain) return { text: "हर चीज़ के पीछे एक कहानी होती है। आइए, इसे थोड़ा करीब से समझते हैं।", language: "hi" };
      return { text: "हर फ्रेम एक पल को संभालकर रखता है। और कुछ पल हमेशा हमारे साथ रहते हैं।", language: "hi" };
    }
    if (romantic) return { text: "Some moments say everything without a word. And some stories stay with us long after they end.", language: "en" };
    if (travel) return { text: "A journey is never only about the destination. It is about the moments that stay with you.", language: "en" };
    if (motivation) return { text: "Every great beginning starts with one small step. Keep moving. Your story is still being written.", language: "en" };
    if (explain) return { text: "There is a story behind every detail. Let us take a closer look and understand what makes it matter.", language: "en" };
    return { text: "Every frame holds a moment. Every moment leaves something behind.", language: "en" };
  }

  function captionsFromTranscript(transcript) {
    const chunks = transcript && transcript.chunks ? transcript.chunks : [];
    const output = [];
    let group = [];
    for (const chunk of chunks) {
      const tokens = String(chunk.text || "").trim().split(/\s+/).filter(Boolean);
      for (const token of tokens) {
        if (!group.length) group.push({ word: token, start: chunk.start, end: chunk.end });
        else group.push({ word: token, start: Math.max(group[0].start, chunk.start), end: chunk.end });
        if (group.length >= 5 || /[.!?।]$/.test(token)) {
          output.push({ text: group.map(item => item.word).join(" "), start: group[0].start, end: Math.max(group[0].start + 0.35, group[group.length - 1].end) });
          group = [];
        }
      }
    }
    if (group.length) output.push({ text: group.map(item => item.word).join(" "), start: group[0].start, end: Math.max(group[0].start + 0.5, group[group.length - 1].end) });
    if (output.length) return output;
    const text = transcript && transcript.text ? transcript.text.trim() : "";
    if (!text) return [];
    const words = text.split(/\s+/);
    const duration = Math.max(3, transcript.duration || 12);
    const per = Math.ceil(words.length / Math.max(1, Math.ceil(duration / 2.5)));
    for (let i = 0; i < words.length; i += per) {
      const start = duration * i / words.length;
      const end = duration * Math.min(words.length, i + per) / words.length;
      output.push({ text: words.slice(i, i + per).join(" "), start, end });
    }
    return output;
  }

  function captionsFromScript(script, duration) {
    const words = script.trim().split(/\s+/).filter(Boolean);
    const groups = [];
    for (let i = 0; i < words.length; i += 5) groups.push(words.slice(i, i + 5));
    const total = words.length || 1;
    let cursor = 0;
    return groups.map(group => {
      const start = cursor;
      cursor += duration * group.length / total;
      return { text: group.join(" "), start, end: cursor };
    });
  }

  function drawCaptions(ctx, width, height, captions, time) {
    if (!captions || !captions.length) return;
    const item = captions.find(c => time >= c.start && time <= c.end);
    if (!item) return;
    const text = item.text.trim();
    if (!text) return;
    ctx.save();
    const fontSize = Math.round(width * 0.045);
    ctx.font = "800 " + fontSize + "px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
      const trial = line ? line + " " + word : word;
      if (ctx.measureText(trial).width > width * 0.82 && line) {
        lines.push(line);
        line = word;
      } else line = trial;
    }
    if (line) lines.push(line);
    const shown = lines.slice(0, 2);
    const lineHeight = fontSize * 1.25;
    const boxHeight = shown.length * lineHeight + fontSize * 0.9;
    const boxY = height * 0.79;
    const boxX = width * 0.07;
    const boxWidth = width * 0.86;
    ctx.fillStyle = "rgba(5,7,11,.58)";
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, fontSize * 0.35);
    ctx.fill();
    ctx.lineWidth = Math.max(2, width * 0.003);
    ctx.strokeStyle = "rgba(0,0,0,.7)";
    ctx.fillStyle = "#ffffff";
    shown.forEach((row, index) => {
      const y = boxY + fontSize * 0.52 + index * lineHeight + lineHeight * 0.5;
      ctx.strokeText(row, width / 2, y, boxWidth - 22);
      ctx.fillText(row, width / 2, y, boxWidth - 22);
    });
    ctx.restore();
  }

  function drawVfx(ctx, width, height, time, plan) {
    if (!plan.vfx) return;
    ctx.save();
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.7);
    const leak = ctx.createRadialGradient(width * (0.12 + 0.76 * pulse), height * 0.18, 0, width * (0.12 + 0.76 * pulse), height * 0.18, width * 0.8);
    leak.addColorStop(0, plan.mood === "romantic" ? "rgba(255,160,125,.12)" : "rgba(255,205,130,.11)");
    leak.addColorStop(1, "rgba(255,170,100,0)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = leak;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
    const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.16, width / 2, height / 2, height * 0.78);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,.48)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    if (plan.particles) {
      ctx.globalAlpha = 0.24;
      for (let i = 0; i < 18; i++) {
        const x = ((i * 83 + time * (13 + i % 4) * 8) % width);
        const y = height - ((i * 127 + time * (18 + i % 5) * 10) % height);
        const radius = Math.max(1.5, width * (0.0015 + (i % 3) * 0.0006));
        ctx.fillStyle = i % 2 ? "#f4d3a8" : "#c7d8e6";
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (plan.look === "cinematic") {
      ctx.fillStyle = "rgba(0,0,0,.16)";
      ctx.fillRect(0, 0, width, height * 0.045);
      ctx.fillRect(0, height * 0.955, width, height * 0.045);
    }
    ctx.restore();
  }

  async function detectBeats(file) {
    if (!file) return [];
    let context;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return [];
      context = new AudioCtx();
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      const samples = buffer.getChannelData(0);
      const hop = Math.max(1, Math.floor(buffer.sampleRate * 0.05));
      const energies = [];
      for (let i = 0; i < samples.length; i += hop) {
        let sum = 0;
        const end = Math.min(samples.length, i + hop);
        for (let j = i; j < end; j += 4) sum += samples[j] * samples[j];
        energies.push(Math.sqrt(sum / Math.max(1, Math.ceil((end - i) / 4))));
      }
      const mean = energies.reduce((a, b) => a + b, 0) / Math.max(1, energies.length);
      const beats = [];
      for (let i = 2; i < energies.length - 2; i++) {
        const e = energies[i];
        if (e > mean * 1.45 && e > energies[i-1] && e >= energies[i+1]) {
          const time = i * 0.05;
          if (!beats.length || time - beats[beats.length - 1] > 0.28) beats.push(time);
        }
      }
      return beats;
    } catch (error) {
      console.warn("Beat analysis was skipped:", error);
      return [];
    } finally {
      if (context) await context.close().catch(() => {});
    }
  }

  function createBoundaries(total, count, beats, sync) {
    const boundaries = [0];
    for (let i = 1; i < count; i++) {
      const ideal = total * i / count;
      let point = ideal;
      if (sync && beats.length) {
        let closest = ideal;
        let distance = 0.85;
        for (const beat of beats) {
          const d = Math.abs(beat - ideal);
          if (d < distance && beat > boundaries[boundaries.length - 1] + 1.8 && beat < total - 1.5) {
            closest = beat;
            distance = d;
          }
        }
        point = closest;
      }
      point = clamp(point, boundaries[boundaries.length - 1] + 0.6, total - (count - i) * 0.6);
      boundaries.push(point);
    }
    boundaries.push(total);
    return boundaries;
  }

  function drawCover(ctx, source, width, height, zoom, panX, panY) {
    const sw = source.videoWidth || source.naturalWidth || source.width;
    const sh = source.videoHeight || source.naturalHeight || source.height;
    if (!sw || !sh) return false;
    const scale = Math.max(width / sw, height / sh) * zoom;
    const dw = sw * scale, dh = sh * scale;
    ctx.drawImage(source, (width - dw) / 2 + width * (panX || 0), (height - dh) / 2 + height * (panY || 0), dw, dh);
    return true;
  }

  function drawTitle(ctx, width, height, title, progress) {
    if (!title || progress > 0.25) return;
    const fade = clamp(Math.min(progress / 0.06, (0.25 - progress) / 0.05, 1), 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;
    const y = height * 0.78;
    const gradient = ctx.createLinearGradient(0, y - 150, 0, height);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,.65)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y - 150, width, 150);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const maxWidth = width * 0.82;
    let fontSize = Math.round(width * 0.065);
    ctx.font = "700 " + fontSize + "px system-ui, sans-serif";
    while (ctx.measureText(title).width > maxWidth && fontSize > 22) {
      fontSize -= 2;
      ctx.font = "700 " + fontSize + "px system-ui, sans-serif";
    }
    ctx.shadowColor = "rgba(0,0,0,.6)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(title, width / 2, y - 38, maxWidth);
    ctx.restore();
  }

  async function renderEdit(plan) {
    const duration = Number($("duration").value);
    const size = Number($("quality").value);
    const width = size === 1080 ? 1080 : 720;
    const height = Math.round(width * 16 / 9);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("This browser cannot create the video canvas.");
    const beats = plan.beatSync ? await detectBeats(state.audioFile) : [];
    const boundaries = createBoundaries(duration, state.assets.length, beats, plan.beatSync);
    const timeline = state.assets.map((asset, index) => ({ asset, start: boundaries[index], end: boundaries[index + 1], duration: boundaries[index + 1] - boundaries[index] }));
    const mimeCandidates = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mimeType = mimeCandidates.find(type => window.MediaRecorder && MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("Your browser does not support video recording. Please try the latest Chrome browser.");
    const stream = canvas.captureStream(30);
    let audioContext = null, music = null, recorder = null;
    if (state.audioFile) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioCtx();
      const destination = audioContext.createMediaStreamDestination();
      music = new Audio(state.audioUrl);
      music.loop = true;
      music.preload = "auto";
      const source = audioContext.createMediaElementSource(music);
      const gain = audioContext.createGain();
      gain.gain.value = 0.82;
      source.connect(gain);
      gain.connect(destination);
      destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      await audioContext.resume();
    }
    const chunks = [];
    const bitrate = size === 1080 ? 6500000 : 3800000;
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate, audioBitsPerSecond: 160000 });
    state.recorder = recorder;
    const recorded = new Promise((resolve, reject) => {
      recorder.ondataavailable = event => { if (event.data && event.data.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error("The browser stopped recording. Try 720p or a shorter reel."));
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
    });
    const started = performance.now();
    let activeIndex = -1;
    let animationId = 0;
    let lastProgress = 0;
    const draw = (now) => {
      const elapsed = (now - started) / 1000;
      const t = Math.min(duration, elapsed);
      let index = timeline.findIndex(scene => t >= scene.start && t < scene.end);
      if (index < 0) index = timeline.length - 1;
      const scene = timeline[index];
      const local = clamp((t - scene.start) / scene.duration, 0, 1);
      if (index !== activeIndex) {
        if (activeIndex >= 0 && !timeline[activeIndex].asset.image) timeline[activeIndex].asset.element.pause();
        activeIndex = index;
        if (!scene.asset.image) {
          const video = scene.asset.element;
          video.pause();
          try { video.currentTime = 0; } catch (_) {}
          video.playbackRate = clamp(scene.asset.duration / scene.duration, 0.5, 2.5);
          video.play().catch(() => {});
        }
      }
      ctx.fillStyle = "#08090b";
      ctx.fillRect(0, 0, width, height);
      let drew = false;
      const source = scene.asset.element;
      if (scene.asset.image || source.readyState >= 2) {
        const zoom = scene.asset.image ? 1.02 + 0.06 * local : 1.015;
        drew = drawCover(ctx, source, width, height, zoom);
      }
      if (!drew) {
        ctx.fillStyle = "#1c2028";
        ctx.fillRect(0, 0, width, height);
      }
      if (plan.look === "warm") {
        ctx.fillStyle = "rgba(186,112,55,.12)";
        ctx.fillRect(0, 0, width, height);
      } else if (plan.look === "cinematic") {
        ctx.fillStyle = "rgba(7,12,21,.12)";
        ctx.fillRect(0, 0, width, height);
      } else if (plan.look === "mono") {
        const frame = ctx.getImageData(0, 0, width, height);
        const pixels = frame.data;
        for (let p = 0; p < pixels.length; p += 4) {
          const gray = 0.299 * pixels[p] + 0.587 * pixels[p+1] + 0.114 * pixels[p+2];
          pixels[p] = pixels[p+1] = pixels[p+2] = gray;
        }
        ctx.putImageData(frame, 0, 0);
      }
      if (plan.fades) {
        const edge = Math.min(local / 0.08, (1 - local) / 0.08, 1);
        if (edge < 1) {
          ctx.fillStyle = "rgba(0,0,0," + (1 - clamp(edge, 0, 1)) + ")";
          ctx.fillRect(0, 0, width, height);
        }
      }
      drawTitle(ctx, width, height, plan.title, t / duration);
      if (elapsed >= duration) {
        if (animationId) cancelAnimationFrame(animationId);
        timeline.forEach(s => { if (!s.asset.image) s.asset.element.pause(); });
        if (music) music.pause();
        recorder.stop();
        setStatus("Finishing your file…", 98);
        return;
      }
      const progress = Math.floor(elapsed / duration * 96);
      if (progress !== lastProgress) {
        lastProgress = progress;
        setStatus("Editing scene " + (index + 1) + " of " + timeline.length + "…", progress);
      }
      animationId = requestAnimationFrame(draw);
    };
    recorder.start(500);
    if (music) {
      music.currentTime = 0;
      await music.play().catch(() => {});
    }
    const first = timeline[0];
    if (!first.asset.image) {
      first.asset.element.currentTime = 0;
      await first.asset.element.play().catch(() => {});
    }
    animationId = requestAnimationFrame(draw);
    const blob = await recorded;
    timeline.forEach(s => { if (!s.asset.image) s.asset.element.pause(); });
    stream.getTracks().forEach(track => track.stop());
    if (audioContext) await audioContext.close().catch(() => {});
    state.recorder = null;
    return { blob, mimeType: recorder.mimeType || mimeType, duration, width, height };
  }

  async function generate() {
    if (!state.assets.length || state.rendering) return;
    clearOutput();
    state.rendering = true;
    mediaInput.disabled = true;
    audioInput.disabled = true;
    promptInput.disabled = true;
    $("duration").disabled = true;
    $("quality").disabled = true;
    updateReady();
    $("renderPanel").hidden = false;
    $("renderState").textContent = "Working";
    setStatus("Reading your prompt and preparing the edit…", 2);
    $("renderPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const plan = parsePrompt();
      if (state.assets.some(a => !a.ready)) throw new Error("One of your files has not finished loading. Please try again.");
      const result = await renderEdit(plan);
      state.outputBlob = result.blob;
      state.outputUrl = URL.createObjectURL(result.blob);
      $("outputVideo").src = state.outputUrl;
      const mp4 = result.mimeType.toLowerCase().includes("mp4");
      const extension = mp4 ? "mp4" : "webm";
      const filename = "reelforge-edit-" + new Date().toISOString().slice(0,10) + "." + extension;
      $("downloadBtn").href = state.outputUrl;
      $("downloadBtn").download = filename;
      $("outputInfo").textContent = result.width + " × " + result.height + " · " + result.duration + " sec · " + extension.toUpperCase();
      $("formatNote").textContent = mp4
        ? "Your browser recorded an MP4. The file has no added watermark."
        : "Your phone's browser recorded WEBM, not MP4. This version does not run a heavy phone-side MP4 conversion yet. Download is watermark-free; Instagram compatibility may vary.";
      $("outputWrap").hidden = false;
      $("renderState").textContent = "Ready";
      setStatus("Your edit is ready.", 100);
    } catch (error) {
      $("renderState").textContent = "Needs attention";
      setStatus(error.message || "Something went wrong while rendering.", 0);
      console.error(error);
    } finally {
      state.rendering = false;
      mediaInput.disabled = false;
      audioInput.disabled = false;
      promptInput.disabled = false;
      $("duration").disabled = false;
      $("quality").disabled = false;
      updateReady();
    }
  }

  mediaInput.addEventListener("change", e => addFiles(e.target.files));
  audioInput.addEventListener("change", () => {
    const file = audioInput.files && audioInput.files[0];
    revoke(state.audioUrl);
    state.audioFile = file || null;
    state.audioUrl = file ? URL.createObjectURL(file) : null;
    $("audioName").textContent = file ? file.name + " · " + formatBytes(file.size) : "No audio selected";
    clearOutput();
  });
  document.querySelectorAll("[data-prompt]").forEach(button => button.addEventListener("click", () => {
    promptInput.value = button.dataset.prompt;
    parsePrompt();
  }));
  promptInput.addEventListener("input", () => {
    if (state.assets.length) parsePrompt();
    clearOutput();
  });
  $("duration").addEventListener("change", clearOutput);
  $("quality").addEventListener("change", clearOutput);
  generateBtn.addEventListener("click", generate);
  $("shareBtn").addEventListener("click", async () => {
    if (!state.outputBlob) return;
    const extension = state.outputBlob.type.includes("mp4") ? "mp4" : "webm";
    const file = new File([state.outputBlob], "reelforge-export." + extension, { type: state.outputBlob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      try { await navigator.share({ files: [file], title: "My ReelForge edit" }); }
      catch (error) { if (error.name !== "AbortError") alert("Sharing was unavailable. Use Download video instead."); }
    } else {
      alert("Your browser does not support file sharing here. Download the video, then upload it to Instagram.");
    }
  });

  const dropzone = $("dropzone");
  dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("dragging"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragging"));
  dropzone.addEventListener("drop", e => {
    e.preventDefault();
    dropzone.classList.remove("dragging");
    addFiles(e.dataTransfer.files);
  });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(error => console.warn("Offline cache unavailable:", error)));
  }

  updateReady();
})();