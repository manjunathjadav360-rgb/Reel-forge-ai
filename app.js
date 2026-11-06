(() => {
"use strict";
const $ = id => document.getElementById(id);
const audioInput=$("audioFile"),videoInput=$("videoFile"),audio=$("audioPlayer"),canvas=$("previewCanvas"),ctx=canvas.getContext("2d",{alpha:false});
const audioName=$("audioName"),audioMeta=$("audioMeta"),audioDetails=$("audioDetails"),durationLabel=$("durationLabel"),videoName=$("videoName");
const playBtn=$("playBtn"),exportBtn=$("exportBtn"),empty=$("previewEmpty"),note=$("previewNote"),caption=$("captionInput");
const progressWrap=$("progressWrap"),progressBar=$("progressBar"),progressText=$("progressText"),about=$("aboutDialog");
const W=canvas.width,H=canvas.height,VIDEO_SECONDS=60,FPS=30;
let audioUrl=null,videoUrl=null,footage=null,style="cinematic",audioContext=null,source=null,analyser=null,recordDestination=null,frequencyData=null;
let raf=0,recording=false,renderStart=0,renderTimer=null,activeStream=null,recorder=null,lastExportUrl=null;
const palettes={cinematic:["#101e1b","#3f5c51","#b99d7e"],type:["#e9e4d8","#c6bdab","#536353"],dream:["#172b35","#617b83","#b8a4a1"],pulse:["#111c20","#2b5d59","#b5c69a"]};
const scenes=["horizon","city","stars","ocean","light","finale"];
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
function clock(s){return Math.floor(s/60)+":"+String(Math.floor(s%60)).padStart(2,"0")}
function roundedRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,r,r)}
function gradientBackground(t,index){
 const p=palettes[style],g=ctx.createLinearGradient(0,0,W,H);
 const drift=(Math.sin(t*.07)+1)*.08;
 g.addColorStop(0,p[0]);g.addColorStop(.48,p[1]);g.addColorStop(1,p[2]);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
 const glow=ctx.createRadialGradient(W*(.28+drift),H*(.28+Math.sin(t*.09)*.04),5,W*.45,H*.4,Math.max(W,H)*.72);
 glow.addColorStop(0,"rgba(255,239,205,.18)");glow.addColorStop(1,"rgba(7,16,18,.12)");ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
}
function drawMountains(t,energy){
 const y=H*.64;
 for(let layer=0;layer<3;layer++){
  ctx.beginPath();ctx.moveTo(0,H);
  const base=y+layer*82;
  for(let x=0;x<=W+20;x+=20){const wave=Math.sin(x*.009+layer*1.8+t*.15)*34+Math.sin(x*.021+t*.09+layer)*13;ctx.lineTo(x,base+wave);}
  ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle=["#152923","#213b32","#314b3e"][layer];ctx.globalAlpha=.72+layer*.08;ctx.fill();ctx.globalAlpha=1;
 }
 const sunY=H*.34+Math.sin(t*.1)*8;
 const sun=ctx.createRadialGradient(W*.68,sunY,4,W*.68,sunY,150+energy*45);sun.addColorStop(0,"rgba(255,228,183,.95)");sun.addColorStop(.25,"rgba(239,193,143,.26)");sun.addColorStop(1,"rgba(239,193,143,0)");
 ctx.fillStyle=sun;ctx.fillRect(0,0,W,H);
}
function drawCity(t,energy){
 const horizon=H*.68;
 ctx.fillStyle="rgba(13,22,25,.55)";ctx.fillRect(0,horizon,W,H-horizon);
 for(let i=0;i<19;i++){
  const bw=18+(i*17%24),x=(i*37)%W,bh=100+(i*71%250);
  ctx.fillStyle=i%3===0?"#1a292b":"#202e2d";ctx.fillRect(x,horizon-bh,bw,bh);
  for(let yy=horizon-bh+13;yy<horizon-10;yy+=22)for(let xx=x+5;xx<x+bw-4;xx+=10){
   ctx.fillStyle=(Math.sin(i*9+xx+yy)>-.12)?"rgba(242,207,151,.62)":"rgba(173,192,170,.15)";ctx.fillRect(xx,yy,3,6);
  }
 }
 ctx.strokeStyle="rgba(224,206,170,.55)";ctx.lineWidth=2+energy*3;ctx.beginPath();ctx.moveTo(0,horizon+80);
 for(let x=0;x<=W;x+=8)ctx.lineTo(x,horizon+80+Math.sin(x*.018+t*.7)*energy*35);ctx.stroke();
}
function drawStars(t,energy){
 for(let i=0;i<100;i++){
  const x=(i*137.5)%W,y=(i*83.7)%H*.78;
  const a=.25+.55*(.5+.5*Math.sin(t*.8+i*2.1));
  ctx.fillStyle="rgba(238,235,218,"+a+")";ctx.beginPath();ctx.arc(x,y,((i%4)+1)*.55+energy*1.8,0,Math.PI*2);ctx.fill();
 }
 for(let i=0;i<5;i++){const x=W*(.15+i*.18)+Math.sin(t*.18+i)*28,y=H*(.25+(i%3)*.13);const r=45+i*17+energy*24;const gl=ctx.createRadialGradient(x,y,1,x,y,r);gl.addColorStop(0,"rgba(206,191,185,.18)");gl.addColorStop(1,"rgba(206,191,185,0)");ctx.fillStyle=gl;ctx.fillRect(x-r,y-r,r*2,r*2);}
}
function drawOcean(t,energy){
 const horizon=H*.57;
 const sun=ctx.createRadialGradient(W*.52,horizon-40,5,W*.52,horizon-40,180);sun.addColorStop(0,"rgba(246,213,170,.7)");sun.addColorStop(1,"rgba(246,213,170,0)");ctx.fillStyle=sun;ctx.fillRect(0,0,W,H);
 ctx.fillStyle="rgba(11,34,39,.48)";ctx.fillRect(0,horizon,W,H-horizon);
 for(let i=0;i<28;i++){const y=horizon+18+i*17;ctx.strokeStyle="rgba(226,220,194,"+(.08+i*.004+energy*.1)+")";ctx.lineWidth=1+energy*1.5;ctx.beginPath();for(let x=0;x<=W;x+=12){const yy=y+Math.sin(x*.016+t*.6+i)* (2+energy*10);if(x===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);}ctx.stroke();}
}
function drawLight(t,energy){
 for(let i=0;i<14;i++){const x=(i*97+Math.sin(t*.18+i)*45+W*.1)%W,y=(i*139+Math.cos(t*.14+i)*60+H*.18)%H,r=24+(i%4)*19+energy*30;const g=ctx.createRadialGradient(x,y,1,x,y,r);g.addColorStop(0,"rgba(239,209,166,.27)");g.addColorStop(1,"rgba(239,209,166,0)");ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
}
function drawPulse(t,energy){
 const mid=H*.51;
 ctx.strokeStyle="rgba(225,236,214,.13)";ctx.lineWidth=1;
 for(let ring=0;ring<6;ring++){ctx.beginPath();ctx.ellipse(W/2,mid,80+ring*40+energy*38,80+ring*56+energy*55,0,0,Math.PI*2);ctx.stroke();}
 ctx.strokeStyle="rgba(229,238,215,.9)";ctx.lineWidth=2+energy*2;ctx.beginPath();
 for(let x=0;x<=W;x+=5){const n=(x/W*frequencyData?.length)||0;const amp=frequencyData?frequencyData[Math.floor(n)]/255:energy;const y=mid+Math.sin(x*.035+t*3)*(10+amp*95)*(0.3+energy);if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
}
function drawSilhouette(t){
 const x=W*.73+Math.sin(t*.3)*7,y=H*.72;
 ctx.fillStyle="#111c1a";ctx.beginPath();ctx.ellipse(x,y-150,49,65,.1,0,Math.PI*2);ctx.fill();
 ctx.beginPath();ctx.moveTo(x-42,y-112);ctx.quadraticCurveTo(x-110,y-50,x-86,y+100);ctx.lineTo(x+94,y+100);ctx.quadraticCurveTo(x+88,y-62,x+43,y-112);ctx.closePath();ctx.fill();
}
function drawScene(t,index,energy){
 const scene=scenes[index%scenes.length];
 if(footage&&footage.readyState>=2&&footage.videoWidth){const sw=footage.videoWidth,sh=footage.videoHeight,scale=Math.max(W/sw,H/sh),dw=sw*scale,dh=sh*scale;ctx.drawImage(footage,(W-dw)/2,(H-dh)/2,dw,dh);ctx.fillStyle="rgba(10,20,18,.42)";ctx.fillRect(0,0,W,H);}
 else{
  gradientBackground(t,index);
  if(scene==="horizon"){drawMountains(t,energy);drawSilhouette(t);}
  if(scene==="city")drawCity(t,energy);
  if(scene==="stars")drawStars(t,energy);
  if(scene==="ocean")drawOcean(t,energy);
  if(scene==="light")drawLight(t,energy);
  if(scene==="finale"){drawMountains(t,energy);drawStars(t,energy);}
  if(style==="dream"){drawStars(t,energy);drawLight(t,energy);}
  if(style==="pulse")drawPulse(t,energy);
 }
}
function wrapText(text,maxChars){const words=text.trim().split(/\s+/);const lines=[];let line="";for(const word of words){if((line+" "+word).trim().length>maxChars&&line){lines.push(line);line=word;}else line=(line+" "+word).trim();}if(line)lines.push(line);return lines.slice(0,3);}
function drawTypography(t,energy,index,transition){
 const title=caption.value.trim()||"A feeling in motion";
 const sceneWords=["LET THE MOMENT","STAY A LITTLE","SOMEWHERE IN TIME","FEEL EVERYTHING","LOST IN THE LIGHT","AND THEN, US"];
 const words=style==="type"?sceneWords[index%sceneWords.length]:wrapText(title,18);
 const reveal=clamp((t%10)/1.25);
 const alpha=clamp(Math.min(reveal,1-transition*.75));
 ctx.save();ctx.globalAlpha=alpha;
 const lightText=style!=="type";
 ctx.textAlign="left";ctx.textBaseline="middle";
 if(style==="type"){
  ctx.fillStyle="#27372f";ctx.font="800 49px 'DM Sans',sans-serif";
  words.forEach((line,i)=>ctx.fillText(line,54,390+i*64,430));
  ctx.fillStyle="#596a58";ctx.font="500 16px 'DM Sans',sans-serif";ctx.fillText("A SOUND. A MEMORY. A MOMENT.",58,610);
 }else{
  ctx.fillStyle="rgba(0,0,0,.2)";ctx.fillRect(0,H*.56,W,H*.34);
  ctx.fillStyle="rgba(255,255,255,.78)";ctx.font="700 12px 'DM Sans',sans-serif";ctx.fillText("REELFORGE ORIGINAL",58,H*.68);
  ctx.fillStyle="#fff";ctx.font="600 57px 'DM Sans',sans-serif";
  const lines=wrapText(title,16);
  lines.forEach((line,i)=>ctx.fillText(line,56,H*.75+i*67,430));
  ctx.fillStyle="rgba(255,255,255,.7)";ctx.font="italic 500 28px 'Playfair Display',serif";ctx.fillText(["in every note.","feel it all.","stay in this moment."][index%3],58,H*.75+lines.length*67+15,420);
 }
 ctx.restore();
}
function drawWave(t,energy){
 const y=H-72;ctx.strokeStyle="rgba(255,255,255,.62)";ctx.lineWidth=2;ctx.beginPath();
 for(let x=54;x<=W-54;x+=4){const idx=frequencyData?Math.floor((x-54)/(W-108)*(frequencyData.length-1)):0;const v=frequencyData?frequencyData[idx]/255:energy;const yy=y-Math.sin(x*.08+t*4)*(3+v*18);if(x===54)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);}ctx.stroke();
 ctx.fillStyle="rgba(255,255,255,.65)";ctx.font="500 10px 'DM Sans',sans-serif";ctx.fillText("REELFORGE  /  "+clock(t),55,H-34);
 ctx.fillStyle="rgba(255,255,255,.3)";ctx.fillRect(55,H-22,W-110,1);ctx.fillStyle="rgba(255,255,255,.85)";ctx.fillRect(55,H-22,(W-110)*clamp(t/VIDEO_SECONDS),1);
}
function drawFrame(seconds=0){
 const t=Math.max(0,seconds),index=Math.min(5,Math.floor(t/10)),local=(t%10)/10,transition=local<.12?(1-local/.12):0;
 const energy=readEnergy();
 drawScene(t,index,energy);
 if(transition>0&&index>0){ctx.save();ctx.globalAlpha=transition*.72;drawScene(t,index-1,energy);ctx.restore();}
 if(style!=="pulse")drawTypography(t,energy,index,transition);
 else {ctx.fillStyle="rgba(255,255,255,.88)";ctx.font="700 46px 'DM Sans',sans-serif";ctx.fillText((caption.value.trim()||"FEEL THE MUSIC").toUpperCase().slice(0,18),48,H*.75);}
 if(style==="cinematic"||style==="dream"){ctx.save();ctx.globalAlpha=.055;ctx.fillStyle="#fff";for(let i=0;i<180;i++){const x=(i*83.17)%W,y=(i*137.31)%H;ctx.fillRect(x,y,1,1);}ctx.restore();}
 drawWave(t,energy);
}
function readEnergy(){if(!analyser||!frequencyData)return .18;analyser.getByteFrequencyData(frequencyData);let sum=0;for(let i=2;i<Math.min(44,frequencyData.length);i++)sum+=frequencyData[i];return clamp(sum/(Math.min(44,frequencyData.length)-2)/255*2.2);}
function tick(){if(!audio.paused||recording){drawFrame(audio.currentTime||((performance.now()-renderStart)/1000));raf=requestAnimationFrame(tick);}else{raf=0;drawFrame(audio.currentTime||0);}}
function startVisuals(){if(!raf){renderStart=performance.now();raf=requestAnimationFrame(tick);}}
function stopVisuals(){if(raf){cancelAnimationFrame(raf);raf=0;}drawFrame(audio.currentTime||0);}
function setStatus(text){note.textContent=text;}
function cleanupVideo(){if(footage){footage.pause();footage.removeAttribute("src");footage.load();footage=null;}if(videoUrl){URL.revokeObjectURL(videoUrl);videoUrl=null;}}
function setupAudioGraph(){
 if(audioContext)return Promise.resolve();
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw new Error("Audio rendering is not supported in this browser.");
 audioContext=new AC();source=audioContext.createMediaElementSource(audio);analyser=audioContext.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=.82;frequencyData=new Uint8Array(analyser.frequencyBinCount);recordDestination=audioContext.createMediaStreamDestination();
 source.connect(analyser);analyser.connect(audioContext.destination);source.connect(recordDestination);
 return audioContext.resume();
}
audioInput.addEventListener("change",()=>{
 const file=audioInput.files?.[0];if(!file)return;
 if(!file.type.startsWith("audio/")){setStatus("Choose a valid audio file");return;}
 if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=URL.createObjectURL(file);audio.src=audioUrl;audio.load();
 audioName.textContent=file.name;audioMeta.textContent=(file.size/1048576).toFixed(1)+" MB · Loaded locally";audioDetails.hidden=false;
 audio.addEventListener("loadedmetadata",()=>{durationLabel.textContent=clock(audio.duration);setStatus("Ready · "+clock(audio.duration)+" soundtrack");},{once:true});
 empty.hidden=true;playBtn.disabled=false;exportBtn.disabled=false;progressWrap.hidden=true;startVisuals();
});
videoInput.addEventListener("change",()=>{
 const file=videoInput.files?.[0];if(!file)return;if(!file.type.startsWith("video/")){setStatus("Choose a valid video file");return;}
 cleanupVideo();videoUrl=URL.createObjectURL(file);footage=document.createElement("video");footage.src=videoUrl;footage.muted=true;footage.loop=true;footage.playsInline=true;footage.preload="auto";
 footage.addEventListener("loadeddata",()=>drawFrame(audio.currentTime||0),{once:true});footage.play().catch(()=>{});videoName.textContent=file.name;startVisuals();
});
$("styleGrid").addEventListener("click",e=>{const b=e.target.closest("[data-style]");if(!b)return;style=b.dataset.style;document.querySelectorAll(".style-card").forEach(el=>el.classList.toggle("selected",el===b));drawFrame(audio.currentTime||0);});
caption.addEventListener("input",()=>drawFrame(audio.currentTime||0));
playBtn.addEventListener("click",async()=>{
 if(!audio.src)return;
 try{await setupAudioGraph();if(audio.paused){if(Number.isFinite(audio.duration)&&audio.currentTime>=audio.duration)audio.currentTime=0;await audio.play();playBtn.innerHTML="Ⅱ <span>Pause</span>";setStatus("Playing · "+clock(audio.currentTime));startVisuals();}else{audio.pause();playBtn.innerHTML="▶ <span>Preview</span>";setStatus("Preview paused");stopVisuals();}}
 catch(err){setStatus(err.message||"Could not play audio");}
});
audio.addEventListener("timeupdate",()=>{if(!recording&&!audio.paused)setStatus(clock(audio.currentTime)+" / "+clock(audio.duration));});
audio.addEventListener("ended",()=>{if(!recording){playBtn.innerHTML="▶ <span>Preview</span>";setStatus("Preview complete");stopVisuals();}});
function finishRecording(){
 if(!recording||!recorder||recorder.state==="inactive")return;
 clearTimeout(renderTimer);renderTimer=null;progressText.textContent="Finishing and preparing download…";recorder.stop();
}
exportBtn.addEventListener("click",async()=>{
 if(!audio.src||recording)return;
 if(!canvas.captureStream||!window.MediaRecorder){setStatus("Use the latest Chrome to export video");return;}
 let chunks=[];
 try{
  await setupAudioGraph();if(audioContext.state!=="running")await audioContext.resume();
  const videoStream=canvas.captureStream(FPS);activeStream=new MediaStream([...videoStream.getVideoTracks(),...recordDestination.stream.getAudioTracks()]);
  const mime=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(x=>MediaRecorder.isTypeSupported(x));
  if(!mime)throw new Error("This browser cannot encode WebM. Try current Chrome.");
  recorder=new MediaRecorder(activeStream,{mimeType:mime,videoBitsPerSecond:6500000,audioBitsPerSecond:192000});
  recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
  recorder.onerror=()=>{recording=false;setStatus("Export interrupted. Try again.");exportBtn.disabled=false;};
  recorder.onstop=()=>{
   recording=false;clearTimeout(renderTimer);renderTimer=null;audio.pause();audio.loop=false;playBtn.innerHTML="▶ <span>Preview</span>";
   if(activeStream)activeStream.getTracks().forEach(track=>track.stop());activeStream=null;
   if(!chunks.length){setStatus("No video data was received. Try again.");exportBtn.disabled=false;return;}
   const blob=new Blob(chunks,{type:"video/webm"});if(lastExportUrl)URL.revokeObjectURL(lastExportUrl);lastExportUrl=URL.createObjectURL(blob);
   const a=document.createElement("a");a.href=lastExportUrl;a.download="ReelForge-60s-Music-Video.webm";document.body.appendChild(a);a.click();a.remove();
   progressBar.style.width="100%";progressText.textContent="Done · 60-second video downloaded";setStatus("Your 60-second video is ready");
   exportBtn.disabled=false;exportBtn.innerHTML="<span>Create another video</span><span>↗</span>";stopVisuals();
  };
  recording=true;exportBtn.disabled=true;exportBtn.innerHTML="<span>Rendering 60 seconds…</span><span>•</span>";progressWrap.hidden=false;progressBar.style.width="0%";progressText.textContent="Rendering your music video · 0%";
  audio.pause();audio.currentTime=0;audio.loop=true;drawFrame(0);recorder.start(1000);await audio.play();renderStart=performance.now();startVisuals();
  renderTimer=setTimeout(finishRecording,VIDEO_SECONDS*1000);
  const progressLoop=()=>{if(!recording)return;const elapsed=Math.min(VIDEO_SECONDS,(performance.now()-renderStart)/1000);const p=elapsed/VIDEO_SECONDS*100;progressBar.style.width=p+"%";progressText.textContent="Rendering your music video · "+Math.floor(p)+"%";if(elapsed<VIDEO_SECONDS)requestAnimationFrame(progressLoop);};
  requestAnimationFrame(progressLoop);setStatus("Rendering · keep this tab open for 60 seconds");
 }catch(err){
  recording=false;clearTimeout(renderTimer);renderTimer=null;if(activeStream)activeStream.getTracks().forEach(t=>t.stop());activeStream=null;audio.loop=false;
  exportBtn.disabled=false;exportBtn.innerHTML="<span>Try export again</span><span>↗</span>";setStatus(err.message||"Could not start video export");progressText.textContent=err.message||"Export failed";
 }
});
$("helpBtn").addEventListener("click",()=>about.showModal());$("closeDialog").addEventListener("click",()=>about.close());$("okDialog").addEventListener("click",()=>about.close());about.addEventListener("click",e=>{if(e.target===about)about.close();});
window.addEventListener("pagehide",()=>{if(audioUrl)URL.revokeObjectURL(audioUrl);cleanupVideo();if(lastExportUrl)URL.revokeObjectURL(lastExportUrl);});
drawFrame(0);
})();