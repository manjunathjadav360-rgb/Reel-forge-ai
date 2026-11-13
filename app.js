const supabase = window.aikivoSupabase;
const emptyData = () => ({business:{name:"My Business",industry:"Other",website:"",language:"English"},agents:[],knowledge:[],knowledgeSources:[],widgetDomains:[],chats:[],tickets:[],members:[]});
let db = emptyData();
let active = null;
let activeConversationId = null;
let rec = null;
let currentUser = null;
let businessId = null;
let memberRole = "viewer";
let workspaceLoadToken = 0;
let ticketFilter = "all";
let conversationFilter = "all";
let onboardingStep=1;
let onboardAgentId=null;
let launchAgentId=null;

function safe(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function toast(s){let t=document.getElementById("toast");t.textContent=s;t.style.cssText="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#172238;color:white;padding:10px 15px;border-radius:8px;font-size:11px;z-index:50";setTimeout(()=>t.style.cssText="",2600)}
function page(p){document.querySelectorAll(".page").forEach(x=>x.classList.toggle("show",x.id==="page-"+p));document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.page===p));document.getElementById("crumb").textContent=p[0].toUpperCase()+p.slice(1);document.getElementById("sidebar").classList.remove("open")}
function modal(id,on){document.getElementById(id).classList.toggle("open",on)}
function requireWorkspace(){if(!currentUser||!businessId){toast("Please sign in to use your workspace.");return false}return true}
function render(){
 const quickTestButton=document.getElementById("quickTestButton");
 if(quickTestButton){quickTestButton.disabled=!db.agents.length;quickTestButton.textContent=db.agents.length?"Test voice":"Create an executive first";}
 document.getElementById("sideBusiness").textContent=db.business.name;
 renderOnboardingPanel();
 document.getElementById("memberRoleLabel").textContent=memberRole.toUpperCase();
 document.getElementById("buildSemanticIndex").hidden=!["owner","admin"].includes(memberRole);
 document.getElementById("aiEvaluationCard").hidden=!["owner","admin"].includes(memberRole);
 document.querySelectorAll("[data-create]").forEach(b=>b.hidden=!["owner","admin"].includes(memberRole));
 document.getElementById("knowledgeForm").hidden=!["owner","admin"].includes(memberRole);
 document.getElementById("websiteTrainForm").hidden=!["owner","admin"].includes(memberRole);
 document.getElementById("textTrainForm").hidden=!["owner","admin"].includes(memberRole);
 document.getElementById("businessForm").querySelectorAll("input,select,button").forEach(el=>el.disabled=!["owner","admin"].includes(memberRole));
 document.getElementById("teamRole").textContent=memberRole.charAt(0).toUpperCase()+memberRole.slice(1);
 document.getElementById("teamPermissionSummary").textContent=memberRole==="owner"?"Full workspace control, including business settings, AI executives, knowledge and team management.":memberRole==="admin"?"Manage business settings, AI executives, knowledge and support. Invite agents and viewers.":"Handle conversations and support tickets. Workspace configuration is read-only.";
 document.getElementById("invitePanel").hidden=!(memberRole==="owner"||memberRole==="admin");
 document.getElementById("inviteRoleAdmin").hidden=memberRole!=="owner";
 document.getElementById("teamList").innerHTML=db.members.map(m=>{const editable=["owner","admin"].includes(memberRole)&&m.member_role!=="owner"&&m.user_id!==currentUser?.id;const opts=(memberRole==="owner"?["admin","agent","viewer"]:["agent","viewer"]).map(r=>`<option value="${r}" ${m.member_role===r?"selected":""}>${r}</option>`).join("");return `<div class="team-row"><div class="team-person"><b>${safe(m.display_name||m.email||"Team member")}</b><small>${safe(m.email||"Email unavailable")}</small></div><span class="team-role">${safe(m.member_role)}</span>${editable?`<select data-member-role="${m.user_id}">${opts}</select><button class="secondary" data-member-remove="${m.user_id}">Remove</button>`:""}</div>`}).join("")||`<p class="empty">No team members found.</p>`;
 document.getElementById("agentCount").textContent=db.agents.length;
 document.getElementById("knowledgeCount").textContent=db.knowledge.length;
 document.getElementById("chatCount").textContent=db.chats.length;
 document.getElementById("ticketCount").textContent=db.tickets.filter(t=>!["resolved","closed"].includes(t.status)).length;
 document.getElementById("businessName").value=db.business.name;
 document.getElementById("industry").value=db.business.industry;
 document.getElementById("website").value=db.business.website;
 document.getElementById("language").value=db.business.language;
 const cards=db.agents.map(a=>{
 const snippet='<script src="https://manjunathjadav360-rgb.github.io/Reel-forge-ai/widget.js" data-aikivo-key="'+a.widget_key+'"><\/script>';const verified=db.widgetDomains.some(d=>d.executive_id===a.id&&d.verified_at);
 return '<article class="agent-card"><h3>◉　'+safe(a.name)+'</h3><p>'+safe(a.role)+' · '+safe(a.language)+'</p><p>'+safe(a.greeting)+'</p><div class="agent-actions"><button class="secondary" data-test="'+a.id+'">Test voice</button><button class="secondary" data-widget-toggle="'+a.id+'" '+(!["owner","admin"].includes(memberRole)?'disabled':'')+'>'+(a.widget_enabled?'Disable website chat':'Enable website chat')+'</button><button class="secondary" data-remove="'+a.id+'">Delete</button></div><div class="widget-embed"><small class="label">WEBSITE CHAT WIDGET</small><p class="widget-state">'+(a.widget_enabled?(verified?'Enabled · verified domain':'Enabled · domain verification required'):'Disabled · enable to receive website chats')+'</p><textarea readonly rows="2">'+safe(snippet)+'</textarea><button class="link" data-copy-widget="'+a.id+'" '+(!a.widget_enabled?'disabled':'')+'>Copy embed code</button></div></article>';
}).join("");
 document.getElementById("agentList").innerHTML=cards||'<article class="card empty">No AI executives yet. Use Create executive to add one.</article>';
 renderLaunchCenter();
 document.getElementById("overviewAgents").innerHTML=db.agents.length?db.agents.slice(0,3).map(a=>'<p>◉　<b>'+safe(a.name)+'</b> — '+safe(a.role)+' <button class="link" data-test="'+a.id+'">Test</button></p>').join(""):"No AI executives yet. Create your first assistant.";
 const searchExecutive=document.getElementById("knowledgeSearchExecutive");
 if(searchExecutive){
  const selected=searchExecutive.value;
  searchExecutive.innerHTML=db.agents.map(a=>'<option value="'+safe(a.id)+'">'+safe(a.name)+' · '+safe(a.language)+'</option>').join("")||'<option value="">Create an AI executive first</option>';
  if(db.agents.some(a=>a.id===selected))searchExecutive.value=selected;
  searchExecutive.disabled=!db.agents.length;
  document.getElementById("knowledgeSearchButton").disabled=!db.agents.length;
 }
 document.getElementById("knowledgeList").innerHTML=db.knowledge.map(k=>'<div class="knowledge-item"><b>'+safe(k.q)+'</b><p>'+safe(k.a)+'</p><button class="delete" data-kremove="'+k.id+'">Remove</button></div>').join("")||'<p class="empty">No manual FAQs added yet.</p>';
 const sourceHost=document.getElementById("knowledgeSources");
 if(sourceHost)sourceHost.innerHTML=db.knowledgeSources.map(s=>'<div class="source-row"><div><b>'+safe(s.title)+'</b><small>'+safe(s.source_type==="website"?"Website":"Text file")+' · '+Number(s.item_count||0)+' sections · '+new Date(s.created_at).toLocaleDateString()+'</small></div><button class="delete" data-source-remove="'+s.id+'">Remove</button></div>').join("")||'<p class="empty">No imported sources yet.</p>';
 renderConversations();
  renderTickets();
}


