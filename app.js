(() => {
  const $ = (id) => document.getElementById(id);
  const audioInput = $("audioFile"), videoInput = $("videoFile");
  const audio = $("audioPlayer"), canvas = $("previewCanvas");
  const ctx = canvas.getContext("2d");
  const audioName = $("audioName"), audioMeta = $("audioMeta");
  const videoName = $("videoName"), playBtn = $("playBtn"), exportBtn = $("exportBtn");
  const empty = $("previewEmpty"), overlay = $("previewOverlay");
  const note = $("previewNote"), caption = $("captionInput");
  const progressWrap = $("progressWrap"), progressBar = $("progressBar"), progressText = $("progressText");
  const about = $("aboutDialog");
  let audioUrl = null, videoUrl = null, footage = null, selectedStyle = "cinematic";
  let audioContext = null, audioDestination = null, mediaSource = null;
  let raf = 0, recording = false, previewStartedAt = 0, lastFrame = 0;

  const palettes = {
    cinematic: ["#17251f", "#526454", "#b7a88d"],
    type: ["#e8e4d9", "#c9c2b1", "#6e796b"],
    dream: ["#293c3a", "#7b8e83", "#b9a9a0"],
    minimal: ["#26352e", "#657565", "#d1c9b8"]
  };

  function fitCover(source, w, h) {
    const sw = source.videoWidth || source.width, sh = source.videoHeight || source.height;
    if (!sw || !sh) return;
    const scale = Math.max(w / sw, h / sh), dw = sw * scale, dh = sh * scale;
    ctx.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  function drawFrame(t = 0) {
    const [a,b,c] = palettes[selectedStyle];
    if (footage && footage.readyState >= 2 && !footage.paused && footage.videoWidth) {
      fitCover(footage, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(13,24,19,.40)";
      ctx.fillRect(0,0,canvas.width,canvas.height);
    } else {
      ctx.fillStyle = a; ctx.fillRect(0,0,canvas.width,canvas.height);
      const shift = Math.sin(t * .00035) * 34;
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, a); grad.addColorStop(.58, b); grad.addColorStop(1, c);
      ctx.fillStyle = grad; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.globalAlpha = .12;
      ctx.beginPath(); ctx.ellipse(270 + shift, 370, 190, 260, -.25, 0, Math.PI*2); ctx.fillStyle = "#f1e9d7"; ctx.fill();
      ctx.globalAlpha = 1;
    }
    const pulse = 1 + Math.sin(t * .003) * .018;
    const line = caption.value.trim() || "A feeling";
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    if (selectedStyle === "type") {
      ctx.fillStyle = "#24332b"; ctx.font = "700 64px 'DM Sans',sans-serif";
      ctx.fillText("FEEL", 58, 390 + Math.sin(t*.002)*8);
      ctx.fillText("EVERY", 58, 465);
      ctx.fillText("BEAT.", 58, 540);
      ctx.fillStyle = "#4e5f50"; ctx.font = "500 22px 'DM Sans',sans-serif";
      ctx.fillText(line.slice(0,32), 60, 620);
    } else if (selectedStyle === "minimal") {
      ctx.strokeStyle = "rgba(244,239,222,.72)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(270, 440, 110*pulse, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = "#f4f0e5"; ctx.font = "600 66px 'DM Sans',sans-serif";
      ctx.fillText(line.slice(0,17), 58, 470);
      ctx.font = "400 17px 'DM Sans',sans-serif"; ctx.fillText("A MOMENT IN MOTION", 60, 520);
    } else {
      ctx.fillStyle = "rgba(255,255,255,.82)"; ctx.font = "600 15px 'DM Sans',sans-serif";
      ctx.fillText("YOUR STORY", 58, 260);
      ctx.fillStyle = "#fff"; ctx.font = "600 66px 'DM Sans',sans-serif";
      const words = line.split(" "); let first = "", second = "";
      for (const word of words) { if ((first + " " + word).trim().length < 18) first = (first + " " + word).trim(); else second = (second + " " + word).trim(); }
      ctx.fillText(first || "A feeling", 58, 440);
      if (second) { ctx.font = "italic 500 68px 'Playfair Display',serif"; ctx.fillText(second.slice(0,18), 58, 520); }
      else { ctx.font = "italic 500 68px 'Playfair Display',serif"; ctx.fillText("in motion.", 58, 520); }
      if (selectedStyle === "dream") {
        ctx.globalAlpha = .28; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
        for (let i=0;i<5;i++){ctx.beginPath();ctx.arc(270,480,130+i*34+(Math.sin(t*.001+i)*6),0,Math.PI*2);ctx.stroke();}
        ctx.globalAlpha = 1;
      }
    }
    ctx.fillStyle = "rgba(255,255,255,.78)"; ctx.font = "500 12px 'DM Sans',sans-serif";
    ctx.fillText("REELFORGE STUDIO", 58, 890);
    ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.fillRect(58, 910, 424, 1);
  }

  function animate(now) {
    drawFrame(now);
    if (recording && audio.duration) {
      const p = Math.min(100, (audio.currentTime / audio.duration) * 100);
      progressBar.style.width = p + "%";
      progressText.textContent = "Creating your video · " + Math.round(p) + "%";
    }
    raf = requestAnimationFrame(animate);
  }
  function startAnimation() { if (!raf) raf = requestAnimationFrame(animate); }
  function stopAnimation() { if (raf) cancelAnimationFrame(raf); raf = 0; drawFrame(performance.now()); }

  audioInput.addEventListener("change", () => {
    const file = audioInput.files && audioInput.files[0]; if (!file) return;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(file); audio.src = audioUrl; audio.load();
    audioName.textContent = file.name; audioMeta.textContent = (file.size/1048576).toFixed(1) + " MB · Ready to create";
    audio.hidden = true; empty.hidden = true; overlay.hidden = true;
    playBtn.disabled = false; exportBtn.disabled = false;
    note.textContent = "Audio loaded · ready to preview";
  });

  videoInput.addEventListener("change", () => {
    const file = videoInput.files && videoInput.files[0]; if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    if (footage) { footage.pause(); footage.remove(); }
    footage = document.createElement("video");
    footage.src = videoUrl; footage.muted = true; footage.loop = true; footage.playsInline = true; footage.preload = "auto";
    footage.addEventListener("loadeddata", () => { drawFrame(performance.now()); });
    footage.play().catch(() => {});
    videoName.textContent = file.name;
    startAnimation();
  });

  $("styleGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-style]"); if (!button) return;
    selectedStyle = button.dataset.style;
    document.querySelectorAll(".style-card").forEach(el => el.classList.toggle("selected", el === button));
    drawFrame(performance.now());
  });
  caption.addEventListener("input", () => drawFrame(performance.now()));

  async function getAudioGraph() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error("This browser does not support audio rendering.");
      audioContext = new AudioCtx();
      mediaSource = audioContext.createMediaElementSource(audio);
      audioDestination = audioContext.createMediaStreamDestination();
      mediaSource.connect(audioContext.destination);
      mediaSource.connect(audioDestination);
    }
    await audioContext.resume();
    return audioDestination;
  }

  playBtn.addEventListener("click", async () => {
    if (!audio.src) return;
    try {
      if (audio.paused) {
        await audio.play(); playBtn.innerHTML = "Ⅱ <span>Pause</span>"; note.textContent = "Playing your sound"; startAnimation();
      } else {
        audio.pause(); playBtn.innerHTML = "▶ <span>Preview</span>"; note.textContent = "Preview paused";
      }
    } catch (err) { note.textContent = "Tap preview again to start"; }
  });
  audio.addEventListener("ended", () => { playBtn.innerHTML = "▶ <span>Preview</span>"; if (!recording) note.textContent = "Preview complete"; });
  audio.addEventListener("timeupdate", () => {
    if (!recording && audio.duration) note.textContent = formatTime(audio.currentTime) + " / " + formatTime(audio.duration);
  });
  function formatTime(value) { if (!Number.isFinite(value)) return "0:00"; const m=Math.floor(value/60),s=Math.floor(value%60); return m+":"+String(s).padStart(2,"0"); }

  exportBtn.addEventListener("click", async () => {
    if (!audio.src || recording) return;
    if (!canvas.captureStream || !window.MediaRecorder) { alert("Video export is not supported in this browser. Try the latest Chrome."); return; }
    let stream, recorder, chunks = [];
    try {
      const audioStream = await getAudioGraph();
      stream = canvas.captureStream(30);
      audioStream.getAudioTracks().forEach(track => stream.addTrack(track));
      const mime = ["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(type => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error("This browser cannot create a WebM video.");
      recorder = new MediaRecorder(stream, {mimeType:mime, videoBitsPerSecond:5000000});
      recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onerror = () => finishError("The browser stopped the export. Please try again.");
      recorder.onstop = () => {
        if (!chunks.length) { finishError("No video data was created. Please try again."); return; }
        const blob = new Blob(chunks, {type:"video/webm"});
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url; link.download = "reelforge-video.webm"; document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        progressBar.style.width = "100%"; progressText.textContent = "Your video is ready · saved as WebM";
        exportBtn.disabled = false; exportBtn.innerHTML = "<span>Create another</span><span>↗</span>";
        recording = false; audio.pause(); playBtn.innerHTML = "▶ <span>Preview</span>";
        stream.getTracks().forEach(t => t.stop());
      };
      recording = true; exportBtn.disabled = true; exportBtn.innerHTML = "<span>Creating video…</span><span>•</span>";
      progressWrap.hidden = false; progressBar.style.width = "0%"; progressText.textContent = "Preparing your video…";
      drawFrame(performance.now()); startAnimation();
      audio.currentTime = 0; recorder.start(500); await audio.play();
      note.textContent = "Rendering · keep this tab open";
    } catch (err) {
      recording = false; exportBtn.disabled = false; exportBtn.innerHTML = "<span>Make my video</span><span>↗</span>";
      if (stream) stream.getTracks().forEach(t => t.stop());
      finishError(err && err.message ? err.message : "Could not start video export.");
    }
    function finishError(message) {
      recording = false; exportBtn.disabled = false; exportBtn.innerHTML = "<span>Try export again</span><span>↗</span>";
      progressText.textContent = message; note.textContent = "Export did not finish";
    }
    audio.addEventListener("ended", () => {
      if (recording && recorder && recorder.state !== "inactive") { recorder.stop(); progressText.textContent = "Finishing your video…"; }
    }, {once:true});
  });

  $("helpBtn").addEventListener("click", () => about.showModal());
  $("closeDialog").addEventListener("click", () => about.close());
  $("okDialog").addEventListener("click", () => about.close());
  about.addEventListener("click", e => { if (e.target === about) about.close(); });

  drawFrame(0);
})();