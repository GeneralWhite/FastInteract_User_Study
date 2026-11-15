'use strict';
const $=id=>document.getElementById(id);
const criteria=[['interaction','交互合理性','接触、抓握和使用动作自然，符合物理关系，无多指、抓握不稳或抓握错位等现象。'],['object','商品一致性','外观与参考图一致，并在视频中保持稳定。'],['human_background','人物及背景一致性','人物身份与参考图一致，人物和背景稳定。']];
const labels='ABCDEFGHI';
const allTest=new URLSearchParams(location.hash.slice(1)).get('all')==='1';
let data,session,tokenHash,storageKey,local={},saved={},index=0,demo=false,busy=false,saveQueue=Promise.resolve(),timer;
function setBusy(value){busy=value;$('study').inert=value;}
function showError(e){$('error').textContent=e.message||String(e);$('error').hidden=false;}
function clearError(){$('error').hidden=true;}
function shuffled(items){const a=[...items];for(let i=a.length-1;i>0;i--){const n=new Uint32Array(1);crypto.getRandomValues(n);const range=4294967296-(4294967296%(i+1));if(n[0]>=range){i++;continue;}const j=n[0]%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function blank(task=session.tasks[index]){return Object.fromEntries(criteria.map(([k])=>[k,Array(task.order.length).fill('')]));}
function valid(r,task){return !!r&&criteria.every(([k])=>Array.isArray(r[k])&&r[k].length===task.order.length&&new Set(r[k]).size===task.order.length&&r[k].every(v=>task.order.includes(v)));}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(local));}catch(e){showError(new Error('浏览器无法保存本地备份，请勿关闭页面。'+e.message));}}
async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function rpc(name,body){const config=window.STUDY_CONFIG;const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);try{const response=await fetch(config.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});let result;try{result=await response.json();}catch{throw new Error('后端返回无效响应，请稍后重试。');}if(!response.ok)throw new Error(result.message||'保存失败，请检查网络后重试。');return result;}finally{clearTimeout(timeout);}}
function completeCount(){return session.tasks.filter(t=>valid(local[t.case_id],t)).length;}
function updateProgress(){const count=completeCount();$('progress-text').textContent=`已填写 ${count} / ${session.tasks.length}`;$('progress').max=session.tasks.length;$('progress').value=count;$('finish').disabled=count!==session.tasks.length||busy;document.querySelectorAll('#steps button').forEach((b,i)=>b.classList.toggle('complete',valid(local[session.tasks[i].case_id],session.tasks[i])));}
function exportAnswers(){const payload={study:session.study||data.version,cohort:session.cohort||'methods'+session.tasks[0].order.length,participant:session.participant,mode:demo?'demo':'formal',tasks:session.tasks,answers:local,submitted_at:session.submitted_at||null,exported_at:new Date().toISOString()};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`video-study-${session.participant}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function queueSave(cid){const task=session.tasks.find(t=>t.case_id===cid);if(!valid(local[cid],task))return Promise.resolve();const snapshot=JSON.stringify(local[cid]);if(saved[cid]===snapshot)return Promise.resolve();const operation=saveQueue.catch(()=>{}).then(async()=>{if(demo){saved[cid]=snapshot;return;}await rpc('study_save',{p_token_hash:tokenHash,p_case_id:cid,p_ranks:JSON.parse(snapshot)});saved[cid]=snapshot;});saveQueue=operation;return operation;}
function status(){const cid=session.tasks[index].case_id;const r=local[cid];$('save-status').textContent=demo?'演示模式 · 仅保存在当前浏览器':saved[cid]===JSON.stringify(r)?'已保存到服务器 ✓':'本地草稿 · 完成三个指标后自动保存';}
function changed(){const cid=session.tasks[index].case_id;persist();updateProgress();status();clearTimeout(timer);if(valid(local[cid],session.tasks[index])){timer=setTimeout(()=>{if(session.tasks[index].case_id===cid)$('save-status').textContent=demo?'正在保存演示草稿…':'正在保存…';queueSave(cid).then(()=>{if(session.tasks[index].case_id===cid)status();}).catch(e=>{showError(e);if(session.tasks[index].case_id===cid)$('save-status').textContent='保存失败 · 草稿仍在本地，请重试';});},400);}}
function renderRankings(){const task=session.tasks[index];const r=local[task.case_id]||(local[task.case_id]=blank());$('rankings').replaceChildren();for(const [key,title,desc] of criteria){const panel=document.createElement('section');panel.className='rank-panel panel';const h=document.createElement('h3');h.textContent=title;panel.append(h);const p=document.createElement('p');p.textContent=desc;panel.append(p);for(let rank=0;rank<task.order.length;rank++){const row=document.createElement('label');row.className='rank-row';const text=document.createElement('span');text.textContent=`第 ${rank+1} 名`;const select=document.createElement('select');select.setAttribute('aria-label',title+'第'+(rank+1)+'名');select.dataset.criterion=key;select.dataset.rank=rank;const placeholder=new Option('选择视频…','');select.add(placeholder);task.order.forEach((cid,i)=>{const option=new Option('视频 '+labels[i],cid);option.disabled=r[key].includes(cid)&&r[key][rank]!==cid;select.add(option);});select.value=r[key][rank];select.onchange=()=>{r[key][rank]=select.value;changed();renderRankings();};row.append(text,select);panel.append(row);}const help=document.createElement('div');help.className='rank-help';help.textContent='选为下一名（从最好开始）：';panel.append(help);const quick=document.createElement('div');quick.className='quick-picks';task.order.forEach((cid,i)=>{const b=document.createElement('button');b.textContent=labels[i];b.disabled=r[key].includes(cid);if(b.disabled)b.className='used';b.onclick=()=>{const pos=r[key].indexOf('');if(pos>=0){r[key][pos]=cid;changed();renderRankings();}};quick.append(b);});const reset=document.createElement('button');reset.textContent='重排';reset.onclick=()=>{r[key]=Array(task.order.length).fill('');changed();renderRankings();};quick.append(reset);panel.append(quick);$('rankings').append(panel);}}
let mediaController=null,mediaUrls=[],mediaGeneration=0;
function releaseMedia(){
 mediaGeneration++;
 if(mediaController)mediaController.abort();
 mediaController=null;
 for(const url of mediaUrls)URL.revokeObjectURL(url);
 mediaUrls=[];
 $('preload-all').disabled=false;
 $('preload-all').textContent='预加载本例全部视频';
 $('play-all').disabled=false;
 $('media-status').textContent='可先预加载本例全部视频，再同步循环播放。';
}
async function preloadVideos(){
 if(mediaController)return;
 const videos=[...document.querySelectorAll('video')];
 const generation=mediaGeneration;
 const controller=new AbortController();mediaController=controller;
 pauseVideos();clearError();
 $('preload-all').disabled=true;$('play-all').disabled=true;
 let loaded=videos.filter(v=>v.dataset.loaded==='true').length;
 const pending=videos.filter(v=>v.dataset.loaded!=='true');
 const progress=()=>{$('preload-all').textContent=`正在加载 ${loaded} / ${videos.length}`;$('media-status').textContent=`已完整下载 ${loaded} / ${videos.length} 段视频，请稍候…`;};
 progress();
 try{
  // Two downloads at a time avoid competing with eight streaming requests.
  await Promise.all([0,1].map(async()=>{
   while(pending.length){
    const video=pending.shift();
    const response=await fetch(video.dataset.source,{signal:controller.signal});
    if(!response.ok)throw new Error('视频下载失败，请点击预加载重试。');
    const blob=await response.blob();
    if(controller.signal.aborted||generation!==mediaGeneration)return;
    const url=URL.createObjectURL(blob);mediaUrls.push(url);
    video.src=url;video.dataset.loaded='true';video.preload='auto';video.load();
    loaded++;progress();
   }
  }));
  if(controller.signal.aborted||generation!==mediaGeneration)return;
  $('preload-all').textContent='全部视频已加载 ✓';
  $('media-status').textContent='本例全部视频已完整下载，可同步循环播放。';
 }catch(e){
  controller.abort();
  if(generation!==mediaGeneration)return;
  $('preload-all').textContent='重试预加载全部视频';$('preload-all').disabled=false;
  $('media-status').textContent=`已加载 ${loaded} / ${videos.length} 段，加载失败，可重试。`;
  showError(e);
 }finally{
  if(generation===mediaGeneration){mediaController=null;$('play-all').disabled=false;}
 }
}
function playAllVideos(){
 clearError();
 document.querySelectorAll('video').forEach(v=>{v.loop=true;v.currentTime=0;v.play().catch(showError);});
}
function pauseVideos(){document.querySelectorAll('video').forEach(v=>v.pause());}
function render(){pauseVideos();releaseMedia();clearError();const task=session.tasks[index];const c=data.cases.find(c=>c.id===task.case_id);$('case-title').textContent=`案例 ${String(index+1).padStart(2,'0')} / ${session.tasks.length}`;$('participant').textContent=(demo?'DEMO · ':'参与者 · ')+session.participant;$('human-ref').src=c.human;$('object-ref').src=c.object;document.querySelector('.comparison-grid').classList.toggle('nine-methods',task.order.length===9);$('videos').replaceChildren();task.order.forEach((cid,i)=>{const candidate=c.candidates.find(v=>v.id===cid);const card=document.createElement('article');card.className='video-card';const top=document.createElement('div');top.className='video-label';const label=document.createElement('b');label.textContent='视频 '+labels[i];const watched=document.createElement('span');watched.className='watched';watched.textContent='循环播放';top.append(label,watched);const video=document.createElement('video');video.src=candidate.src;video.dataset.source=candidate.src;video.loop=true;video.controls=true;video.muted=true;video.playsInline=true;video.preload='none';video.setAttribute('aria-label','视频 '+labels[i]);let lastTime=0;video.ontimeupdate=()=>{if(video.currentTime<lastTime||video.duration-video.currentTime<0.25)watched.textContent='已观看 · 循环播放';lastTime=video.currentTime;};video.onerror=()=>{watched.textContent='加载失败，请刷新重试';};card.append(top,video);$('videos').append(card);});$('steps').replaceChildren();session.tasks.forEach((t,i)=>{const b=document.createElement('button');b.textContent=i+1;b.className=i===index?'active':'';b.onclick=()=>{if(busy)return;index=i;render();};$('steps').append(b);});$('prev').disabled=index===0||busy;$('next').textContent=index===session.tasks.length-1?'保存本例 ✓':'保存并继续 →';renderRankings();updateProgress();status();}
async function next(){if(busy)return;const task=session.tasks[index];if(!valid(local[task.case_id],task)){showError(new Error('请完成本例三个指标的全部排名，每个候选各出现一次。'));return;}setBusy(true);$('next').disabled=true;try{clearTimeout(timer);await queueSave(task.case_id);if(index<session.tasks.length-1)index++;render();}catch(e){showError(e);}finally{setBusy(false);$('next').disabled=false;$('prev').disabled=index===0;updateProgress();status();}}
function done(){pauseVideos();releaseMedia();$('welcome').hidden=true;$('study').hidden=true;$('done').hidden=false;$('done-text').textContent=demo?'演示任务已完成。答案只存在当前浏览器，尚未上传正式研究数据库。':`你的全部排名已保存，提交编号：${session.participant}。`;}
async function finish(){if(busy)return;if(completeCount()!==session.tasks.length){showError(new Error('请完成全部案例。'));return;}if(!confirm('确认提交全部排名？提交后将无法修改。'))return;setBusy(true);updateProgress();try{clearError();clearTimeout(timer);for(const t of session.tasks)await queueSave(t.case_id);if(!demo){const result=await rpc('study_finish',{p_token_hash:tokenHash});session.submitted_at=result.submitted_at;}done();}catch(e){if(!demo){try{const latest=await rpc('study_start',{p_token_hash:tokenHash});if(latest.submitted_at){session=latest;local=latest.answers;done();return;}}catch{}}showError(e);}finally{setBusy(false);updateProgress();}}
async function init(){$('download').onclick=exportAnswers;$('done-download').onclick=exportAnswers;try{data=window.STUDY_DATA||await fetch('cases.json').then(r=>{if(!r.ok)throw new Error('无法加载案例清单');return r.json();});const token=new URLSearchParams(location.hash.slice(1)).get('token');demo=!token;const config=window.STUDY_CONFIG||{};if(!demo&&(!config.supabaseUrl||!config.supabaseKey))throw new Error('正式数据库尚未配置。请联系组织者；可移除链接中的 #token=… 进入演示。');if(demo){storageKey='video-study-demo-'+data.version+(allTest?'-all':'')+'-methods9';const stored=JSON.parse(localStorage.getItem(storageKey+'-task')||'null');session=stored||{participant:allTest?'SELF_TEST_DEMO':'DEMO',tasks:shuffled(data.cases).slice(0,allTest?data.cases.length:10).map(c=>({case_id:c.id,order:shuffled(c.candidates.map(v=>v.id))})),answers:{}};localStorage.setItem(storageKey+'-task',JSON.stringify(session));$('mode').textContent=allTest?'全量测试 · 本地草稿':'演示模式';$('setup-note').hidden=false;$('setup-note').textContent='这是演示模式，结果仅保存在本机浏览器。正式参与请使用组织者发给你的独立邀请链接。';}else{tokenHash=await hash(token);storageKey='video-study-'+tokenHash;session=await rpc('study_start',{p_token_hash:tokenHash});if(session.cohort&&session.cohort!=='methods8')storageKey+='-'+session.cohort;if(session.study!==data.version)throw new Error('邀请链接与当前研究版本不一致，请联系组织者。');$('mode').textContent=(session.is_test?'组织者测试 · ':'正式评测 · ')+session.participant;}const candidateCount=session.tasks[0].order.length;
if(!session.tasks.every(t=>[8,9].includes(t.order.length)&&t.order.length===candidateCount&&new Set(t.order).size===t.order.length&&t.order.every(id=>data.cases.find(c=>c.id===t.case_id)?.candidates.some(v=>v.id===id))))throw new Error('任务素材版本已更新，请刷新网页重试。');
document.querySelector('.lead').textContent=`${allTest||session.is_test?'组织者测试：':''}每个案例有 ${candidateCount} 段匿名视频。请根据三个独立指标，将视频从最好到最差排序。`;
$('instructions').textContent=`共 ${session.tasks.length} 个案例。每个指标单独排序，1 为最好、${candidateCount} 为最差，不允许并列。请观看所有视频；默认静音，可循环播放比较。`;
$('ranking-instructions').textContent=`每行从最好到最差选择 A–${labels[candidateCount-1]}，或使用“选为下一名”。三个指标互相独立。`;
if(session.cohort==='methods9'&&!session.is_test){$('setup-note').hidden=false;$('setup-note').textContent='本任务已更新为九视频评测，原邀请链接继续有效。请按当前九个结果重新排序；旧版未上传的草稿保留在浏览器中，不会自动计入本次评测。';}
if(allTest||session.is_test){if(demo)$('setup-note').textContent='全量测试模式：答案仅保存在当前浏览器，可随时下载 JSON 备份。';}
let drafts={};try{drafts=JSON.parse(localStorage.getItem(storageKey)||'{}');}catch{}local={...session.answers,...drafts};for(const [cid,r] of Object.entries(session.answers||{}))saved[cid]=JSON.stringify(r);if(session.submitted_at){local=session.answers;done();return;}$('consent').onchange=()=>{$('start').disabled=!$('consent').checked;};$('start').onclick=()=>{$('welcome').hidden=true;$('study').hidden=false;render();for(const task of session.tasks)queueSave(task.case_id).catch(showError);};$('next').onclick=next;$('prev').onclick=()=>{if(!busy&&index>0){index--;render();}};$('preload-all').onclick=preloadVideos;$('play-all').onclick=playAllVideos;$('pause-all').onclick=pauseVideos;$('finish').onclick=finish;$('download').onclick=exportAnswers;$('done-download').onclick=exportAnswers;window.addEventListener('beforeunload',e=>{if(!demo&&!session.submitted_at&&session.tasks.some(t=>local[t.case_id]&&saved[t.case_id]!==JSON.stringify(local[t.case_id]))){e.preventDefault();e.returnValue='';}});}catch(e){$('mode').textContent='暂不可用';showError(e);}}
init();