function renderConversations(){
 const roster=db.members.filter(m=>["owner","admin","agent"].includes(m.member_role));
 const visible=db.chats.filter(c=>conversationFilter==="mine"?c.assigned_to===currentUser?.id:conversationFilter==="unassigned"?!c.assigned_to:true);
 const list=document.getElementById("conversationList");
 if(!list)return;
 list.innerHTML=visible.slice().reverse().map(c=>{
  const assignee=db.members.find(m=>m.user_id===c.assigned_to);
  const canAssign=memberRole==="owner"||memberRole==="admin"||memberRole==="agent";
  const choices=memberRole==="owner"||memberRole==="admin"?roster:(memberRole==="agent"?roster.filter(m=>m.user_id===currentUser?.id):[]);
  let options='<option value="">Unassigned</option>'+choices.map(m=>'<option value="'+m.user_id+'" '+(c.assigned_to===m.user_id?"selected":"")+'>'+safe(m.display_name||m.email||"Team member")+' · '+safe(m.member_role)+'</option>').join("");
  if(c.assigned_to&&!choices.some(m=>m.user_id===c.assigned_to))options+='<option value="'+c.assigned_to+'" selected>Current assignee</option>';
  const messages=(c.messages||[]).map(m=>'<div class="thread-message"><b>'+safe(({customer:"Customer",assistant:"AI executive",agent:"Agent",admin:"Admin",owner:"Owner"})[m.speaker]||m.speaker)+'</b><p>'+safe(m.body)+'</p><small>'+new Date(m.created_at).toLocaleString()+'</small></div>').join("")||'<p class="empty">No messages yet.</p>';
  const replyAllowed=["owner","admin","agent"].includes(memberRole)&&c.status!=="resolved";
  return '<article class="conversation-card"><div class="conversation-head"><div><b>'+safe(c.agent)+'</b><small>'+new Date(c.at).toLocaleString()+'</small></div><span class="conversation-status">'+safe(c.status||"open")+'</span></div><div class="conversation-assignment"><span>Assigned to: <b>'+safe(assignee?.display_name||assignee?.email||(c.assigned_to?"Team member":"Unassigned"))+'</b></span><select data-conversation-assignee="'+c.id+'" '+(!canAssign?'disabled':'')+'>'+options+'</select></div><div class="conversation-thread">'+messages+'</div>'+(replyAllowed?'<form class="team-reply-form" data-team-reply="'+c.id+'"><textarea id="reply-'+c.id+'" rows="2" placeholder="Write a reply as your support team…" required></textarea><button class="primary" type="submit">Send reply</button></form>':'<p class="hint">This conversation is resolved or your role is read-only.</p>')+'</article>';
 }).join("")||'<p class="empty">'+(db.chats.length?"No conversations match this filter.":"No conversations yet. Start a test conversation to see it here.")+'</p>';
}
async function sendTeamReply(conversationId,body){
 if(!requireWorkspace()||!["owner","admin","agent"].includes(memberRole))return;
 const conversation=db.chats.find(c=>c.id===conversationId);
 if(!conversation||conversation.status==="resolved")return;
 const {data,error}=await supabase.from("conversation_messages").insert({conversation_id:conversationId,speaker:"agent",body}).select().single();
 if(error){toast("Reply failed: "+error.message);return false}
 const assignment=conversation.assigned_to||currentUser.id;
 const {error:updateError}=await supabase.from("conversations").update({assigned_to:assignment,status:"open"}).eq("id",conversationId).eq("business_id",businessId);
 if(updateError){toast("Reply saved, but conversation assignment/status could not update: "+updateError.message)}
 conversation.assigned_to=assignment;conversation.status="open";
 conversation.messages=conversation.messages||[];conversation.messages.push(data);
 renderConversations();toast("Team reply sent.");return true;
}

function renderTickets(){
 const roster=db.members.filter(m=>["owner","admin","agent"].includes(m.member_role));
 const visible=db.tickets.filter(t=>ticketFilter==="mine"?t.assigned_to===currentUser?.id:ticketFilter==="unassigned"?!t.assigned_to:true);
 const open=db.tickets.filter(t=>!["resolved","closed"].includes(t.status)).length;
 const mine=db.tickets.filter(t=>t.assigned_to===currentUser?.id&&!["resolved","closed"].includes(t.status)).length;
 const summary=document.getElementById("ticketSummary");
 if(summary)summary.textContent=db.tickets.length+" total · "+open+" active · "+mine+" assigned to you";
 const canManage=["owner","admin","agent"].includes(memberRole);
 document.getElementById("ticketList").innerHTML=visible.map(t=>{
  const current=db.members.find(m=>m.user_id===t.assigned_to);
  const label=current?(current.display_name||current.email||"Team member"):(t.assigned_to?"Assigned teammate":"Unassigned");
  const choices=memberRole==="owner"||memberRole==="admin"?roster:(memberRole==="agent"?roster.filter(m=>m.user_id===currentUser?.id):[]);
  let options='<option value="">Unassigned</option>'+choices.map(m=>'<option value="'+m.user_id+'" '+(t.assigned_to===m.user_id?"selected":"")+'>'+safe(m.display_name||m.email||"Team member")+' · '+safe(m.member_role)+'</option>').join("");
  if(t.assigned_to&&!choices.some(m=>m.user_id===t.assigned_to))options+='<option value="'+t.assigned_to+'" selected>Current assignee</option>';
  return '<div class="knowledge-item ticket-card"><div class="ticket-top"><b>'+safe(t.subject)+'</b><select data-ticket-status="'+t.id+'" '+(!canManage?'disabled':'')+'><option value="open" '+(t.status==="open"?"selected":"")+'>Open</option><option value="in_progress" '+(t.status==="in_progress"?"selected":"")+'>In progress</option><option value="waiting_customer" '+(t.status==="waiting_customer"?"selected":"")+'>Waiting</option><option value="resolved" '+(t.status==="resolved"?"selected":"")+'>Resolved</option><option value="closed" '+(t.status==="closed"?"selected":"")+'>Closed</option></select></div><p>'+safe(t.description||"")+'</p><div class="ticket-meta"><span>Assigned: <b>'+safe(label)+'</b></span><span>'+new Date(t.created_at).toLocaleString()+'</span></div><label class="ticket-assignment">Assign to<select data-ticket-assignee="'+t.id+'" '+(!canManage?'disabled':'')+'>'+options+'</select></label></div>';
 }).join("")||'<p class="empty">'+(db.tickets.length?"No tickets match this filter.":"No handoff tickets yet.")+'</p>';
}

