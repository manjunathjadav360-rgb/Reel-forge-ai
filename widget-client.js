(function(){
 const params=new URLSearchParams(location.search),key=params.get("key");
 const endpoint="https://wxssshmtatilyjktxmji.supabase.co/functions/v1/aikivo-widget";
 const apiKey=window.AIKIVO_SUPABASE_PUBLISHABLE_KEY;
 const thread=document.getElementById("thread"),status=document.getElementById("status"),input=document.getElementById("message"),send=document.getElementById("send");
 let conversationId=sessionStorage.getItem("aikivo-web-"+key)||"",busy=false;
 function bubble(text,type){const el=document.createElement("div");el.className="bubble "+type;el.textContent=text;thread.appendChild(el);thread.scrollTop=thread.scrollHeight;return el}
 async function call(body){
  const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","apikey":apiKey},body:JSON.stringify({...body,key})});
  const data=await response.json().catch(()=>({error:"Could not read the server response."}));
  if(!response.ok)throw new Error(data.error||"Chat is temporarily unavailable.");
  return data;
 }
 async function init(){
  if(!key||!apiKey){thread.innerHTML="";bubble("This chat widget is not configured correctly.","bot");return}
  try{const data=await call({action:"init"});document.getElementById("title").textContent=data.name||"Customer support";thread.innerHTML="";bubble(data.greeting||"Hello! How can we help?","bot");}
  catch(e){thread.innerHTML="";bubble(e.message,"bot")}
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