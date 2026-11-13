(function(){
 const params=new URLSearchParams(location.search),key=params.get("key");
 const baseOrigin="https://manjunathjadav360-rgb.github.io";
 const thread=document.getElementById("thread"),status=document.getElementById("status"),input=document.getElementById("message"),send=document.getElementById("send");
 let conversationId=key?sessionStorage.getItem("aikivo-web-"+key)||"":"",busy=false,requestNo=0;
 const pending=new Map();
 function bubble(text,type){const el=document.createElement("div");el.className="bubble "+type;el.textContent=text;thread.appendChild(el);thread.scrollTop=thread.scrollHeight;return el}
 window.addEventListener("message",event=>{
  if(event.source!==window.parent||event.origin!==baseOrigin||!event.data||event.data.type!=="AIKIVO_API_RESPONSE")return;
  const item=pending.get(event.data.id);if(!item)return;
  clearTimeout(item.timer);pending.delete(event.data.id);
  if(event.data.ok)item.resolve(event.data.data);else item.reject(new Error(event.data.data?.error||"Chat is temporarily unavailable."));
 });
 function call(body){
  return new Promise((resolve,reject)=>{
   if(!key||window.parent===window){reject(new Error("Open this chat from the approved business website to use it."));return}
   const id=String(++requestNo)+"-"+Math.random().toString(36).slice(2);
   const timer=setTimeout(()=>{pending.delete(id);reject(new Error("Chat connection timed out. Please try again."));},20000);
   pending.set(id,{resolve,reject,timer});
   window.parent.postMessage({type:"AIKIVO_API_REQUEST",id,body},"*");
  });
 }
 async function init(){
  if(!key){thread.innerHTML="";bubble("This chat widget is not configured correctly.","bot");return}
  if(window.parent===window){thread.innerHTML="";bubble("Install this chat on an approved business website to preview it. The standalone preview is disabled for domain security.","bot");input.disabled=true;send.disabled=true;return}
  try{const data=await call({action:"init"});document.getElementById("title").textContent=data.name||"Customer support";thread.innerHTML="";bubble(data.greeting||"Hello! How can we help?","bot");}
  catch(e){thread.innerHTML="";bubble(e.message,"bot");input.disabled=true;send.disabled=true;}
 }
 document.getElementById("form").addEventListener("submit",async e=>{
  e.preventDefault();const message=input.value.trim();if(!message||busy)return;
  busy=true;send.disabled=true;input.value="";bubble(message,"user");status.textContent="Sending…";
  try{
   const data=await call({action:"message",message,conversationId});
   conversationId=data.conversationId||conversationId;
   if(conversationId)sessionStorage.setItem("aikivo-web-"+key,conversationId);
   bubble(data.answer||"Thank you. The team will follow up.","bot");
   status.textContent=data.handoff?"Your message has been sent to the support team.":"";
  }catch(err){bubble(err.message,"bot");status.textContent="";input.value=message}
  finally{busy=false;send.disabled=false;input.focus()}
 });
 init();
})();