async function loadWorkspace(session){
 const token=++workspaceLoadToken;
 if(!session){currentUser=null;businessId=null;memberRole="viewer";db=emptyData();render();return}
 currentUser=session.user;
 try{
  const {data:membership,error:memberError}=await supabase.from("business_members").select("business_id,member_role,businesses(id,name,industry,website,default_language,onboarding_completed)").eq("user_id",session.user.id).limit(1).maybeSingle();
  if(memberError)throw memberError;
  if(!membership||!membership.business_id)throw new Error("Your account has no workspace membership. Please contact support.");
  const targetBusinessId=membership.business_id;
  memberRole=membership.member_role||"viewer";
  const business=Array.isArray(membership.businesses)?membership.businesses[0]:membership.businesses;
  const [agentsRes,knowledgeRes,sourcesRes,conversationsRes,ticketsRes,membersRes,domainsRes]=await Promise.all([
   supabase.from("ai_executives").select("*").eq("business_id",targetBusinessId).order("created_at",{ascending:true}),
   supabase.from("knowledge_items").select("*").eq("business_id",targetBusinessId).order("created_at",{ascending:true}),
   supabase.from("knowledge_sources").select("*").eq("business_id",targetBusinessId).order("created_at",{ascending:false}),
   supabase.from("conversations").select("*").eq("business_id",targetBusinessId).order("started_at",{ascending:false}),
   supabase.from("support_tickets").select("*").eq("business_id",targetBusinessId).order("created_at",{ascending:false}),
   supabase.from("business_members").select("user_id,email,display_name,member_role,created_at").eq("business_id",targetBusinessId).order("created_at",{ascending:true}),
   ["owner","admin"].includes(memberRole)?supabase.from("widget_domains").select("*").eq("business_id",targetBusinessId).order("created_at",{ascending:true}):Promise.resolve({data:[],error:null})
  ]);
  if(agentsRes.error)throw agentsRes.error;
  if(knowledgeRes.error)throw knowledgeRes.error;
  if(sourcesRes.error)throw sourcesRes.error;
  if(conversationsRes.error)throw conversationsRes.error;
  if(ticketsRes.error)throw ticketsRes.error;
  if(membersRes.error)throw membersRes.error;
  if(domainsRes.error)throw domainsRes.error;
  const conversations=conversationsRes.data||[];
  let messages=[];
  if(conversations.length){
   const {data,error}=await supabase.from("conversation_messages").select("*").in("conversation_id",conversations.map(c=>c.id)).order("created_at",{ascending:true});
   if(error)throw error;
   messages=data||[];
  }
  if(token!==workspaceLoadToken)return;
  businessId=targetBusinessId;
  db.business={name:business?.name||"My Business",industry:business?.industry||"Other",website:business?.website||"",language:business?.default_language||"English",onboarding_completed:!!business?.onboarding_completed};
  db.agents=(agentsRes.data||[]).map(a=>({id:a.id,name:a.name,role:a.role,greeting:a.greeting,language:a.language,widget_key:a.widget_key,widget_enabled:!!a.widget_enabled}));
  db.knowledge=(knowledgeRes.data||[]).map(k=>({id:k.id,q:k.question,a:k.answer,source_id:k.source_id}));
  db.knowledgeSources=sourcesRes.data||[];
  db.widgetDomains=domainsRes.data||[];
  db.tickets=ticketsRes.data||[];
  db.members=membersRes.data||[];
  const agentNames=new Map(db.agents.map(a=>[a.id,a.name]));
  db.chats=conversations.map(c=>{
   const rows=messages.filter(m=>m.conversation_id===c.id);
   const customer=rows.find(m=>m.speaker==="customer");
   const assistant=rows.find(m=>m.speaker==="assistant");
   return {id:c.id,agent:agentNames.get(c.executive_id)||"AI executive",q:customer?.body||"",a:assistant?.body||"",at:c.started_at,status:c.status,assigned_to:c.assigned_to,messages:rows};
  });
  render();
  document.getElementById("accountState").textContent="CLOUD WORKSPACE";
  const notice=document.getElementById("notice");
  if(notice){notice.querySelector("b").textContent="Cloud workspace connected";notice.querySelector("span").textContent="Your AI executives, knowledge and test conversations are saved to your business account."}
 }catch(error){
  console.error("AIKIVO workspace load:",error);
  toast("Workspace load failed: "+(error.message||"Please refresh."));
 }
}


