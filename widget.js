(function(){
  const script=document.currentScript;
  const key=script&&script.dataset.aikivoKey;
  if(!key)return;
  const base="https://manjunathjadav360-rgb.github.io/Reel-forge-ai/";
  const launcher=document.createElement("button");
  launcher.type="button";
  launcher.textContent="Chat with us";
  launcher.setAttribute("aria-label","Open customer support chat");
  launcher.style.cssText="position:fixed;right:22px;bottom:22px;z-index:2147483000;border:0;border-radius:24px;background:#172238;color:#fff;padding:13px 19px;font:600 14px system-ui;box-shadow:0 6px 24px #0002;cursor:pointer";
  const frame=document.createElement("iframe");
  frame.title="AIKIVO customer support";
  frame.src=base+"widget.html?key="+encodeURIComponent(key);
  frame.allow="clipboard-write";
  frame.style.cssText="display:none;position:fixed;right:22px;bottom:82px;z-index:2147482999;width:360px;height:560px;max-height:calc(100vh - 110px);border:1px solid #e5e7eb;border-radius:14px;background:#fff;box-shadow:0 12px 42px #0003";
  frame.loading="lazy";
  launcher.addEventListener("click",function(){
    const open=frame.style.display==="block";
    frame.style.display=open?"none":"block";
    launcher.textContent=open?"Chat with us":"Close chat";
  });
  function mount(){
    if(!document.body)return;
    document.body.appendChild(frame);
    document.body.appendChild(launcher);
  }
  if(document.body)mount();else document.addEventListener("DOMContentLoaded",mount,{once:true});
  window.addEventListener("message",function(event){
    if(event.origin!==new URL(base).origin||!event.data||event.data.type!=="AIKIVO_CLOSE")return;
    frame.style.display="none";launcher.textContent="Chat with us";
  });
  window.addEventListener("resize",function(){
    if(window.innerWidth<480){frame.style.left="10px";frame.style.right="10px";frame.style.width="auto";frame.style.height="min(560px, calc(100vh - 105px))";}
  });
})();