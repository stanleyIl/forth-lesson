import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

import type { KnowledgeEntryRecord, MaterialRecord } from "../db/repositories.js";

const styles = `
  :root { color-scheme: light; --bg:#f6f2f0; --card:#fff; --text:#241f1d; --muted:#6f6661; --line:#e5d9d5; --brand:#94070a; --brand2:#ba2528; }
  :root[data-theme="dark"] { color-scheme: dark; --bg:#171313; --card:#241d1d; --text:#f7eeee; --muted:#c5b8b4; --line:#493a38; --brand:#d94a4d; --brand2:#f06b6e; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:Inter,ui-sans-serif,system-ui,sans-serif; }
  a { color:var(--brand); }
  header { background:linear-gradient(135deg,#6f0003,var(--brand)); color:#fff; padding:24px 40px; }
  header h1 { margin:0 0 6px; font-size:28px; }
  header p { margin:0; opacity:.88; }
  main { max-width:1120px; margin:28px auto; padding:0 22px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:22px; box-shadow:0 10px 28px rgba(70,15,15,.08); margin-bottom:20px; }
  .login { max-width:460px; margin:80px auto; }
  label { display:block; font-weight:650; margin:14px 0 6px; }
  input,button { padding:11px 12px; border-radius:8px; font:inherit; }
  input { width:100%; border:1px solid var(--line); background:var(--card); color:var(--text); }
  button,.button { border:0; background:var(--brand); color:#fff; font-weight:700; cursor:pointer; text-decoration:none; display:inline-block; }
  button:hover,.button:hover { background:var(--brand2); }
  button.secondary,.button.secondary { background:transparent; color:var(--text); border:1px solid var(--line); }
  .toolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
  .actions { display:flex; gap:8px; flex-wrap:wrap; }
  .actions button,.actions .button { width:auto; margin:0; }
  .badge { padding:5px 9px; border-radius:999px; background:#f7dddd; color:#7d0306; font-weight:700; }
  .muted { color:var(--muted); }
  .error { color:#b42318; min-height:22px; margin-top:10px; }
  .success { color:#157347; min-height:22px; margin-top:10px; }
  code,pre { background:rgba(127,100,95,.12); border-radius:6px; }
  code { padding:2px 5px; }
  pre { padding:14px; overflow:auto; white-space:pre-wrap; }
  .materials { display:grid; gap:12px; margin-top:14px; }
  .materials.grid { grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); }
  .material { border:1px solid var(--line); border-radius:12px; padding:15px; background:var(--card); }
  .materials.list .material { display:grid; grid-template-columns:minmax(180px,2fr) 90px 100px 1fr; align-items:center; gap:10px; }
  .material h3 { margin:0 0 8px; overflow-wrap:anywhere; }
  .material .actions { margin-top:10px; }
  progress { width:100%; margin-top:10px; }
  #toast { position:fixed; right:20px; bottom:20px; max-width:360px; background:#24201f; color:white; padding:12px 16px; border-radius:10px; display:none; z-index:20; }
  dialog { border:1px solid var(--line); border-radius:14px; background:var(--card); color:var(--text); width:min(520px,90vw); }
  dialog button { width:100%; margin:5px 0; text-align:left; }
  .markdown img { max-width:100%; }
  .markdown table { border-collapse:collapse; width:100%; }
  .markdown th,.markdown td { border:1px solid var(--line); padding:8px; }
  @media (max-width:720px) { header { padding:20px; } main { padding:0 12px; } .materials.list .material { display:block; } }
`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function loginPage(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CampusClaw 登录</title><style>${styles}</style></head>
<body><main class="login"><section class="card"><h1>CampusClaw</h1><p class="muted">班级教学材料与可追溯知识库</p>
<form id="login-form"><label for="account">账号</label><input id="account" autocomplete="username" required><label for="password">密码</label><input id="password" type="password" autocomplete="current-password" required><button type="submit" style="width:100%;margin-top:18px">登录</button><div id="message" class="error" role="alert"></div></form></section></main>
<script>document.getElementById('login-form').addEventListener('submit',async(e)=>{e.preventDefault();const m=document.getElementById('message');m.textContent='';const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountIdentifier:document.getElementById('account').value,password:document.getElementById('password').value})});if(!r.ok){m.textContent='账号或密码错误';return;}location.href='/app/materials';});</script></body></html>`;
}

export function materialsPage(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CampusClaw 本班材料</title><style>${styles}</style></head>
<body><header><h1>CampusClaw 教学材料</h1><p>服务端会话识别身份并强制班级隔离</p></header><main>
<section class="card toolbar"><div><strong id="identity">正在识别当前用户…</strong><div class="muted">身份来自服务端 session，不采用请求中的 user_id、role 或 class_id。</div></div><div class="actions"><span class="badge">已登录</span><button class="secondary" id="theme">切换主题</button><button class="secondary" id="commands">⌘/Ctrl+K</button><button id="logout">退出</button></div></section>
<section class="card" id="upload-card" hidden><h2>上传教学材料</h2><p class="muted">仅支持非空 UTF-8 <code>.txt</code> 和 <code>.md</code> 文件。</p><form id="upload-form"><input id="material-file" type="file" accept=".txt,.md" required><button type="submit">上传并写入知识库</button><progress id="upload-progress" max="100" value="0" hidden></progress><div id="upload-message"></div></form></section>
<section class="card"><h2>本班知识库检索</h2><form id="search-form" class="toolbar"><input id="search-query" placeholder="输入要检索的知识" required><button type="submit">检索</button></form><div id="search-message" class="muted"></div><div id="search-results"></div></section>
<section class="card"><div class="toolbar"><div><h2>本班材料</h2><input id="material-filter" placeholder="按文件名或类型筛选"></div><div class="actions"><button class="secondary" id="list-view">列表</button><button class="secondary" id="grid-view">网格</button><button id="refresh">刷新</button></div></div><div id="materials" class="materials list"><p class="muted">正在加载…</p></div></section>
</main><div id="toast" role="status"></div><dialog id="palette"><h2>命令面板</h2><div id="palette-actions"></div><button class="secondary" id="close-palette">关闭</button></dialog>
<script>
let currentUser=null;let allMaterials=[];let view=localStorage.getItem('campusclaw_view')||'list';
const esc=(v)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){const el=document.getElementById('toast');el.textContent=message;el.style.display='block';clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.style.display='none',3200);}
function handleFailure(response,result){if(response.status===401){location.href='/login';return;}const messages={400:'请求内容无效',403:'没有执行该操作的权限',404:'材料不存在或无权访问',413:'文件超过大小限制',415:'仅支持 .txt 和 .md 文件'};toast(messages[response.status]||result?.error||'操作失败');}
function applyTheme(theme){document.documentElement.dataset.theme=theme;localStorage.setItem('campusclaw_theme',theme);}
applyTheme(localStorage.getItem('campusclaw_theme')||'light');
async function loadIdentity(){const response=await fetch('/api/me');if(response.status===401){location.href='/login';return;}const {user}=await response.json();currentUser=user;document.getElementById('identity').textContent='用户：'+user.userId+' ｜ 角色：'+user.role+' ｜ 班级：'+user.classId;document.getElementById('upload-card').hidden=user.role!=='teacher';renderCommands();}
function renderMaterials(){const term=document.getElementById('material-filter').value.trim().toLowerCase();const items=allMaterials.filter(m=>m.original_filename.toLowerCase().includes(term)||m.file_type.includes(term));const root=document.getElementById('materials');root.className='materials '+view;root.innerHTML=items.length?items.map(m=>'<article class="material"><div><h3>'+esc(m.original_filename)+'</h3><span class="muted">.'+esc(m.file_type)+' · '+m.size_bytes+' bytes</span></div><div>'+esc(m.class_id)+'</div><div><code>'+esc(m.id)+'</code></div><div class="actions"><a class="button secondary" href="/app/materials/'+encodeURIComponent(m.id)+'">查看</a><a class="button" href="/api/materials/'+encodeURIComponent(m.id)+'/file">下载</a></div></article>').join(''):'<p class="muted">本班暂无匹配材料</p>';}
async function loadMaterials(){const response=await fetch('/api/materials');if(!response.ok){handleFailure(response,await response.json().catch(()=>({})));return;}allMaterials=(await response.json()).materials;renderMaterials();}
async function logout(){await fetch('/api/logout',{method:'POST'});location.href='/login';}
function setView(next){view=next;localStorage.setItem('campusclaw_view',next);renderMaterials();}
function renderCommands(){const actions=[['刷新材料',loadMaterials],['聚焦检索',()=>document.getElementById('search-query').focus()],['切换主题',()=>document.getElementById('theme').click()],['切换视图',()=>setView(view==='list'?'grid':'list')],['退出登录',logout]];if(currentUser?.role==='teacher')actions.splice(2,0,['选择上传文件',()=>document.getElementById('material-file').click()]);const root=document.getElementById('palette-actions');root.innerHTML='';actions.forEach(([label,fn])=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>{document.getElementById('palette').close();fn();};root.appendChild(b);});}
function openPalette(){document.getElementById('palette').showModal();}
document.getElementById('refresh').onclick=loadMaterials;document.getElementById('logout').onclick=logout;document.getElementById('theme').onclick=()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');document.getElementById('commands').onclick=openPalette;document.getElementById('close-palette').onclick=()=>document.getElementById('palette').close();document.getElementById('list-view').onclick=()=>setView('list');document.getElementById('grid-view').onclick=()=>setView('grid');document.getElementById('material-filter').oninput=renderMaterials;
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openPalette();}});
document.getElementById('search-form').addEventListener('submit',async(event)=>{event.preventDefault();const response=await fetch('/api/knowledge-search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:document.getElementById('search-query').value})});const result=await response.json().catch(()=>({}));if(!response.ok){handleFailure(response,result);return;}document.getElementById('search-message').textContent='检索模式：'+result.retrievalMode;document.getElementById('search-results').innerHTML=result.results.length?result.results.map(item=>'<article class="material"><strong><a href="/app/materials/'+encodeURIComponent(item.source.materialId)+'">'+esc(item.source.originalFilename)+'</a></strong> · 序号 '+item.source.sequenceNumber+'<p>'+esc(item.excerpt)+'</p><small>entry='+esc(item.source.knowledgeEntryId)+' · rank='+item.rank+' · combined='+item.scores.combined+'</small></article>').join(''):'<p class="muted">没有找到本班匹配内容。</p>';});
document.getElementById('upload-form').addEventListener('submit',event=>{event.preventDefault();const file=document.getElementById('material-file').files[0];if(!file)return;const data=new FormData();data.append('file',file);const xhr=new XMLHttpRequest();const progress=document.getElementById('upload-progress');progress.hidden=false;progress.value=0;xhr.upload.onprogress=e=>{if(e.lengthComputable)progress.value=Math.round(e.loaded/e.total*100);};xhr.onload=async()=>{progress.hidden=true;let result={};try{result=JSON.parse(xhr.responseText);}catch{}if(xhr.status>=200&&xhr.status<300){toast('上传成功，材料已写入知识库');await loadMaterials();}else handleFailure({status:xhr.status},result);};xhr.onerror=()=>{progress.hidden=true;toast('上传网络失败');};xhr.open('POST','/api/materials');xhr.send(data);});
loadIdentity();loadMaterials();
</script></body></html>`;
}

export function materialDetailPage(material: MaterialRecord, entries: KnowledgeEntryRecord[]): string {
  const source = entries.map((entry) => entry.content).join("\n\n");
  const rendered = material.file_type === "md"
    ? sanitizeHtml(String(marked.parse(source, { gfm: true })), {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2"]),
        allowedAttributes: { a: ["href", "title"], img: ["src", "alt", "title"] },
        allowedSchemes: ["http", "https", "mailto"],
      })
    : `<pre>${escapeHtml(source)}</pre>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(material.original_filename)}</title><style>${styles}</style></head><body><header><h1>${escapeHtml(material.original_filename)}</h1><p>本班材料详情 · 来源可追溯</p></header><main><section class="card toolbar"><a href="/app/materials">← 返回材料页</a><a class="button" href="/api/materials/${encodeURIComponent(material.id)}/file">下载原文件</a></section><article class="card markdown">${rendered}</article><section class="card"><strong>材料 ID：</strong><code>${escapeHtml(material.id)}</code><br><strong>班级：</strong>${escapeHtml(material.class_id)}<br><strong>知识条目：</strong>${entries.map((entry) => `<code>${escapeHtml(entry.id)}</code>`).join(" ")}</section></main></body></html>`;
}