function requireWorkspaceQuiet(){return !!(currentUser&&businessId)}
function renderOnboardingPanel(){
 const panel=document.getElementById("onboardingPanel");if(!panel)return;
 const done=!!db.business.onboarding_completed,progress=done?4:Math.max(0,onboardingStep-1);
 panel.hidden=done||!requireWorkspaceQuiet();
 panel.innerHTML='<div class="onboard-card"><div><small class="label">GET YOUR FIRST AI LIVE</small><h2>Set up your AIKIVO workspace</h2><p>Configure your business, create an assistant, add one verified answer and publish your website chat.</p><div class="onboard-progress"><span style="width:'+(progress/4*100)+'%"></span></div><small class="onboard-count">'+progress+' of 4 setup steps completed</small></div><button class="primary" data-onboarding-start>Continue setup</button></div>';
}
function renderOnboardingStep(){
 const host=document.getElementById("onboardingStepContent");if(!host)return;
 const titles=["Business profile","Create your AI executive","Add your first answer","Preview and publish"];
 let body="";
 if(onboardingStep===1){
  body='<label>Business name<input id="onboardBusinessName" maxlength="120" required value="'+safe(db.business.name)+'"></label><label>Industry<select id="onboardIndustry">'+["Other","Hotel and hospitality","Education","Retail and ecommerce","Real estate","Healthcare administration"].map(x=>'<option '+(db.business.industry===x?"selected":"")+'>'+x+'</option>').join("")+'</select></label><label>Website (optional)<input id="onboardWebsite" type="url" placeholder="https://example.com" value="'+safe(db.business.website)+'"></label><label>Default language<select id="onboardLanguage">'+["English","Hindi","Gujarati","Kannada"].map(x=>'<option '+(db.business.language===x?"selected":"")+'>'+x+'</option>').join("")+'</select></label><button class="primary" type="submit">Save and continue</button>';
 }else if(onboardingStep===2){
  body='<label>AI executive name<input id="onboardAgentName" required maxlength="60" placeholder="e.g. Aira"></label><label>Role<select id="onboardRole"><option>Customer support</option><option>Hotel receptionist</option><option>Sales assistant</option><option>Appointment assistant</option><option>Admissions assistant</option></select></label><label>Greeting<textarea id="onboardGreeting" rows="3" required>Hello! Thanks for contacting '+safe(db.business.name)+'. How can I help you today?</textarea></label><label>Reply language<select id="onboardAgentLanguage">'+["English","Hindi","Gujarati","Kannada"].map(x=>'<option '+(db.business.language===x?"selected":"")+'>'+x+'</option>').join("")+'</select></label><button class="primary" type="submit">Create AI executive</button>';
 }else if(onboardingStep===3){
  body='<label>Customer question<input id="onboardQuestion" required placeholder="What are your business hours?"></label><label>Verified business answer<textarea id="onboardAnswer" rows="4" required placeholder="Write the exact answer your business approves."></textarea></label><p class="hint">Your assistant should use approved answers and never invent business policies or prices.</p><button class="primary" type="submit">Save answer</button>';
 }else{
  const agent=db.agents.find(a=>a.id===onboardAgentId)||db.agents[0];
  const hasVerifiedDomain=!!agent&&db.widgetDomains.some(d=>d.executive_id===agent.id&&d.verified_at);
  const snippet=agent?'<script src="https://manjunathjadav360-rgb.github.io/Reel-forge-ai/widget.js" data-aikivo-key="'+agent.widget_key+'"><\\/script>':"Create an AI executive first.";
  body='<p class="hint">Preview your assistant. Before publishing, prove ownership of your website in the launch center using a DNS TXT record.</p><div class="onboard-preview"><b>'+safe(agent?.name||"No AI executive yet")+'</b><span>'+safe(agent?.role||"")+'</span><p>'+safe(agent?.greeting||"")+'</p></div><button class="secondary" type="button" data-onboard-preview '+(!agent?'disabled':'')+'>Preview assistant</button><label>Website embed code<textarea rows="2" readonly>'+safe(snippet)+'</textarea></label><button class="secondary" type="button" data-onboard-launch>Open website launch center</button><button class="primary" type="submit" '+(!agent||!hasVerifiedDomain?'disabled':'')+'>Publish chat and finish setup</button>';
 }
 host.innerHTML='<div class="onboard-step-head"><small class="label">STEP '+onboardingStep+' OF 4</small><h2>'+titles[onboardingStep-1]+'</h2></div><form id="onboardingForm" class="onboarding-form">'+body+'</form>';
}
function startOnboarding(){
 if(!requireWorkspace())return;
 if(!["owner","admin"].includes(memberRole)){toast("Ask your workspace owner to complete setup.");return}
 onboardingStep=1;onboardAgentId=db.agents[0]?.id||null;
 if(db.agents.length)onboardingStep=3;
 if(db.agents.length&&db.knowledge.length)onboardingStep=4;
 renderOnboardingStep();renderOnboardingPanel();modal("onboardingModal",true);
}
async function submitOnboardingStep(event){
 event.preventDefault();const button=event.target.querySelector('button[type="submit"]');if(button)button.disabled=true;
 try{
  if(onboardingStep===1){
   const v={name:document.getElementById("onboardBusinessName").value.trim(),industry:document.getElementById("onboardIndustry").value,website:document.getElementById("onboardWebsite").value.trim(),language:document.getElementById("onboardLanguage").value};
   if(!v.name)throw new Error("Enter your business name.");
   const {data,error}=await supabase.from("businesses").update({name:v.name,industry:v.industry,website:v.website||null,default_language:v.language}).eq("id",businessId).select().single();if(error)throw error;
   db.business={...db.business,name:data.name,industry:data.industry||"Other",website:data.website||"",language:data.default_language||"English"};onboardingStep=2;
  }else if(onboardingStep===2){
   const ok=await saveAgent({name:document.getElementById("onboardAgentName").value.trim(),role:document.getElementById("onboardRole").value,greeting:document.getElementById("onboardGreeting").value.trim(),language:document.getElementById("onboardAgentLanguage").value});
   if(!ok)throw new Error("Could not create your AI executive.");onboardAgentId=db.agents[db.agents.length-1]?.id;onboardingStep=3;
  }else if(onboardingStep===3){
   const ok=await saveKnowledge(document.getElementById("onboardQuestion").value.trim(),document.getElementById("onboardAnswer").value.trim());
   if(!ok)throw new Error("Could not save the approved answer.");onboardingStep=4;
  }else{
   const agent=db.agents.find(a=>a.id===onboardAgentId)||db.agents[0];if(!agent)throw new Error("Create an AI executive before publishing.");if(!db.knowledge.length)throw new Error("Add at least one approved knowledge item before publishing.");if(!db.widgetDomains.some(d=>d.executive_id===agent.id&&d.verified_at))throw new Error("Verify your website domain in the launch center before publishing.");
   const {error:widgetError}=await supabase.from("ai_executives").update({widget_enabled:true}).eq("id",agent.id).eq("business_id",businessId);if(widgetError)throw widgetError;
   const {error:doneError}=await supabase.from("businesses").update({onboarding_completed:true}).eq("id",businessId);if(doneError)throw doneError;
   agent.widget_enabled=true;db.business.onboarding_completed=true;modal("onboardingModal",false);render();page("agents");toast("AIKIVO setup complete. Website chat is published.");return;
  }
  renderOnboardingStep();render();
 }catch(error){toast(error.message||"Setup could not continue.");}
 finally{if(button)button.disabled=false;}
}

