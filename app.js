const supabase = window.aikivoSupabase;
const emptyData = () => ({business:{name:"My Business",industry:"Other",website:"",language:"English"},agents:[],knowledge:[],chats:[],tickets:[],members:[]});
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

function safe(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function toast(s){let t=document.getElementById("toast");t.textContent=s;t.style.cssText="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#172238;color:white;padding:10px 15px;border-radius:8px;font-size:11px;z-index:50";setTimeout(()=>t.style.cssText="",2600)}
function page(p){document.querySelectorAll(".page").forEach(x=>x.classList.toggle("show",x.id==="page-"+p));document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.page===p));document.getElementById("crumb").textContent=p[0].toUpperCase()+p.slice(1);document.getElementById("sidebar").classList.remove("open")}
function modal(id,on){document.getElementById(id).classList.toggle("open",on)}
function requireWorkspace(){if(!currentUser||!businessId){toast("Please sign in to use your workspace.");return false}return true}
function render(){
 document.getElementById("sideBusiness").textContent=db.business.name;
 document.getElementById("memberRoleLabel").textContent=memberRole.toUpperCase();
 document.querySelectorAll("[data-create]").forEach(b=>b.hidden=!["owner","admin"].includes(memberRole));
 document.getElementById("knowledgeForm").hidden=!["owner","admin"].includes(memberRole);
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
 const cards=db.agents.map(a=>'<article class="agent-card"><h3>◉　'+safe(a.name)+'</h3><p>'+safe(a.role)+' · '+safe(a.language)+'</p><p>'+safe(a.greeting)+'</p><div class="agent-actions"><button class="secondary" data-test="'+a.id+'">Test voice</button><button class="secondary" data-remove="'+a.id+'">Delete</button></div></article>').join("");
 document.getElementById("agentList").innerHTML=cards||'<article class="card empty">No AI executives yet. Use Create executive to add one.</article>';
 document.getElementById("overviewAgents").innerHTML=db.agents.length?db.agents.slice(0,3).map(a=>'<p>◉　<b>'+safe(a.name)+'</b> — '+safe(a.role)+' <button class="link" data-test="'+a.id+'">Test</button></p>').join(""):"No AI executives yet. Create your first assistant.";
 document.getElementById("knowledgeList").innerHTML=db.knowledge.map(k=>'<div class="knowledge-item"><b>'+safe(k.q)+'</b><p>'+safe(k.a)+'</p><button class="delete" data-kremove="'+k.id+'">Remove</button></div>').join("")||'<p class="empty">No knowledge items added.</p>';
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
  const {data:membership,error:memberError}=await supabase.from("business_members").select("business_id,member_role,businesses(id,name,industry,website,default_language)").eq("user_id",session.user.id).limit(1).maybeSingle();
  if(memberError)throw memberError;
  if(!membership||!membership.business_id)throw new Error("Your account has no workspace membership. Please contact support.");
  const targetBusinessId=membership.business_id;
  memberRole=membership.member_role||"viewer";
  const business=Array.isArray(membership.businesses)?membership.businesses[0]:membership.businesses;
  const [agentsRes,knowledgeRes,conversationsRes,ticketsRes,membersRes]=await Promise.all([
   supabase.from("ai_executives").select("*").eq("business_id",targetBusinessId).order("created_at",{ascending:true}),
   supabase.from("knowledge_items").select("*").eq("business_id",targetBusinessId).order("created_at",{ascending:true}),
   supabase.from("conversations").select("*").eq("business_id",targetBusinessId).order("started_at",{ascending:false}),
   supabase.from("support_tickets").select("*").eq("business_id",targetBusinessId).order("created_at",{ascending:false}),
   supabase.from("business_members").select("user_id,email,display_name,member_role,created_at").eq("business_id",targetBusinessId).order("created_at",{ascending:true})
  ]);
  if(agentsRes.error)throw agentsRes.error;
  if(knowledgeRes.error)throw knowledgeRes.error;
  if(conversationsRes.error)throw conversationsRes.error;
  if(ticketsRes.error)throw ticketsRes.error;
  if(membersRes.error)throw membersRes.error;
  const conversations=conversationsRes.data||[];
  let messages=[];
  if(conversations.length){
   const {data,error}=await supabase.from("conversation_messages").select("*").in("conversation_id",conversations.map(c=>c.id)).order("created_at",{ascending:true});
   if(error)throw error;
   messages=data||[];
  }
  if(token!==workspaceLoadToken)return;
  businessId=targetBusinessId;
  db.business={name:business?.name||"My Business",industry:business?.industry||"Other",website:business?.website||"",language:business?.default_language||"English"};
  db.agents=(agentsRes.data||[]).map(a=>({id:a.id,name:a.name,role:a.role,greeting:a.greeting,language:a.language}));
  db.knowledge=(knowledgeRes.data||[]).map(k=>({id:k.id,q:k.question,a:k.answer}));
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
 let member=e.target.closest("[data-member-remove]");if(member&&confirm("Remove this person from the workspace?"))removeTeamMember(member.dataset.memberRemove);
 let refresh=e.target.closest("[data-refresh-conversations]");if(refresh){supabase.auth.getSession().then(({data})=>loadWorkspace(data.session));}

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
if(aiResult.handoffRecommended||aiResult.mode==="handoff"){const {data:ticket,error:ticketError}=await supabase.from("support_tickets").insert({business_id:businessId,conversation_id:activeConversationId,subject:"Customer needs human follow-up",description:"Customer question: "+q+" | AI response: "+ans,priority:"normal",status:"open"}).select().single();if(ticketError){toast("Ticket creation failed: "+ticketError.message)}else{db.tickets.unshift(ticket);await supabase.from("conversations").update({status:"escalated"}).eq("id",activeConversationId);toast("Human handoff ticket created. Check Support inbox.")}}
 const saved=db.chats.find(c=>c.id===activeConversationId);
 if(saved){saved.q+=(saved.q?"\n":"")+q;saved.a+=(saved.a?"\n":"")+ans;saved.messages=saved.messages||[];saved.messages.push({speaker:"customer",body:q,created_at:new Date().toISOString()},{speaker:"assistant",body:ans,created_at:new Date().toISOString()});render()}
}
document.addEventListener("change",async e=>{
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
