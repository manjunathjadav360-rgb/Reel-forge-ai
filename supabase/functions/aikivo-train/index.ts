import { createClient } from "npm:@supabase/supabase-js@2";
import { unzipSync } from "npm:fflate@0.8.2";
import { getDocument } from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function publicIPv4(ip:string){const p=ip.split(".").map(Number);if(p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255))return false;const[a,b]=p;return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19||b===51))||(a===203&&b===0));}
async function assertPublicHost(host:string){
 if(!host||host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||host.endsWith(".test"))throw new Error("Use a public website address.");
 if(host.startsWith("[")||/^\d{1,3}(\.\d{1,3}){3}$/.test(host))throw new Error("IP-address URLs are not accepted. Use the public domain name.");
 const records=await Promise.allSettled([Deno.resolveDns(host,"A"),Deno.resolveDns(host,"AAAA")]);const ips=records.flatMap(r=>r.status==="fulfilled"?r.value:[]);
 if(!ips.length)throw new Error("The website domain could not be resolved.");
 for(const ip of ips){if(ip.includes(":")){const v6=ip.toLowerCase();if((!v6.startsWith("2")&&!v6.startsWith("3"))||v6.startsWith("2001:db8:"))throw new Error("This website host is not publicly routable.");}else if(!publicIPv4(ip))throw new Error("This website host is not publicly routable.");}
}
function decodeEntities(s:string){return s.replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(65535,Number(n))));}
function htmlToText(html:string){return decodeEntities(html.replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi," ").replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article)>/gi,"\n").replace(/<[^>]+>/g," ")).replace(/[ \t]+/g," ").replace(/\n\s*/g,"\n").replace(/\n{3,}/g,"\n\n").trim();}
function pageLinks(html:string,base:string,host:string){
 const out:string[]=[];const re=/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>/gi;let m;
 while((m=re.exec(html))&&out.length<24){try{const u=new URL(decodeEntities(m[1]),base);if(u.protocol!=="https:"||u.hostname!==host||u.port&&u.port!=="443"||u.username||u.password)continue;u.hash="";u.search="";if(/\.(?:pdf|docx?|xlsx?|png|jpe?g|gif|svg|webp|zip|mp[34]|css|js|xml|json|ico|woff2?)(?:$)/i.test(u.pathname))continue;if(!out.includes(u.toString()))out.push(u.toString());}catch{}}
 return out;
}
function chunks(text:string){const parts:string[]=[];let rest=text;while(rest.length&&parts.length<30){let cut=Math.min(2200,rest.length);if(cut<rest.length){const boundary=rest.lastIndexOf(" ",cut);if(boundary>1200)cut=boundary;}parts.push(rest.slice(0,cut).trim());rest=rest.slice(cut).trim();}return parts.filter(Boolean);}
async function fetchPage(url:string,host:string){
 await assertPublicHost(host);
 const response=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(10000),headers:{"User-Agent":"AIKIVO-KnowledgeImporter/1.0","Accept":"text/html, text/plain"}});
 if(!response.ok)throw new Error("Page returned HTTP "+response.status);
 const type=response.headers.get("content-type")??"";if(!type.includes("text/html")&&!type.includes("text/plain"))return null;
 const length=Number(response.headers.get("content-length")??0);if(length>500000)throw new Error("A page is too large to import.");
 const raw=await response.text();if(raw.length>500000)throw new Error("A page is too large to import.");
 return {raw,type};
}
async function extractPdf(bytes:Uint8Array){
 const task=getDocument({data:bytes,useWorkerFetch:false,isEvalSupported:false,disableFontFace:true,useSystemFonts:false,verbosity:0});
 const pdf=await task.promise;let text="";
 for(let i=1;i<=Math.min(pdf.numPages,100);i++){const page=await pdf.getPage(i);const content=await page.getTextContent();text+=content.items.map((item:any)=>"str" in item?item.str:"").join(" ")+"\n";if(text.length>100000)break;}
 await pdf.destroy();return text;
}
function extractDocx(bytes:Uint8Array){
 const files=unzipSync(bytes);const file=files["word/document.xml"];if(!file)throw new Error("This DOCX file has no readable document body.");
 const xml=new TextDecoder().decode(file);const text=xml.replace(/<\/w:p>/g,"\n").replace(/<w:tab\b[^>]*\/>/g,"\t").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'");
 return text.replace(/[ \t]+/g," ").replace(/\n\s*/g,"\n").trim();
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"Method not allowed."},405);
 try{
  const auth=req.headers.get("Authorization");if(!auth?.startsWith("Bearer "))return json({error:"Sign in first."},401);
  const url=Deno.env.get("SUPABASE_URL")??"",key=Deno.env.get("SUPABASE_PUBLISHABLE_KEY")??Deno.env.get("SUPABASE_ANON_KEY")??"";if(!url||!key)return json({error:"Server configuration is incomplete."},500);
  const client=createClient(url,key,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await client.auth.getUser(auth.slice(7));if(userError||!userData.user)return json({error:"Your session expired. Sign in again."},401);
  const body=await req.json(),businessId=String(body.businessId??""),sourceType=String(body.sourceType??"");if(!uuid(businessId)||!["website","text_file"].includes(sourceType))return json({error:"Invalid import request."},400);
  const {data:membership}=await client.from("business_members").select("member_role").eq("business_id",businessId).eq("user_id",userData.user.id).maybeSingle();if(!membership||!["owner","admin"].includes(membership.member_role))return json({error:"Only workspace owners and admins can train the assistant."},403);
  let title="",sourceUrl:string|null=null,fileName:string|null=null,allText="",pages=0;
  if(sourceType==="website"){
   const start=new URL(String(body.url??""));if(start.protocol!=="https:"||start.username||start.password||(start.port&&start.port!=="443"))return json({error:"Enter a valid HTTPS page URL on the standard secure port."},400);
   const host=start.hostname;await assertPublicHost(host);start.hash="";start.search="";
   const queue=[start.toString()],seen=new Set<string>();let discovered:string[]=[];
   while(queue.length&&seen.size<8&&allText.length<100000){
    const current=queue.shift()!;if(seen.has(current))continue;seen.add(current);
    const result=await fetchPage(current,host);if(!result)continue;
    const pageText=result.type.includes("text/html")?htmlToText(result.raw):result.raw.replace(/\s+/g," ").trim();
    if(pageText.length>30){allText+="\n\n[Page: "+current+"]\n"+pageText;pages++;}
    if(current===start.toString()&&result.type.includes("text/html"))discovered=pageLinks(result.raw,current,host);
    if(current===start.toString())for(const link of discovered){if(queue.length+seen.size<8)queue.push(link);}
   }
   sourceUrl=start.toString();title=String(body.title??host).slice(0,180);
  }else{
   fileName=String(body.fileName??"").slice(0,180);title=String(body.title??fileName??"Document").slice(0,180);
   const ext=fileName.toLowerCase().split(".").pop();const base64=String(body.fileBase64??"");
   if(!["txt","md","pdf","docx"].includes(ext??"")||base64.length>7000000)return json({error:"Upload a TXT, Markdown, PDF or DOCX file up to 5 MB."},400);
   if(ext==="txt"||ext==="md")allText=String(body.content??"").trim();
   else{
    if(!base64||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))return json({error:"The document upload was not valid."},400);
    const binary=atob(base64);const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    if(bytes.length>5*1024*1024)return json({error:"Documents must be 5 MB or smaller."},413);
    if(ext==="pdf"){if(bytes[0]!==0x25||bytes[1]!==0x50||bytes[2]!==0x44||bytes[3]!==0x46)return json({error:"That file is not a valid PDF."},415);allText=await extractPdf(bytes);}
    else{if(bytes[0]!==0x50||bytes[1]!==0x4b)return json({error:"That file is not a valid DOCX document."},415);allText=extractDocx(bytes);}
   }
   if((ext==="txt"||ext==="md")&&allText.length>100000)return json({error:"Text files must be under 100 KB."},413);
   pages=1;
  }
  allText=allText.replace(/\u0000/g,"").slice(0,100000).trim();if(allText.length<40)return json({error:"Not enough readable text was found. Scanned PDFs without selectable text may not import."},422);
  const parts=chunks(allText);if(!parts.length)return json({error:"No readable content was found."},422);
  const {data:source,error:sourceError}=await client.from("knowledge_sources").insert({business_id:businessId,source_type:sourceType,title,source_url:sourceUrl,file_name:fileName,status:"ready",item_count:parts.length,created_by:userData.user.id}).select("id").single();
  if(sourceError||!source)return json({error:"Could not save this knowledge source: "+(sourceError?.message??"unknown error")},500);
  const rows=parts.map((part,i)=>({business_id:businessId,source_id:source.id,question:(sourceType==="website"?"Website content":"Document")+": "+title+" · section "+(i+1),answer:part}));
  const {error:insertError}=await client.from("knowledge_items").insert(rows);if(insertError){await client.from("knowledge_sources").delete().eq("id",source.id);return json({error:"The source was read, but its knowledge could not be saved: "+insertError.message},500);}
  return json({sourceId:source.id,itemCount:parts.length,pageCount:pages,title});
 }catch(error){console.error("aikivo-train error",error);const message=error instanceof Error?error.message:"Import failed.";return json({error:message.includes("public website")||message.includes("publicly routable")||message.includes("domain")||message.includes("publicly")?message:"Could not import this source. Check the URL or document and try again."},422);}
});