function renderLaunchCenter(){
 const select=document.getElementById("launchExecutiveSelect");if(!select)return;
 if(!db.agents.some(a=>a.id===launchAgentId))launchAgentId=db.agents[0]?.id||null;
 select.innerHTML=db.agents.map(a=>'<option value="'+safe(a.id)+'" '+(a.id===launchAgentId?'selected':'')+'>'+safe(a.name)+'</option>').join("")||'<option value="">Create an AI executive first</option>';
 select.disabled=!db.agents.length;
 const agent=db.agents.find(a=>a.id===launchAgentId),isAdmin=["owner","admin"].includes(memberRole),hasKnowledge=db.knowledge.length>0;
 const domains=db.widgetDomains.filter(d=>d.executive_id===launchAgentId),verifiedDomains=domains.filter(d=>!!d.verified_at),enabled=!!agent?.widget_enabled;
 const ready=!!agent&&hasKnowledge&&verifiedDomains.length>0,website=db.business.website;
 const steps=[
  {ok:!!db.business.name&&db.business.name!=="My Business",title:"Business profile",detail:website?"Business name and website are saved.":"Business name saved. Add your website URL in Settings."},
  {ok:!!agent,title:"AI executive",detail:agent?agent.name+" is configured.":"Create an AI executive first."},
  {ok:hasKnowledge,title:"Approved knowledge",detail:hasKnowledge?db.knowledge.length+" approved knowledge item(s) available.":"Add at least one verified FAQ or import business information."},
  {ok:verifiedDomains.length>0,title:"Verified website domain",detail:verifiedDomains.length?verifiedDomains.map(d=>d.domain).join(", "):"Add a domain and verify its DNS TXT ownership record."},
  {ok:enabled,title:"Website chat published",detail:enabled?(verifiedDomains.length?"Widget is enabled and restricted to verified domains.":"Widget is enabled but blocked until a domain is DNS-verified."):"Publish the widget after completing the required setup."}
 ];
 document.getElementById("launchChecklist").innerHTML=steps.map((s,i)=>'<div class="launch-step"><span class="launch-step-icon '+(s.ok?'done':'pending')+'">'+(s.ok?'✓':(i+1))+'</span><div><b>'+safe(s.title)+'</b><small>'+safe(s.detail)+'</small></div></div>').join("");
 const badge=document.getElementById("launchStatusBadge");
 badge.textContent=enabled?(verifiedDomains.length?"PUBLISHED":"DOMAIN CHECK REQUIRED"):ready?"READY TO PUBLISH":"SETUP REQUIRED";
 const button=document.getElementById("launchPublishButton");
 button.textContent=enabled?"Disable website chat":"Publish website chat";
 button.disabled=!isAdmin||(!ready&&!enabled);
 button.title=!isAdmin?"Only workspace owners and admins can publish.":(!ready&&!enabled?"Add an AI executive, approved knowledge and verified website domain first.":"");
 const domainList=document.getElementById("launchDomainList");
 if(domainList)domainList.innerHTML=domains.map(d=>'<div class="launch-domain-row"><div class="launch-domain-main"><span><b>'+safe(d.domain)+'</b><small>'+(d.verified_at?'DNS ownership verified':'Verification pending · HTTPS hostname')+'</small></span>'+(d.verified_at?'':'<div class="launch-dns-record"><small>TXT name</small><code>_aikivo-verification.'+safe(d.domain)+'</code><small>TXT value</small><code>aikivo-verification='+safe(d.verification_token)+'</code><button type="button" class="secondary" data-domain-copy="'+safe(d.id)+'">Copy DNS record</button><button type="button" class="secondary" data-domain-verify="'+safe(d.id)+'">Verify DNS</button></div>')+'</div><button type="button" class="secondary" data-domain-remove="'+safe(d.id)+'">Remove</button></div>').join("")||'<p class="hint">No website domains yet. Add your website hostname.</p>';
 const code=document.getElementById("launchEmbedCode");
 const snippet=agent?'<script src="https://manjunathjadav360-rgb.github.io/Reel-forge-ai/widget.js" data-aikivo-key="'+agent.widget_key+'"><\/script>':"Create an AI executive to generate installation code.";
 code.value=snippet;
 document.getElementById("launchCopyButton").disabled=!enabled||!isAdmin;
 const preview=document.getElementById("launchPreviewLink");
 let websiteHost="";try{websiteHost=new URL(website).hostname.toLowerCase();}catch{}
 const websiteApproved=verifiedDomains.some(d=>d.domain===websiteHost);
 if(enabled&&website&&websiteApproved){preview.href=website;preview.textContent="Open your website to test ↗";preview.hidden=false;}else{preview.href="#";preview.textContent="Open your website to test ↗";preview.hidden=true;}
 document.getElementById("launchCenter").hidden=!isAdmin;
}
async function addWidgetDomain(){
 if(!requireWorkspace()||!["owner","admin"].includes(memberRole)||!launchAgentId)return;
 const input=document.getElementById("launchDomainInput"),raw=input.value.trim();
 let parsed;try{parsed=new URL(raw);}catch{toast("Enter a complete website URL, such as https://example.com");return;}
 const domain=parsed.hostname.toLowerCase().replace(/\\.$/,"");
 if(parsed.protocol!=="https:"||parsed.username||parsed.password||!domain.includes(".")||domain==="localhost"||domain.endsWith(".local")||/^[0-9.]+$/.test(domain)||domain.includes("*")){
  toast("Use a public HTTPS website URL. Add exact hostnames only; no IPs or wildcards.");return;
 }
 const {data,error}=await supabase.from("widget_domains").insert({business_id:businessId,executive_id:launchAgentId,domain,created_by:currentUser.id}).select().single();
 if(error){toast(error.code==="23505"?"This hostname is already approved for this assistant.":"Could not add website domain: "+error.message);return;}
 db.widgetDomains.push(data);input.value="";renderLaunchCenter();toast("Domain added. Publish the DNS TXT record shown below, then verify it.");
}
async function verifyWidgetDomain(id){
 if(!requireWorkspace()||!["owner","admin"].includes(memberRole))return;
 const {data,error}=await supabase.functions.invoke("aikivo-domain-verify",{body:{domainId:id,businessId}});
 if(error){toast("Domain verification request failed. Check your connection and try again.");return;}
 if(!data?.verified){toast(data?.message||"DNS verification is still pending.");return;}
 const row=db.widgetDomains.find(d=>d.id===id);if(row)row.verified_at=data.verified_at;
 renderLaunchCenter();toast("Website ownership verified: "+data.domain);
}
async function copyDomainVerificationRecord(id){
 const row=db.widgetDomains.find(d=>d.id===id);if(!row)return;
 const value="TXT name: _aikivo-verification."+row.domain+"\nTXT value: aikivo-verification="+row.verification_token;
 try{await navigator.clipboard.writeText(value);toast("DNS verification record copied.");}
 catch{toast("Clipboard unavailable. Copy the TXT name and value shown on screen.");}
}
async function removeWidgetDomain(id){
 if(!requireWorkspace()||!["owner","admin"].includes(memberRole))return;
 const {error}=await supabase.from("widget_domains").delete().eq("id",id).eq("business_id",businessId);
 if(error){toast("Could not remove domain: "+error.message);return;}
 db.widgetDomains=db.widgetDomains.filter(d=>d.id!==id);renderLaunchCenter();toast("Approved domain removed.");
}

async function toggleWebsiteWidget(id){
 if(!requireWorkspace()||!["owner","admin"].includes(memberRole))return;
 const agent=db.agents.find(a=>a.id===id);if(!agent)return;
 const enabled=!agent.widget_enabled;
 if(enabled&&db.knowledge.length===0){toast('Add at least one approved FAQ before publishing.');page('knowledge');return;}
 if(enabled&&!db.widgetDomains.some(d=>d.executive_id===id&&d.verified_at)){toast("Verify at least one website domain with its DNS TXT record before publishing.");page("agents");return;}
 const {data,error}=await supabase.from("ai_executives").update({widget_enabled:enabled}).eq("id",id).eq("business_id",businessId).select("id,widget_enabled").single();
 if(error){toast("Could not update website widget: "+error.message);return}
 agent.widget_enabled=data.widget_enabled;render();toast(enabled?"Website chat enabled. Copy the embed code.":"Website chat disabled.");
}
function copyWebsiteWidget(id){
 const agent=db.agents.find(a=>a.id===id);if(!agent||!agent.widget_enabled)return;
 const snippet='<script src="https://manjunathjadav360-rgb.github.io/Reel-forge-ai/widget.js" data-aikivo-key="'+agent.widget_key+'"><\/script>';
 if(navigator.clipboard?.writeText){navigator.clipboard.writeText(snippet).then(()=>toast("Embed code copied."),()=>toast("Clipboard unavailable. Copy the code from the box."));}
 else{toast("Clipboard unavailable. Copy the code from the box.");}
}

