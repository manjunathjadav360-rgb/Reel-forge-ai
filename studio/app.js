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

  function captionsFromTranscript(transcript, offset = 0, playbackRate = 1) {
    const chunks = transcript && transcript.chunks ? transcript.chunks : [];
    const output = [];
    let group = [];
    const timeOf = value => offset + (Number(value) || 0) / Math.max(0.25, playbackRate);
    for (const chunk of chunks) {
      const tokens = String(chunk.text || "").trim().split(/\s+/).filter(Boolean);
      for (const token of tokens) {
        const start = timeOf(chunk.start);
        const end = timeOf(chunk.end);
        if (!group.length) group.push({ word: token, start, end });
        else group.push({ word: token, start: Math.max(group[0].start, start), end });
        if (group.length >= 4 || /[.!?।]$/.test(token)) {
          const words = group.map(item => item.word);
          output.push({ text: words.join(" "), words, start: group[0].start, end: Math.max(group[0].start + 0.35, group[group.length - 1].end) });
          group = [];
        }
      }
    }
    if (group.length) {
      const words = group.map(item => item.word);
      output.push({ text: words.join(" "), words, start: group[0].start, end: Math.max(group[0].start + 0.5, group[group.length - 1].end) });
    }
    if (output.length) return output;
    const text = transcript && transcript.text ? transcript.text.trim() : "";
    if (!text) return [];
    const words = text.split(/\s+/);
    const sourceDuration = Math.max(3, transcript.duration || 12) / Math.max(0.25, playbackRate);
    const per = Math.ceil(words.length / Math.max(1, Math.ceil(sourceDuration / 2.2)));
    for (let i = 0; i < words.length; i += per) {
      const groupWords = words.slice(i, i + per);
      const start = offset + sourceDuration * i / words.length;
      const end = offset + sourceDuration * Math.min(words.length, i + per) / words.length;
      output.push({ text: groupWords.join(" "), words: groupWords, start, end });
    }
    return output;
  }

  function captionsFromScript(script, speechDuration, offset = 0) {
    const words = script.trim().split(/\s+/).filter(Boolean);
    const groups = [];
    for (let i = 0; i < words.length; i += 4) groups.push(words.slice(i, i + 4));
    const total = words.length || 1;
    const usableDuration = Math.max(0.7, speechDuration || 2);
    let cursor = offset;
    return groups.map(group => {
      const start = cursor;
      cursor += usableDuration * group.length / total;
      return { text: group.join(" "), words: group, start, end: cursor };
    });
  }

  function drawCaptions(ctx, width, height, captions, time) {
    if (!captions || !captions.length) return;
    const item = captions.find(c => time >= c.start && time <= c.end);
    if (!item) return;
    const words = item.words && item.words.length ? item.words : item.text.trim().split(/\s+/);
    if (!words.length) return;
    const span = Math.max(0.12, item.end - item.start);
    const progress = clamp((time - item.start) / span, 0, 0.999);
    const activeWord = Math.min(words.length - 1, Math.floor(progress * words.length));
    ctx.save();
    const fontSize = Math.round(width * 0.044);
    ctx.font = "800 " + fontSize + "px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const maxLine = width * 0.78;
    const lines = [];
    let line = [];
    let lineWidth = 0;
    const gap = fontSize * 0.28;
    words.forEach((word, index) => {
      const w = ctx.measureText(word).width;
      const nextWidth = lineWidth + (line.length ? gap : 0) + w;
      if (nextWidth > maxLine && line.length) {
        lines.push(line);
        line = [];
        lineWidth = 0;
      }
      line.push({ word, index, width: w });
      lineWidth += (line.length > 1 ? gap : 0) + w;
    });
    if (line.length) lines.push(line);
    const shown = lines.slice(0, 2);
    const lineHeight = fontSize * 1.25;
    const boxHeight = shown.length * lineHeight + fontSize * 0.78;
    const boxY = height * 0.79;
    const boxX = width * 0.055;
    const boxWidth = width * 0.89;
    const enter = clamp((time - item.start) / 0.12, 0, 1);
    ctx.translate(width / 2, boxY + boxHeight / 2);
    ctx.scale(0.96 + 0.04 * enter, 0.96 + 0.04 * enter);
    ctx.translate(-width / 2, -(boxY + boxHeight / 2));
    ctx.fillStyle = "rgba(5,7,11,.68)";
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(boxX, boxY, boxWidth, boxHeight, fontSize * 0.38);
    else ctx.rect(boxX, boxY, boxWidth, boxHeight);
    ctx.fill();
    ctx.fillStyle = "rgba(240,212,176,.9)";
    ctx.fillRect(width * 0.42, boxY + boxHeight - 3, width * 0.16, 3);
    shown.forEach((row, rowIndex) => {
      const totalWidth = row.reduce((sum, item, index) => sum + item.width + (index ? gap : 0), 0);
      let x = (width - totalWidth) / 2;
      const y = boxY + fontSize * 0.42 + rowIndex * lineHeight + lineHeight * 0.5;
      row.forEach(token => {
        if (token.index === activeWord) {
          ctx.fillStyle = "rgba(214,181,138,.22)";
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") ctx.roundRect(x - 5, y - fontSize * 0.58, token.width + 10, fontSize * 1.12, 6);
          else ctx.rect(x - 5, y - fontSize * 0.58, token.width + 10, fontSize * 1.12);
          ctx.fill();
        }
        ctx.lineWidth = Math.max(2, width * 0.0026);
        ctx.strokeStyle = "rgba(0,0,0,.78)";
        ctx.fillStyle = token.index === activeWord ? "#f0d4b0" : "#ffffff";
        ctx.strokeText(token.word, x, y, token.width + 2);
        ctx.fillText(token.word, x, y, token.width + 2);
        x += token.width + gap;
      });
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

  function drawCover(ctx, source, width, height, zoom, panX, panY, focus) {
    const sw = source.videoWidth || source.naturalWidth || source.width;
    const sh = source.videoHeight || source.naturalHeight || source.height;
    if (!sw || !sh) return false;
    const scale = Math.max(width / sw, height / sh) * zoom;
    const dw = sw * scale, dh = sh * scale;
    const fx = focus && Number.isFinite(focus.x) ? focus.x : 0.5;
    const fy = focus && Number.isFinite(focus.y) ? focus.y : 0.5;
    let dx = width / 2 - fx * dw + width * (panX || 0);
    let dy = height / 2 - fy * dh + height * (panY || 0);
    dx = clamp(dx, Math.min(0, width - dw), Math.max(0, width - dw));
    dy = clamp(dy, Math.min(0, height - dh), Math.max(0, height - dh));
    ctx.drawImage(source, dx, dy, dw, dh);
    return true;
  }

  function drawTitle(ctx, width, height, title, progress) {
    if (!title || progress > 0.24) return;
    const enter = clamp(progress / 0.055, 0, 1);
    const fade = clamp(Math.min(progress / 0.055, (0.24 - progress) / 0.045, 1), 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;
    const y = height * 0.78;
    const gradient = ctx.createLinearGradient(0, y - 170, 0, height);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,.72)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y - 170, width, 170);
    const maxWidth = width * 0.82;
    let fontSize = Math.round(width * 0.065);
    ctx.font = "800 " + fontSize + "px system-ui, sans-serif";
    while (ctx.measureText(title).width > maxWidth && fontSize > 22) {
      fontSize -= 2;
      ctx.font = "800 " + fontSize + "px system-ui, sans-serif";
    }
    ctx.translate(width / 2, y - 38);
    ctx.scale(0.9 + 0.1 * enter, 0.9 + 0.1 * enter);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,.7)";
    ctx.shadowBlur = 16;
    ctx.lineWidth = Math.max(2, width * 0.003);
    ctx.strokeStyle = "rgba(0,0,0,.72)";
    ctx.fillStyle = "#f7f4ee";
    ctx.strokeText(title, 0, 0, maxWidth);
    ctx.fillText(title, 0, 0, maxWidth);
    ctx.restore();
  }
  function scheduleWhoosh(context, destination, time) {
    const sampleRate = context.sampleRate;
    const length = Math.ceil(sampleRate * 0.42);
    const buffer = context.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(700, time);
    filter.frequency.exponentialRampToValueAtTime(4200, time + 0.32);
    filter.Q.value = 0.65;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.12, time + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.4);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start(time);
    source.stop(time + 0.42);
  }

  function addAudioBuffer(context, destination, buffer, options) {
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = !!options.loop;
    if (options.playbackRate) source.playbackRate.value = options.playbackRate;
    gain.gain.setValueAtTime(0.0001, options.start);
    gain.gain.linearRampToValueAtTime(options.volume, options.start + Math.min(0.16, Math.max(0.04, (options.end - options.start) * 0.08)));
    if (options.end - options.start > 0.5) gain.gain.setValueAtTime(options.volume, options.end - 0.24);
    gain.gain.linearRampToValueAtTime(0.0001, options.end);
    source.connect(gain);
    gain.connect(destination);
    source.start(options.start);
    source.stop(options.end + 0.02);
    return { source, gain };
  }

  async function renderEdit(plan, production) {
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
    const timeline = state.assets.map((asset, index) => ({
      asset,
      start: boundaries[index],
      end: boundaries[index + 1],
      duration: boundaries[index + 1] - boundaries[index]
    }));
    const mimeCandidates = [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];
    const mimeType = mimeCandidates.find(type => window.MediaRecorder && MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("Your browser does not support video recording. Please try the latest Chrome browser.");
    const stream = canvas.captureStream(30);
    let audioContext = null;
    let recorder = null;
    const audioNodes = [];
    const AudioCtx = window.AudioContext || window.webkitAudioContext;

    if (AudioCtx) {
      audioContext = state.mixContext || new AudioCtx();
      state.mixContext = audioContext;
      await audioContext.resume();
      const destination = audioContext.createMediaStreamDestination();
      const master = audioContext.createGain();
      master.gain.value = 1;
      master.connect(destination);

      let uploadedBuffer = null;
      if (state.audioFile) {
        setStatus("Preparing your uploaded audio…", 43);
        try {
          uploadedBuffer = await audioContext.decodeAudioData(await state.audioFile.arrayBuffer());
        } catch (error) {
          throw new Error("I could not read the audio file. Try an MP3, M4A or WAV file.");
        }
      }

      const baseTime = audioContext.currentTime + 0.35;
      if (uploadedBuffer) {
        audioNodes.push(addAudioBuffer(audioContext, master, uploadedBuffer, {
          start: baseTime, end: baseTime + duration, volume: production.voice ? 0.38 : 0.76, loop: true
        }));
      } else if (production.musicBuffer) {
        audioNodes.push(addAudioBuffer(audioContext, master, production.musicBuffer, {
          start: baseTime, end: baseTime + duration, volume: production.voice ? 0.34 : 0.57, loop: true
        }));
      }

      if (production.voice) {
        const voiceBuffer = audioContext.createBuffer(1, production.voice.samples.length, production.voice.sampleRate);
        voiceBuffer.copyToChannel(production.voice.samples, 0);
        audioNodes.push(addAudioBuffer(audioContext, master, voiceBuffer, {
          start: baseTime + 0.08, end: baseTime + Math.min(duration, voiceBuffer.duration + 0.12), volume: 0.98, loop: false
        }));
      }

      for (const scene of timeline) {
        const asset = scene.asset;
        if (asset.image) continue;
        try {
          asset.element.muted = false;
          asset.element.volume = 1;
          if (!asset.mediaAudioSource) asset.mediaAudioSource = audioContext.createMediaElementSource(asset.element);
          const clipGain = audioContext.createGain();
          const startAt = baseTime + scene.start;
          const endAt = baseTime + scene.end;
          const clipLevel = uploadedBuffer ? 0.14 : (production.musicBuffer ? 0.2 : (production.voice ? 0.27 : 0.72));
          clipGain.gain.setValueAtTime(0.0001, baseTime);
          clipGain.gain.setValueAtTime(0.0001, startAt);
          clipGain.gain.linearRampToValueAtTime(clipLevel, Math.min(endAt, startAt + 0.12));
          clipGain.gain.setValueAtTime(clipLevel, Math.max(startAt + 0.13, endAt - 0.13));
          clipGain.gain.linearRampToValueAtTime(0.0001, endAt);
          asset.mediaAudioSource.connect(clipGain);
          clipGain.connect(master);
          audioNodes.push({ source: asset.mediaAudioSource, gain: clipGain, persistent: true });
        } catch (error) {
          console.info("Clip audio could not be routed:", asset.file.name, error);
        }
      }

      if (plan.whooshes) {
        for (let i = 1; i < timeline.length; i++) {
          scheduleWhoosh(audioContext, master, Math.max(baseTime, baseTime + timeline[i].start - 0.18));
        }
      }

      destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
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

    function paintAsset(asset, scene, local, sceneIndex, alpha, slideOffset) {
      const source = asset.element;
      if (!asset.image && source.readyState < 2) return false;
      const motion = asset.image ? (0.045 + 0.22 * local) : (0.035 + 0.055 * local);
      const zoom = 1.035 + motion;
      const direction = sceneIndex % 4;
      const panX = direction === 0 ? -0.075 + local * 0.15 : direction === 1 ? 0.07 - local * 0.14 : Math.sin(local * Math.PI) * 0.11;
      const panY = direction === 2 ? -0.08 + local * 0.16 : direction === 3 ? 0.07 - local * 0.14 : Math.cos(local * Math.PI) * 0.035;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (slideOffset) ctx.translate(width * slideOffset, 0);
      ctx.filter = plan.look === "mono" ? "grayscale(1)" : plan.look === "warm" ? "sepia(.12) saturate(1.15)" : "none";
      const result = drawCover(ctx, source, width, height, zoom, panX, panY, asset.subject);
      ctx.restore();
      return result;
    }

    const started = performance.now();
    let activeIndex = -1;
    let animationId = 0;
    let lastProgress = -1;
    const transitionLength = 0.42;
    let stopped = false;

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
          video.muted = false;
          video.pause();
          try { video.currentTime = 0; } catch (_) {}
          video.playbackRate = clamp(scene.asset.duration / scene.duration, 0.5, 2.5);
          video.play().catch(() => {});
        }
      }

      ctx.fillStyle = "#07090d";
      ctx.fillRect(0, 0, width, height);
      let drew = false;
      const transitionProgress = clamp((t - scene.start) / transitionLength, 0, 1);
      const inTransition = index > 0 && t - scene.start < transitionLength;
      if (inTransition) {
        const previous = timeline[index - 1];
        paintAsset(previous.asset, previous, 1, index - 1, 1 - transitionProgress, 0);
        if (plan.transition === "slide") {
          drew = paintAsset(scene.asset, scene, local, index, transitionProgress, 1 - transitionProgress);
        } else {
          drew = paintAsset(scene.asset, scene, local, index, transitionProgress, 0);
        }
        if (plan.transition === "flash") {
          ctx.fillStyle = "rgba(255,248,232," + (0.38 * Math.sin(transitionProgress * Math.PI)) + ")";
          ctx.fillRect(0, 0, width, height);
        } else if (plan.transition === "zoom") {
          ctx.fillStyle = "rgba(0,0,0," + (0.22 * (1 - transitionProgress)) + ")";
          ctx.fillRect(0, 0, width, height);
        }
      } else {
        drew = paintAsset(scene.asset, scene, local, index, 1, 0);
      }
      if (!drew && !inTransition) {
        ctx.fillStyle = "#1c2028";
        ctx.fillRect(0, 0, width, height);
      }

      if (plan.look === "warm") {
        ctx.fillStyle = "rgba(186,112,55,.095)";
        ctx.fillRect(0, 0, width, height);
      } else if (plan.look === "cinematic") {
        ctx.fillStyle = "rgba(7,12,21,.09)";
        ctx.fillRect(0, 0, width, height);
      }
      if (plan.fades && !inTransition) {
        const edge = Math.min(local / 0.09, (1 - local) / 0.09, 1);
        if (edge < 1) {
          ctx.fillStyle = "rgba(0,0,0," + (1 - clamp(edge, 0, 1)) * 0.68 + ")";
          ctx.fillRect(0, 0, width, height);
        }
      }
      drawVfx(ctx, width, height, t, plan);
      drawTitle(ctx, width, height, plan.title, t / duration);
      drawCaptions(ctx, width, height, production.captions, t);

      if (elapsed >= duration && !stopped) {
        stopped = true;
        if (animationId) cancelAnimationFrame(animationId);
        timeline.forEach(s => { if (!s.asset.image) s.asset.element.pause(); });
        recorder.stop();
        setStatus("Finishing your edited video…", 98);
        return;
      }
      const progress = Math.floor(elapsed / duration * 96);
      if (progress !== lastProgress) {
        lastProgress = progress;
        setStatus("Editing scene " + (index + 1) + " of " + timeline.length + " · effects, captions and sound…", 48 + progress * 0.49);
      }
      animationId = requestAnimationFrame(draw);
    };

    recorder.start(500);
    if (audioContext) await audioContext.resume();
    const first = timeline[0];
    if (!first.asset.image) {
      first.asset.element.currentTime = 0;
      await first.asset.element.play().catch(() => {});
    }
    animationId = requestAnimationFrame(draw);
    const blob = await recorded;
    timeline.forEach(s => { if (!s.asset.image) s.asset.element.pause(); });
    stream.getTracks().forEach(track => track.stop());
    audioNodes.forEach(node => {
      if (node.persistent) { try { node.gain.disconnect(); } catch (_) {} }
      else { try { node.source.stop(); } catch (_) {} }
    });
    state.recorder = null;
    return { blob, mimeType: recorder.mimeType || mimeType, duration, width, height };
  }
  async function sampleAssetForVision(asset) {
    let source = asset.element;
    let video = null;
    if (!asset.image) {
      video = asset.element;
      if (video.readyState < 2) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Video preview timed out.")), 12000);
          const done = () => { clearTimeout(timer); video.removeEventListener("loadeddata", done); resolve(); };
          video.addEventListener("loadeddata", done, { once: true });
          if (video.readyState >= 2) done();
        });
      }
      const sampleTime = Math.min(Math.max(asset.duration * 0.32, 0.12), Math.max(0.05, asset.duration - 0.08));
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Could not seek to a preview frame.")), 9000);
        const done = () => { clearTimeout(timer); video.removeEventListener("seeked", done); resolve(); };
        video.addEventListener("seeked", done, { once: true });
        try { video.currentTime = sampleTime; } catch (error) { clearTimeout(timer); reject(error); }
      });
      source = video;
    }
    const sw = asset.image ? source.naturalWidth : source.videoWidth;
    const sh = asset.image ? source.naturalHeight : source.videoHeight;
    const maxSide = 640;
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the smart-framing preview.");
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (video) {
      video.pause();
      try { video.currentTime = 0; } catch (_) {}
    }
    return { data: canvas.toDataURL("image/jpeg", 0.76), width: canvas.width, height: canvas.height };
  }

  async function analyzeAssets(plan) {
    state.smartNotes = [];
    if (!$("autoFrame").checked || !window.ReelForgeAI || !window.ReelForgeAI.analyzeVisual) return;
    setStatus("Understanding the main subjects in your clips…", 7);
    let successful = 0;
    try {
      for (let index = 0; index < state.assets.length; index++) {
        const asset = state.assets[index];
        try {
          const preview = await sampleAssetForVision(asset);
          const detections = await window.ReelForgeAI.analyzeVisual(preview.data,
            (message, percent) => setStatus("Smart framing · " + (index + 1) + "/" + state.assets.length + ": " + message, Math.min(32, 7 + percent * 0.55))
          );
          const ranked = detections.map(item => {
            const box = item.box;
            const area = Math.max(0, box.xmax - box.xmin) * Math.max(0, box.ymax - box.ymin);
            const preferred = /person|car|truck|bus|motorcycle|bicycle|dog|cat|horse|bird|boat|train|airplane|surfboard|skateboard/i.test(item.label) ? 1.25 : 1;
            return { ...item, area, weight: item.score * Math.sqrt(area) * preferred };
          }).sort((a, b) => b.weight - a.weight);
          if (ranked.length) {
            const subject = ranked[0];
            asset.subject = {
              x: clamp(((subject.box.xmin + subject.box.xmax) / 2) / preview.width, 0.08, 0.92),
              y: clamp(((subject.box.ymin + subject.box.ymax) / 2) / preview.height, 0.08, 0.92),
              label: subject.label,
              score: subject.score
            };
            asset.tags = [...new Set(ranked.slice(0, 4).map(item => item.label))];
            successful++;
          }
        } catch (error) {
          state.smartNotes.push("Smart framing fallback for " + asset.file.name + ": " + error.message);
        }
      }
    } finally {
      if (window.ReelForgeAI.releaseVision) await window.ReelForgeAI.releaseVision();
      state.assets.forEach(asset => { if (!asset.image) { asset.element.pause(); try { asset.element.currentTime = 0; } catch (_) {} } });
    }
    if (successful) {
      const allTags = [...new Set(state.assets.flatMap(asset => asset.tags || []))];
      plan.visualSummary = allTags.slice(0, 8).join(", ");
      setStatus("Smart framing ready · " + successful + " scene(s) analysed.", 35);
    } else {
      state.smartNotes.push("No main subject was confidently detected. Center framing will be used.");
    }
  }

  async function prepareProduction(plan, firstTranscriptPromise = null, firstTranscriptAsset = null) {
    const duration = Number($("duration").value);
    const production = { voice: null, captions: [], musicBuffer: null, notes: [...(state.smartNotes || [])] };
    const narration = narrationFor(plan);
    if (narration) {
      try {
        if (!window.ReelForgeAI) throw new Error("The local AI engine did not load. Refresh and retry.");
        production.voice = await window.ReelForgeAI.synthesize(
          narration.text, narration.language, $("voiceGender").value,
          (message, percent) => setStatus(message, percent)
        );
        if ($("autoCaptions").checked) {
          const spokenSeconds = production.voice.samples.length / production.voice.sampleRate;
          production.captions = captionsFromScript(narration.text, spokenSeconds, 0.12);
        }
      } catch (error) {
        production.notes.push("Voice-over skipped: " + error.message);
      }
    }
    if (!production.voice && $("autoCaptions").checked) {
      const videoAssets = state.assets.filter(asset => !asset.image);
      if (videoAssets.length) {
        try {
          if (!window.ReelForgeAI) throw new Error("The local AI engine did not load.");
          setStatus("Finding spoken dialogue in your source clips…", 12);
          const beats = plan.beatSync && state.audioFile ? await detectBeats(state.audioFile) : [];
          const boundaries = createBoundaries(duration, state.assets.length, beats, plan.beatSync);
          for (let index = 0; index < state.assets.length; index++) {
            const asset = state.assets[index];
            if (asset.image) continue;
            const sceneStart = boundaries[index];
            const sceneDuration = boundaries[index + 1] - sceneStart;
            const speed = clamp(asset.duration / sceneDuration, 0.5, 2.5);
            try {
              const transcript = asset === firstTranscriptAsset && firstTranscriptPromise
                ? await firstTranscriptPromise
                : await window.ReelForgeAI.transcribe(asset.file,
                    (message, percent) => setStatus("Clip " + (index + 1) + ": " + message, Math.min(43, 12 + percent * 0.45))
                  );
              const timed = captionsFromTranscript(transcript, sceneStart, speed)
                .map(item => ({ ...item, end: Math.min(boundaries[index + 1], item.end) }))
                .filter(item => item.end > item.start);
              production.captions.push(...timed);
            } catch (clipError) {
              production.notes.push("Captions skipped for " + asset.file.name + ": " + clipError.message);
            }
          }
          production.captions.sort((a, b) => a.start - b.start);
          if (!production.captions.length) production.notes.push("No clear speech was detected in your video clips. Your uploaded music is not transcribed as lyrics.");
        } catch (error) {
          production.notes.push("Automatic captions skipped: " + error.message);
        }
      } else {
        production.notes.push("No video audio was available to transcribe. Add video clips containing speech for automatic captions.");
      }
    }
    if (!state.audioFile && $("autoMusic").checked) {
      try {
        setStatus("Composing an original instrumental score…", 39);
        production.musicBuffer = await window.ReelForgeAI.generateMusic(duration, plan.mood);
      } catch (error) {
        production.notes.push("Generated music skipped: " + error.message);
      }
    }
    return production;
  }
  async function generate() {
    if (!state.assets.length || state.rendering) return;
    clearOutput();
    state.rendering = true;
    const controls = ["mediaFiles","audioFile","editPrompt","duration","quality","autoCaptions","autoMusic","autoVoice","autoFrame","voiceLanguage","voiceGender","narrationText"];
    controls.forEach(id => { const control = $(id); if (control) control.disabled = true; });
    updateReady();
    $("renderPanel").hidden = false;
    $("renderState").textContent = "Preparing";
    setStatus("Reading your one-prompt edit brief…", 2);
    $("renderPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    let production = { voice: null, captions: [], musicBuffer: null, notes: [] };
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!state.mixContext || state.mixContext.state === "closed") state.mixContext = new AudioCtx();
        state.mixContext.resume().catch(() => {});
      }
      const plan = parsePrompt();
      if (state.assets.some(a => !a.ready)) throw new Error("One of your files has not finished loading. Please try again.");
      let firstTranscriptPromise = null;
      let firstTranscriptAsset = null;
      if (!narrationFor(plan) && $("autoCaptions").checked && window.ReelForgeAI) {
        firstTranscriptAsset = state.assets.find(asset => !asset.image) || null;
        if (firstTranscriptAsset) {
          firstTranscriptPromise = window.ReelForgeAI.transcribe(firstTranscriptAsset.file,
            (message, percent) => setStatus("Preparing dialogue captions: " + message, Math.min(18, 4 + percent * 0.18))
          );
        }
      }
      await analyzeAssets(plan);
      production = await prepareProduction(plan, firstTranscriptPromise, firstTranscriptAsset);
      setStatus("Building animated scenes, transitions and effects…", 47);
      const result = await renderEdit(plan, production);
      state.outputBlob = result.blob;
      state.outputUrl = URL.createObjectURL(result.blob);
      $("outputVideo").src = state.outputUrl;
      const mp4 = result.mimeType.toLowerCase().includes("mp4");
      const extension = mp4 ? "mp4" : "webm";
      const filename = "reelforge-edit-" + new Date().toISOString().slice(0,10) + "." + extension;
      $("downloadBtn").href = state.outputUrl;
      $("downloadBtn").download = filename;
      $("outputInfo").textContent = result.width + " × " + result.height + " · " + result.duration + " sec · " + extension.toUpperCase();
      const included = [
        "animated camera movement",
        "scene transitions and VFX",
        production.captions.length ? "timed captions" : "",
        production.voice ? "neural voice-over" : "",
        production.musicBuffer ? "original instrumental score" : (state.audioFile ? "your uploaded audio" : "")
      ].filter(Boolean).join(" · ");
      $("formatNote").textContent = (mp4
        ? "Watermark-free MP4 export. "
        : "Watermark-free WEBM export. This phone browser does not expose MP4 recording; WEBM may not upload directly to Instagram. ") +
        "Included: " + included + ". " + (production.notes.length ? "Notes: " + production.notes.join(" ") : "");
      $("outputWrap").hidden = false;
      $("renderState").textContent = "Ready";
      setStatus("Your edited video is ready.", 100);
    } catch (error) {
      $("renderState").textContent = "Needs attention";
      setStatus(error.message || "Something went wrong while rendering.", 0);
      console.error(error);
    } finally {
      state.rendering = false;
      controls.forEach(id => { const control = $(id); if (control) control.disabled = false; });
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