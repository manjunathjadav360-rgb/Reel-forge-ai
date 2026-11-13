const supabase = window.aikivoSupabase;
const emptyData = () => ({business:{name:"My Business",industry:"Other",website:"",language:"English"},agents:[],knowledge:[],chats:[]});
let db = emptyData();
let active = null;
let rec = null;
let currentUser = null;
let businessId = null;
let loadingWorkspace = false;
let workspaceLoadToken = 0;

function safe(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function toast(s){let t=document.getElementById("toast");t.textContent=s;t.style.cssText="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#172238;color:white;padding:10px 15px;border-radius:8px;font-size:11px;z-index:50";setTimeout(()=>t.style.cssText="",2600)}
function page(p){document.querySelectorAll(".page").forEach(x=>x.classList.toggle("show",x.id==="page-"+p));document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.page===p));document.getElementById("crumb").textContent=p[0].toUpperCase()+p.slice(1);document.getElementById("sidebar").classList.remove("open")}
function modal(id,on){document.getElementById(id).classList.toggle("open",on)}
function requireWorkspace(){if(!currentUser||!businessId){toast("Please sign in to use your workspace.");return false}return true}
function render(){
 document.getElementById("sideBusiness").textContent=db.business.name;
 document.getElementById("agentCount").textContent=db.agents.length;
 document.getElementById("knowledgeCount").textContent=db.knowledge.length;
 document.getElementById("chatCount").textContent=db.chats.length;
 document.getElementById("businessName").value=db.business.name;
 document.getElementById("industry").value=db.business.industry;
 document.getElementById("website").value=db.business.website;
 document.getElementById("language").value=db.business.language;
 const cards=db.agents.map(a=>'<article class="agent-card"><h3>◉　'+safe(a.name)+'</h3><p>'+safe(a.role)+' · '+safe(a.language)+'</p><p>'+safe(a.greeting)+'</p><div class="agent-actions"><button class="secondary" data-test="'+a.id+'">Test voice</button><button class="secondary" data-remove="'+a.id+'">Delete</button></div></article>').join("");
 document.getElementById("agentList").innerHTML=cards||'<article class="card empty">No AI executives yet. Use Create executive to add one.</article>';
 document.getElementById("overviewAgents").innerHTML=db.agents.length?db.agents.slice(0,3).map(a=>'<p>◉　<b>'+safe(a.name)+'</b> — '+safe(a.role)+' <button class="link" data-test="'+a.id+'">Test</button></p>').join(""):"No AI executives yet. Create your first assistant.";
 document.getElementById("knowledgeList").innerHTML=db.knowledge.map(k=>'<div class="knowledge-item"><b>'+safe(k.q)+'</b><p>'+safe(k.a)+'</p><button class="delete" data-kremove="'+k.id+'">Remove</button></div>').join("")||'<p class="empty">No knowledge items added.</p>';
 document.getElementById("conversationList").innerHTML=db.chats.slice().reverse().map(c=>'<div class="knowledge-item"><b>'+safe(c.agent)+'</b><p><b>Customer:</b> '+safe(c.q)+'</p><p><b>AI:</b> '+safe(c.a)+'</p><small>'+new Date(c.at).toLocaleString()+'</small></div>').join("")||"No conversations yet. Run a voice test to see it here.";
}
async function loadWorkspace(session){
 const token=++workspaceLoadToken;
 if(!session){currentUser=null;businessId=null;db=emptyData();render();return}
 currentUser=session.user;
 if(loadingWorkspace)return;
 loadingWorkspace=true;
 try{
  const {data:membership,error:memberError}=await supabase.from("business_members").select("business_id,businesses(id,name,industry,website,default_language)").eq("user_id",session.user.id).limit(1).maybeSingle();
  if(memberError)throw memberError;
  if(!membership||!membership.business_id)throw new Error("Your account has no workspace membership. Please contact support.");
  businessId=membership.business_id;
  const business=Array.isArray(membership.businesses)?membership.businesses[0]:membership.businesses;
  const [agentsRes,knowledgeRes,conversationsRes]=await Promise.all([
   supabase.from("ai_executives").select("*").eq("business_id",businessId).order("created_at",{ascending:true}),
   supabase.from("knowledge_items").select("*").eq("business_id",businessId).order("created_at",{ascending:true}),
   supabase.from("conversations").select("*").eq("business_id",businessId).order("started_at",{ascending:false})
  ]);
  if(agentsRes.error)throw agentsRes.error;
  if(knowledgeRes.error)throw knowledgeRes.error;
  if(conversationsRes.error)throw conversationsRes.error;
  const conversations=conversationsRes.data||[];
  let messages=[];
  if(conversations.length){
   const {data,error}=await supabase.from("conversation_messages").select("*").in("conversation_id",conversations.map(c=>c.id)).order("created_at",{ascending:true});
   if(error)throw error;
   messages=data||[];
  }
  if(token!==workspaceLoadToken)return;
  db.business={name:business?.name||"My Business",industry:business?.industry||"Other",website:business?.website||"",language:business?.default_language||"English"};
  db.agents=(agentsRes.data||[]).map(a=>({id:a.id,name:a.name,role:a.role,greeting:a.greeting,language:a.language}));
  db.knowledge=(knowledgeRes.data||[]).map(k=>({id:k.id,q:k.question,a:k.answer}));
  const agentNames=new Map(db.agents.map(a=>[a.id,a.name]));
  db.chats=conversations.map(c=>{
   const rows=messages.filter(m=>m.conversation_id===c.id);
   const customer=rows.find(m=>m.speaker==="customer");
   const assistant=rows.find(m=>m.speaker==="assistant");
   return {id:c.id,agent:agentNames.get(c.executive_id)||"AI executive",q:customer?.body||"",a:assistant?.body||"",at:c.started_at};
  }).filter(c=>c.q||c.a);
  render();
  document.getElementById("accountState").textContent="CLOUD WORKSPACE";
  const notice=document.getElementById("notice");
  if(notice){notice.querySelector("b").textContent="Cloud workspace connected";notice.querySelector("span").textContent="Your AI executives, knowledge and test conversations are saved to your business account."}
 }catch(error){
  console.error("AIKIVO workspace load:",error);
  toast("Workspace load failed: "+(error.message||"Please refresh."));
 }finally{loadingWorkspace=false}
}
async function saveAgent(values){
 if(!requireWorkspace())return;
 const {data,error}=await supabase.from("ai_executives").insert({business_id:businessId,name:values.name,role:values.role,greeting:values.greeting,language:values.language}).select().single();
 if(error){toast("Could not save executive: "+error.message);return false}
 db.agents.push({id:data.id,name:data.name,role:data.role,greeting:data.greeting,language:data.language});render();toast("AI executive saved to cloud");return true;
}
async function deleteAgent(id){
 if(!requireWorkspace())return;
 const {error}=await supabase.from("ai_executives").delete().eq("id",id).eq("business_id",businessId);
 if(error){toast("Could not delete executive: "+error.message);return}
 db.agents=db.agents.filter(a=>a.id!==id);render();toast("AI executive deleted");
}
async function saveKnowledge(q,a){
 if(!requireWorkspace())return;
 const {data,error}=await supabase.from("knowledge_items").insert({business_id:businessId,question:q,answer:a}).select().single();
 if(error){toast("Could not save knowledge: "+error.message);return false}
 db.knowledge.push({id:data.id,q:data.question,a:data.answer});render();toast("Knowledge saved to cloud");return true;
}
async function deleteKnowledge(id){
 if(!requireWorkspace())return;
 const {error}=await supabase.from("knowledge_items").delete().eq("id",id).eq("business_id",businessId);
 if(error){toast("Could not remove knowledge: "+error.message);return}
 db.knowledge=db.knowledge.filter(k=>k.id!==id);render();toast("Knowledge removed");
}
async function saveBusiness(values){
 if(!requireWorkspace())return;
 const {data,error}=await supabase.from("businesses").update({name:values.name,industry:values.industry,website:values.website||null,default_language:values.language}).eq("id",businessId).select().single();
 if(error){toast("Could not update business: "+error.message);return}
 db.business={name:data.name,industry:data.industry||"Other",website:data.website||"",language:data.default_language||"English"};render();toast("Business profile saved to cloud");
}
document.addEventListener("click",e=>{
 let n=e.target.closest("[data-page]");if(n)page(n.dataset.page);
 let g=e.target.closest("[data-goto]");if(g)page(g.dataset.goto);
 if(e.target.closest("[data-create]")){if(requireWorkspace())modal("createModal",true)}
 if(e.target.closest("[data-close]"))document.querySelectorAll(".backdrop").forEach(x=>x.classList.remove("open"));
 let t=e.target.closest("[data-test]");if(t)openTest(t.dataset.test);
 let r=e.target.closest("[data-remove]");if(r&&confirm("Delete this executive and its linked knowledge?"))deleteAgent(r.dataset.remove);
 let k=e.target.closest("[data-kremove]");if(k)deleteKnowledge(k.dataset.kremove);
});
document.querySelectorAll(".backdrop").forEach(x=>x.addEventListener("click",e=>{if(e.target===x)x.classList.remove("open")}));
document.getElementById("agentForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!requireWorkspace())return;
 const submit=e.target.querySelector('button[type="submit"],button:not([type])');if(submit)submit.disabled=true;
 const saved=await saveAgent({name:document.getElementById("agentName").value.trim(),role:document.getElementById("role").value,greeting:document.getElementById("greeting").value,language:document.getElementById("agentLanguage").value});
 if(submit)submit.disabled=false;
 if(saved){e.target.reset();modal("createModal",false);page("agents")}
});
document.getElementById("knowledgeForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!requireWorkspace())return;
 const q=document.getElementById("question").value.trim(),a=document.getElementById("answer").value.trim();
 const submit=e.target.querySelector("button");submit.disabled=true;const saved=await saveKnowledge(q,a);submit.disabled=false;
 if(saved)e.target.reset()
});
document.getElementById("businessForm").addEventListener("submit",async e=>{
 e.preventDefault();const submit=e.target.querySelector("button");submit.disabled=true;
 await saveBusiness({name:document.getElementById("businessName").value.trim(),industry:document.getElementById("industry").value,website:document.getElementById("website").value.trim(),language:document.getElementById("language").value});
 submit.disabled=false;
});
document.getElementById("dismiss").onclick=()=>document.getElementById("notice").remove();
document.getElementById("menu").onclick=()=>document.getElementById("sidebar").classList.toggle("open");
function openTest(id){
 active=id;let a=db.agents.find(x=>x.id===id);if(!a)return;
 document.getElementById("testTitle").textContent="Test "+a.name;
 document.getElementById("chat").innerHTML='<div class="bubble bot">'+safe(a.greeting)+'</div>';
 document.getElementById("voiceStatus").textContent="Browser voice playground. This does not place a phone call.";
 modal("testModal",true);
}
function bubble(s,type){let d=document.createElement("div");d.className="bubble "+type;d.textContent=s;let c=document.getElementById("chat");c.appendChild(d);c.scrollTop=c.scrollHeight}
function answer(q){
 let ql=q.toLowerCase(),best=db.knowledge.map(k=>({k,score:k.q.toLowerCase().split(/\W+/).filter(w=>w.length>2&&ql.includes(w)).length})).sort((a,b)=>b.score-a.score)[0];
 if(best&&best.score)return best.k.a;
 if(/hello|hi|hey/.test(ql))return "Hello! Thank you for contacting "+db.business.name+". How can I help you?";
 if(/human|person|agent|complaint/.test(ql))return "I can note that you would like a human team member to follow up. Live call transfer is not enabled in this demo.";
 return "I don't have a verified answer for that yet. I don't want to guess. Please add the correct information to this business's knowledge base, or ask the team to follow up.";
}
function say(s,lang){if(!("speechSynthesis"in window))return;let u=new SpeechSynthesisUtterance(s);u.lang=({English:"en-IN",Hindi:"hi-IN",Gujarati:"gu-IN",Kannada:"kn-IN"})[lang]||"en-IN";speechSynthesis.cancel();speechSynthesis.speak(u)}
async function respond(q){
 if(!requireWorkspace())return;
 let a=db.agents.find(x=>x.id===active);if(!a)return;
 bubble(q,"human");let ans=answer(q);bubble(ans,"bot");say(ans,a.language);
 const {data:conversation,error:conversationError}=await supabase.from("conversations").insert({business_id:businessId,executive_id:a.id,channel:"test",status:"resolved"}).select().single();
 if(conversationError){toast("Reply shown, but conversation was not saved: "+conversationError.message);return}
 const {error:messageError}=await supabase.from("conversation_messages").insert([
  {conversation_id:conversation.id,speaker:"customer",body:q},
  {conversation_id:conversation.id,speaker:"assistant",body:ans}
 ]);
 if(messageError){toast("Conversation created, but messages failed to save: "+messageError.message);return}
 db.chats.push({id:conversation.id,agent:a.name,q,a:ans,at:conversation.started_at||new Date().toISOString()});render();
}
document.getElementById("chatForm").addEventListener("submit",e=>{e.preventDefault();let i=document.getElementById("chatInput"),q=i.value.trim();if(q){i.value="";respond(q)}});
document.getElementById("listen").onclick=()=>{
 let SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){document.getElementById("voiceStatus").textContent="Speech recognition is not supported in this browser. Type your question instead.";return}
 if(rec){rec.stop();rec=null}
 let a=db.agents.find(x=>x.id===active);if(!a)return;
 rec=new SR();rec.lang=({English:"en-IN",Hindi:"hi-IN",Gujarati:"gu-IN",Kannada:"kn-IN"})[a.language]||"en-IN";
 rec.onstart=()=>document.getElementById("voiceStatus").textContent="Listening…";
 rec.onresult=e=>respond(e.results[0][0].transcript);
 rec.onerror=e=>document.getElementById("voiceStatus").textContent="Microphone error: "+e.error;
 rec.onend=()=>rec=null;
 try{rec.start()}catch(e){document.getElementById("voiceStatus").textContent="Could not start microphone. Check permission."}
};
document.getElementById("stop").onclick=()=>{if(rec){rec.stop();rec=null}if("speechSynthesis"in window)speechSynthesis.cancel();document.getElementById("voiceStatus").textContent="Voice stopped."};
if(supabase){
 supabase.auth.getSession().then(({data})=>loadWorkspace(data.session));
 supabase.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_IN"||event==="TOKEN_REFRESHED")loadWorkspace(session);if(event==="SIGNED_OUT")loadWorkspace(null)});
}else{toast("Supabase connection is unavailable. Refresh this page.")}
render();