async function saveAgent(values){
 if(!requireWorkspace())return;
 const {data,error}=await supabase.from("ai_executives").insert({business_id:businessId,name:values.name,role:values.role,greeting:values.greeting,language:values.language}).select().single();
 if(error){toast("Could not save executive: "+error.message);return false}
 db.agents.push({id:data.id,name:data.name,role:data.role,greeting:data.greeting,language:data.language,widget_key:data.widget_key,widget_enabled:!!data.widget_enabled});render();toast("AI executive saved to cloud");return true;
}
async function deleteAgent(id){
 if(!requireWorkspace())return;
 const {error}=await supabase.from("ai_executives").delete().eq("id",id).eq("business_id",businessId);
 if(error){toast("Could not delete executive: "+error.message);return}
 db.agents=db.agents.filter(a=>a.id!==id);render();toast("AI executive deleted");
}
async function refreshSemanticIndex(){
 if(!businessId||!["owner","admin"].includes(memberRole))return;
 try{
  const {data,error}=await supabase.functions.invoke("aikivo-embed",{body:{businessId}});
  if(error||data?.error){console.warn("Semantic index refresh deferred; keyword search remains available.",data?.error||error?.message);return}
  if(data?.indexed)console.info("AIKIVO semantic index refreshed:",data.indexed,"entries");
 }catch(error){console.warn("Semantic index refresh deferred.",error)}
}
async function saveKnowledge(q,a){
 if(!requireWorkspace())return;
 const {data,error}=await supabase.from("knowledge_items").insert({business_id:businessId,question:q,answer:a}).select().single();
 if(error){toast("Could not save knowledge: "+error.message);return false}
 db.knowledge.push({id:data.id,q:data.question,a:data.answer});render();void refreshSemanticIndex();toast("Knowledge saved to cloud");return true;
}
async function trainKnowledge(sourceType,payload){
 if(!requireWorkspace()||!["owner","admin"].includes(memberRole))return false;
 const {data,error}=await supabase.functions.invoke("aikivo-train",{body:{businessId,sourceType,...payload}});
 if(error||data?.error){toast(data?.error||error?.message||"Training failed.");return false}
 const {data:source,error:sourceError}=await supabase.from("knowledge_sources").select("*").eq("id",data.sourceId).single();
 if(sourceError){toast("Imported, but source list could not refresh: "+sourceError.message);return false}
 db.knowledgeSources.unshift(source);
 const {data:items}=await supabase.from("knowledge_items").select("*").eq("source_id",source.id).order("created_at",{ascending:true});
 db.knowledge.push(...(items||[]).map(k=>({id:k.id,q:k.question,a:k.answer,source_id:k.source_id})));
 render();void refreshSemanticIndex();toast("Imported "+(data.pageCount?data.pageCount+" website pages":data.itemCount+" knowledge sections")+".");return true;
}
async function deleteKnowledgeSource(id){
 if(!requireWorkspace()||!["owner","admin"].includes(memberRole))return;
 const {error}=await supabase.from("knowledge_sources").delete().eq("id",id).eq("business_id",businessId);
 if(error){toast("Could not remove source: "+error.message);return}
 db.knowledgeSources=db.knowledgeSources.filter(s=>s.id!==id);
 const {data}=await supabase.from("knowledge_items").select("*").eq("business_id",businessId).order("created_at",{ascending:true});
 db.knowledge=(data||[]).map(k=>({id:k.id,q:k.question,a:k.answer,source_id:k.source_id}));
 render();toast("Imported source removed.");
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
 db.business={name:data.name,industry:data.industry||"Other",website:data.website||"",language:data.default_language||"English",onboarding_completed:!!data.onboarding_completed};render();toast("Business profile saved to cloud");
}
document.addEventListener("click",e=>{
 if(e.target.closest("#launchPublishButton")){if(launchAgentId)toggleWebsiteWidget(launchAgentId);return;}
 if(e.target.closest("#launchCopyButton")){if(launchAgentId)copyWebsiteWidget(launchAgentId);return;}
 if(e.target.closest("#launchAddDomainButton")){addWidgetDomain();return;}
 const removeDomain=e.target.closest("[data-domain-remove]");if(removeDomain){removeWidgetDomain(removeDomain.dataset.domainRemove);return;}
 const verifyDomain=e.target.closest("[data-domain-verify]");if(verifyDomain){verifyWidgetDomain(verifyDomain.dataset.domainVerify);return;}
 const copyDomain=e.target.closest("[data-domain-copy]");if(copyDomain){copyDomainVerificationRecord(copyDomain.dataset.domainCopy);return;}
 let n=e.target.closest("[data-page]");if(n)page(n.dataset.page);
 if(e.target.closest("[data-onboarding-start]"))startOnboarding();
 if(e.target.closest("[data-onboard-launch]")){modal("onboardingModal",false);launchAgentId=onboardAgentId||db.agents[0]?.id;page("agents");renderLaunchCenter();return;}
 let preview=e.target.closest("[data-onboard-preview]");if(preview){const a=db.agents.find(x=>x.id===onboardAgentId)||db.agents[0];if(a)openTest(a.id);}
 let g=e.target.closest("[data-goto]");if(g)page(g.dataset.goto);
 if(e.target.closest("[data-create]")){if(requireWorkspace())modal("createModal",true)}
 let closeButton=e.target.closest("[data-close]");if(closeButton)closeButton.closest(".backdrop")?.classList.remove("open");
 let sample=e.target.closest("[data-sample-question]");if(sample){const field=document.getElementById("chatInput");if(field)field.value=sample.dataset.sampleQuestion;const question=sample.dataset.sampleQuestion;if(field)field.value="";respond(question);return;}
 let quickTest=e.target.closest("#quickTestButton");if(quickTest){const first=db.agents[0];if(first)openTest(first.id);else toast("Create an AI executive first, then test it.");return;}
 let t=e.target.closest("[data-test]");if(t)openTest(t.dataset.test);
 let widgetToggle=e.target.closest("[data-widget-toggle]");if(widgetToggle)toggleWebsiteWidget(widgetToggle.dataset.widgetToggle);
 let widgetCopy=e.target.closest("[data-copy-widget]");if(widgetCopy)copyWebsiteWidget(widgetCopy.dataset.copyWidget);
 let r=e.target.closest("[data-remove]");if(r&&confirm("Delete this executive and its linked knowledge?"))deleteAgent(r.dataset.remove);
 let k=e.target.closest("[data-kremove]");if(k)deleteKnowledge(k.dataset.kremove);
 let source=e.target.closest("[data-source-remove]");if(source&&confirm("Remove this source and all imported knowledge sections?"))deleteKnowledgeSource(source.dataset.sourceRemove);
 let member=e.target.closest("[data-member-remove]");if(member&&confirm("Remove this person from the workspace?"))removeTeamMember(member.dataset.memberRemove);
 let refresh=e.target.closest("[data-refresh-conversations]");if(refresh){supabase.auth.getSession().then(({data})=>loadWorkspace(data.session));}

});
document.querySelectorAll(".backdrop").forEach(x=>x.addEventListener("click",e=>{if(e.target===x)x.classList.remove("open")}));
document.getElementById("onboardingStepContent").addEventListener("submit",submitOnboardingStep);
document.getElementById("agentForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!requireWorkspace())return;
 const submit=e.target.querySelector('button[type="submit"],button:not([type])');if(submit)submit.disabled=true;
 const saved=await saveAgent({name:document.getElementById("agentName").value.trim(),role:document.getElementById("role").value,greeting:document.getElementById("greeting").value,language:document.getElementById("agentLanguage").value});
 if(submit)submit.disabled=false;
 if(saved){e.target.reset();modal("createModal",false);page("agents")}
});
document.getElementById("buildSemanticIndex").addEventListener("click",async()=>{
 if(!requireWorkspace()||!["owner","admin"].includes(memberRole))return;
 const button=document.getElementById("buildSemanticIndex");
 button.disabled=true;button.textContent="Indexing…";
 const {data,error}=await supabase.functions.invoke("aikivo-embed",{body:{businessId}});
 button.disabled=false;button.textContent="Build semantic index";
 if(error||data?.error){toast(data?.error||error?.message||"Semantic indexing failed.");return}
 toast("Indexed "+data.indexed+" entries. "+(data.remaining?data.remaining+" remain without vectors.":"All current entries are indexed."));
});
document.getElementById("knowledgeSearchForm").addEventListener("submit",async e=>{
 e.preventDefault();
 if(!requireWorkspace())return;
 const executiveId=document.getElementById("knowledgeSearchExecutive").value;
 const query=document.getElementById("knowledgeSearchQuery").value.trim();
 const executive=db.agents.find(a=>a.id===executiveId);
 if(!executive||!query)return;
 const button=document.getElementById("knowledgeSearchButton");
 const status=document.getElementById("knowledgeSearchStatus");
 const results=document.getElementById("knowledgeSearchResults");
 button.disabled=true;status.textContent="Searching approved knowledge…";results.innerHTML="";
 const {data,error}=await supabase.rpc("search_aikivo_knowledge",{
  p_business_id:businessId,
  p_executive_id:executiveId,
  p_query:query,
  p_limit:8,
  p_language:executive.language||db.business.language||"English"
 });
 button.disabled=false;
 if(error){status.textContent="Search failed. Please try again.";toast(error.message);return}
 if(!data?.length){status.textContent="No matching knowledge found. Try different wording or add an approved FAQ.";results.innerHTML='<p class="empty">No matching answers found.</p>';return}
 status.textContent="Found "+data.length+" relevant knowledge "+(data.length===1?"entry.":"entries.")+" This is a retrieval preview, not an AI-generated answer.";
 results.innerHTML=data.map((item,index)=>'<article class="knowledge-result"><div class="knowledge-result-head"><b>Match '+(index+1)+'</b><small>Relevance '+(Number(item.relevance||0).toFixed(3))+'</small></div><b class="knowledge-result-question">'+safe(item.question)+'</b><p>'+safe(item.answer)+'</p></article>').join("");
});
document.getElementById("aiEvaluationForm").addEventListener("submit",async e=>{
 e.preventDefault();
 if(!requireWorkspace()||!["owner","admin"].includes(memberRole))return;
 const executiveId=document.getElementById("knowledgeSearchExecutive").value;
 const questions=document.getElementById("aiEvaluationQuestions").value.split(/\r?\n/).map(q=>q.trim()).filter(Boolean);
 const executive=db.agents.find(a=>a.id===executiveId);
 if(!executive){toast("Choose an AI executive first.");return}
 if(!questions.length){toast("Enter at least one test question.");return}
 if(questions.length>10){toast("Run up to 10 questions at a time.");return}
 const button=document.getElementById("runAiEvaluation"),status=document.getElementById("aiEvaluationStatus"),summary=document.getElementById("aiEvaluationSummary"),results=document.getElementById("aiEvaluationResults");
 button.disabled=true;button.textContent="Testing…";summary.hidden=true;results.innerHTML="";
 let supported=0,review=0,failed=0;
 for(let i=0;i<questions.length;i++){
  status.textContent="Testing question "+(i+1)+" of "+questions.length+"…";
  const {data,error}=await supabase.functions.invoke("aikivo-evaluate",{body:{businessId,executiveId,question:questions[i]}});
  if(error||!data){failed++;results.insertAdjacentHTML("beforeend",'<article class="evaluation-result failed"><div class="evaluation-result-head"><b>Test '+(i+1)+' · Error</b></div><p>'+safe(error?.message||"Evaluation failed.")+'</p></article>');continue}
  const needsReview=data.status==="review_required";if(needsReview)review++;else supported++;
  const matches=(data.matches||[]).slice(0,3).map(m=>'<div class="evaluation-match"><b>'+safe(m.question)+'</b><small>'+safe(m.method)+' · score '+Number(m.score||0).toFixed(3)+'</small></div>').join("");
  results.insertAdjacentHTML("beforeend",'<article class="evaluation-result '+(needsReview?"review":"supported")+'"><div class="evaluation-result-head"><b>Test '+(i+1)+' · '+(needsReview?"Needs human review":"Knowledge found")+'</b><small>'+Number(data.matchCount||0)+' match(es)</small></div><p class="evaluation-question">'+safe(questions[i])+'</p><p>'+safe(data.answer||"No answer returned.")+'</p>'+(data.note?'<small class="hint">'+safe(data.note)+'</small>':"")+(matches?'<div class="evaluation-matches"><b>Retrieved evidence</b>'+matches+'</div>':'<small class="hint">No approved knowledge matched this question.</small>')+'</article>');
 }
 summary.hidden=false;summary.textContent=supported+" with evidence · "+review+" need human review · "+failed+" failed";
 status.textContent="Evaluation complete. Review each answer and its retrieved evidence.";
 button.disabled=false;button.textContent="Run tests";
});
document.getElementById("knowledgeForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!requireWorkspace())return;
 const q=document.getElementById("question").value.trim(),a=document.getElementById("answer").value.trim();
 const submit=e.target.querySelector("button");submit.disabled=true;const saved=await saveKnowledge(q,a);submit.disabled=false;
 if(saved)e.target.reset()
});
document.getElementById("websiteTrainForm").addEventListener("submit",async e=>{
 e.preventDefault();const url=document.getElementById("trainWebsiteUrl").value.trim(),button=e.target.querySelector("button");button.disabled=true;button.textContent="Importing…";
 const saved=await trainKnowledge("website",{url});button.disabled=false;button.textContent="Import website";if(saved)e.target.reset();
});
document.getElementById("textTrainForm").addEventListener("submit",async e=>{
 e.preventDefault();const file=document.getElementById("knowledgeFile").files[0],button=e.target.querySelector("button");if(!file)return;
 const ext=file.name.toLowerCase().split(".").pop();
 if(!["txt","md","pdf","docx"].includes(ext)){toast("Choose a TXT, Markdown, PDF or DOCX document.");return;}
 if((["txt","md"].includes(ext)&&file.size>100000)||file.size>5*1024*1024){toast("Text files: up to 100 KB. PDF/DOCX: up to 5 MB.");return;}
 button.disabled=true;button.textContent="Importing…";
 try{
  if(["txt","md"].includes(ext)){
   const content=await file.text();const saved=await trainKnowledge("text_file",{title:file.name,fileName:file.name,content});if(saved)e.target.reset();
  }else{
   const bytes=new Uint8Array(await file.arrayBuffer());let binary="";
   for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
   const fileBase64=btoa(binary);const saved=await trainKnowledge("text_file",{title:file.name,fileName:file.name,fileBase64});if(saved)e.target.reset();
  }
 }catch(err){toast("Could not read this document.");}
 finally{button.disabled=false;button.textContent="Import document";}
});
document.getElementById("inviteForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!requireWorkspace()||!["owner","admin"].includes(memberRole))return;
 const email=document.getElementById("inviteEmail").value.trim();const role=document.getElementById("inviteRole").value;
 const submit=e.target.querySelector("button");const note=document.getElementById("inviteMessage");submit.disabled=true;note.textContent="Sending invitation…";
 const {data,error}=await supabase.functions.invoke("aikivo-invite",{body:{email,role}});
 submit.disabled=false;
 if(error||data?.error){note.textContent=data?.error||error?.message||"Invitation failed.";toast(note.textContent);return}
 note.textContent="Invitation email sent to "+email+".";toast("Team invitation sent.");e.target.reset();
 const {data:sessionData}=await supabase.auth.getSession();await loadWorkspace(sessionData.session);
});
document.getElementById("businessForm").addEventListener("submit",async e=>{
 e.preventDefault();const submit=e.target.querySelector("button");submit.disabled=true;
 await saveBusiness({name:document.getElementById("businessName").value.trim(),industry:document.getElementById("industry").value,website:document.getElementById("website").value.trim(),language:document.getElementById("language").value});
 submit.disabled=false;
});
document.getElementById("dismiss").onclick=()=>document.getElementById("notice").remove();
document.getElementById("menu").onclick=()=>document.getElementById("sidebar").classList.toggle("open");
async function openTest(id){
 active=id;activeConversationId=null;let a=db.agents.find(x=>x.id===id);if(!a)return;
 document.getElementById("testTitle").textContent="Test "+a.name;
 document.getElementById("chat").innerHTML='<div class="bubble bot">'+safe(a.greeting)+'</div>';
 document.getElementById("voiceStatus").textContent="Starting a saved conversation…";
 modal("testModal",true);
 const {data,error}=await supabase.from("conversations").insert({business_id:businessId,executive_id:a.id,channel:"test",status:"open"}).select("id,started_at").single();
 if(error){document.getElementById("voiceStatus").textContent="Could not start a saved conversation: "+error.message;toast("Conversation could not be started.");return}
 activeConversationId=data.id;
 db.chats.push({id:data.id,agent:a.name,q:"",a:"",at:data.started_at||new Date().toISOString()});render();
 document.getElementById("voiceStatus").textContent="Conversation ready · this test keeps context across messages. No phone call is placed.";
}
function bubble(s,type){let d=document.createElement("div");d.className="bubble "+type;d.textContent=s;let c=document.getElementById("chat");c.appendChild(d);c.scrollTop=c.scrollHeight}
function say(s,lang){if(!("speechSynthesis"in window))return;let u=new SpeechSynthesisUtterance(s);u.lang=({English:"en-IN",Hindi:"hi-IN",Gujarati:"gu-IN",Kannada:"kn-IN"})[lang]||"en-IN";speechSynthesis.cancel();speechSynthesis.speak(u)}
async function respond(q){
 if(!requireWorkspace())return;
 let a=db.agents.find(x=>x.id===active);if(!a)return;
 if(!activeConversationId){toast("Wait for the conversation to finish starting.");return}
 bubble(q,"human");
 const status=document.getElementById("voiceStatus");
 status.textContent="AIKIVO is preparing a reply…";
 const {data:aiResult,error:aiError}=await supabase.functions.invoke("aikivo-ai",{body:{executiveId:a.id,conversationId:activeConversationId,message:q}});
 if(aiError||!aiResult?.answer){status.textContent="AI reply failed. Please try again.";toast(aiResult?.error||aiError?.message||"AI engine unavailable.");return}
 const ans=aiResult.answer;
 if(!aiResult.providerConfigured){status.textContent="Knowledge-base backup mode · AI model provider is not configured yet."}
 else{status.textContent="AI engine connected · "+a.name}
 bubble(ans,"bot");say(ans,a.language);
 const {error:messageError}=await supabase.from("conversation_messages").insert([
  {conversation_id:activeConversationId,speaker:"customer",body:q},
  {conversation_id:activeConversationId,speaker:"assistant",body:ans}
 ]);
 if(messageError){toast("Reply shown, but messages failed to save: "+messageError.message);return}
if(aiResult.handoffRecommended||aiResult.mode==="handoff"){const existing=db.tickets.find(t=>t.conversation_id===activeConversationId&&!["resolved","closed"].includes(t.status));if(!existing){const {data:ticket,error:ticketError}=await supabase.from("support_tickets").insert({business_id:businessId,conversation_id:activeConversationId,subject:"Customer needs human follow-up",description:"Customer question: "+q+" | AI response: "+ans,priority:"normal",status:"open"}).select().single();if(ticketError){toast("Ticket creation failed: "+ticketError.message)}else{db.tickets.unshift(ticket);toast("Human handoff ticket created. Check Support inbox.")}}await supabase.from("conversations").update({status:"escalated"}).eq("id",activeConversationId);const current=db.chats.find(c=>c.id===activeConversationId);if(current)current.status="escalated";}
 const saved=db.chats.find(c=>c.id===activeConversationId);
 if(saved){saved.q+=(saved.q?"\n":"")+q;saved.a+=(saved.a?"\n":"")+ans;saved.messages=saved.messages||[];saved.messages.push({speaker:"customer",body:q,created_at:new Date().toISOString()},{speaker:"assistant",body:ans,created_at:new Date().toISOString()});render()}
}
document.addEventListener("change",async e=>{
 const launchSelect=e.target.closest("#launchExecutiveSelect");if(launchSelect){launchAgentId=launchSelect.value;renderLaunchCenter();return;}
 const convFilter=e.target.closest("#conversationFilter");if(convFilter){conversationFilter=convFilter.value;renderConversations();return}
 const convAssignee=e.target.closest("[data-conversation-assignee]");if(convAssignee){const {error}=await supabase.from("conversations").update({assigned_to:convAssignee.value||null}).eq("id",convAssignee.dataset.conversationAssignee).eq("business_id",businessId);if(error){toast("Conversation assignment failed: "+error.message);const {data}=await supabase.auth.getSession();await loadWorkspace(data.session);return}const conv=db.chats.find(c=>c.id===convAssignee.dataset.conversationAssignee);if(conv)conv.assigned_to=convAssignee.value||null;renderConversations();toast("Conversation assignment saved.");return}
 const filter=e.target.closest("#ticketFilter");if(filter){ticketFilter=filter.value;renderTickets();return}
 const role=e.target.closest("[data-member-role]");
 if(role){const {error}=await supabase.from("business_members").update({member_role:role.value}).eq("business_id",businessId).eq("user_id",role.dataset.memberRole);if(error){toast("Role update failed: "+error.message);const {data}=await supabase.auth.getSession();await loadWorkspace(data.session);return}const person=db.members.find(m=>m.user_id===role.dataset.memberRole);if(person)person.member_role=role.value;render();toast("Team role updated.");return}
 const assignee=e.target.closest("[data-ticket-assignee]");
 if(assignee){const {error}=await supabase.from("support_tickets").update({assigned_to:assignee.value||null,updated_at:new Date().toISOString()}).eq("id",assignee.dataset.ticketAssignee).eq("business_id",businessId);if(error){toast("Assignment failed: "+error.message);const {data}=await supabase.auth.getSession();await loadWorkspace(data.session);return}const ticket=db.tickets.find(t=>t.id===assignee.dataset.ticketAssignee);if(ticket)ticket.assigned_to=assignee.value||null;renderTickets();toast("Ticket assignment saved.");return}
 const status=e.target.closest("[data-ticket-status]");if(!status)return;
 const {error}=await supabase.from("support_tickets").update({status:status.value,updated_at:new Date().toISOString()}).eq("id",status.dataset.ticketStatus).eq("business_id",businessId);
 if(error){toast("Ticket update failed: "+error.message);return}
 const ticket=db.tickets.find(t=>t.id===status.dataset.ticketStatus);if(ticket)ticket.status=status.value;render();toast("Ticket updated.");
});
async function removeTeamMember(userId){const {error}=await supabase.from("business_members").delete().eq("business_id",businessId).eq("user_id",userId);if(error){toast("Could not remove member: "+error.message);return}db.members=db.members.filter(m=>m.user_id!==userId);render();toast("Team member removed.");}
document.addEventListener("submit",e=>{
 const form=e.target.closest("[data-team-reply]");if(!form)return;
 e.preventDefault();const id=form.dataset.teamReply,field=document.getElementById("reply-"+id),value=field?.value.trim(),button=form.querySelector("button");
 if(!value)return;if(button)button.disabled=true;
 sendTeamReply(id,value).then(ok=>{if(button)button.disabled=false;if(ok&&field)field.value="";});
});
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
