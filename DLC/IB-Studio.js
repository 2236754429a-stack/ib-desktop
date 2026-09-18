/* IB-Studio 悬浮自习室 v1.1.0
   「给页面右下角的悬浮聊天框一个独立窗口」：把 #chat-panel 原样浮出成置顶小窗
   （Document Picture-in-Picture，Chrome/Edge 116+；不支持时回退独立弹窗）——切走标签页、
   最小化浏览器，小窗都还在。界面不是仿制：面板标记、全部样式、主题类都从主页面原样复制，
   消息列表/会话条/引用条每拍从主窗口原节点镜像；输入、发送、停止、附件图片/文件都接到
   主程序原函数（sendChatMessage / stopStreaming / pickImage / pickFile），与页面内完全同一管线。
   在此之上加一条共享工具条：共享一个窗口/整块屏幕给 TA 看——「看一眼」或「自动陪看」
   （画面没变化不发、TA 回复中跳过），画面帧随消息图片通道发送。
   只经 ctx 与主程序说话（sdk 2）；不碰 IndexedDB；无原生依赖。 */

(function(){
'use strict';
if(!window.IBApps)return;

var CTX=null;
var S={win:null,isPip:false,poll:null,stream:null,video:null,lastSig:'',lastMsgSig:'',autoT:null,autoMin:0,autoDiff:true,vq:'m',els:{}};
var VQ={s:{w:576,q:0.68},m:{w:768,q:0.72},h:{w:1280,q:0.82},f:{w:0,q:0.9}};/* 帧画质：默认 m＝768px，体积小、中转更容易收 */
var esc2=function(t){return String(t==null?'':t).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};

function cfgLoad(){try{var v=localStorage.getItem('ib-studio-cfg');if(v){v=JSON.parse(v);if(v){S.autoMin=v.autoMin|0;S.autoDiff=v.autoDiff!==false;S.vq=v.vq||'m'}}}catch(e){}}
function cfgSave(){try{localStorage.setItem('ib-studio-cfg',JSON.stringify({autoMin:S.autoMin,autoDiff:S.autoDiff,vq:S.vq}))}catch(e){}}
cfgLoad();

function target(){
  var fid=null;try{fid=window.activeFriendId}catch(e){}
  if(!fid){var cur=null;try{cur=CTX.chat.current()}catch(e){}if(cur)fid=cur.friendId}
  if(!fid)return null;
  var tid=null;try{tid=(window.activeThreadId!=null)?window.activeThreadId:null}catch(e){}
  return {fid:fid,tid:tid};
}
function canSee(fid){try{return CTX.chat.canSee(fid)}catch(e){return true}}
function isBusy(fid){try{return !!CTX.chat.busy(fid)}catch(e){return false}}
function toast(m){try{CTX.ui.toast(m)}catch(e){}}

/* ── 页面（自习室入口页） ── */
function buildPage(host){
  host.innerHTML='';
  var wrap=document.createElement('div');
  wrap.style.cssText='max-width:660px;margin:0 auto;padding:34px 22px;color:var(--tx,#dfe6f3);font:inherit';
  wrap.innerHTML=
    '<h2 style="margin:0 0 6px;font-size:1.5rem">自习室 · 悬浮陪伴</h2>'
    +'<p style="margin:0 0 18px;opacity:.72;line-height:1.7">把右下角那个<b>悬浮聊天框</b>原样浮出成置顶小窗——同一个界面、同一条消息管线，切走标签页、最小化浏览器都一直在。再共享一个窗口或整块屏幕，TA 就能看到你在看的 PDF、网页和代码，不用导入任何文件。</p>'
    +'<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px">'
    +'<button id="ib-stu-open" style="padding:10px 18px;border:0;border-radius:12px;background:#2f6fed;color:#fff;font:inherit;cursor:pointer">浮出聊天窗</button>'
    +'<span id="ib-stu-supp" style="opacity:.6;font-size:.85rem"></span></div>'
    +'<div style="padding:12px 14px;border:1px solid rgba(128,150,190,.25);border-radius:12px;line-height:1.8;font-size:.92rem">'
    +'<div>当前对话：<b id="ib-stu-cur">（未检测到，先在 Chat 里打开一位 TA）</b></div>'
    +'<div>画面能力：<span id="ib-stu-vision">—</span> · 屏幕共享：<span id="ib-stu-dm">—</span></div></div>'
    +'<ol style="margin:16px 0 0;padding-left:20px;opacity:.72;line-height:2;font-size:.9rem">'
    +'<li>在 Chat 里打开想陪你的 TA，回到这一页点「浮出聊天窗」。</li>'
    +'<li>小窗就是原版的悬浮聊天框：消息、输入、附件都在，直接聊。</li>'
    +'<li>小窗底部工具条点「共享屏幕/窗口」，选一个窗口或整块屏幕。</li>'
    +'<li>「让 TA 看一眼」：抓当前画面发给 TA（输入框里有字就当一句话）。「自动陪看」：画面没变化不打扰。</li>'
    +'<li>结束就点「停止共享」，小窗随手关掉即可。</li></ol>';
  host.appendChild(wrap);
  var b=wrap.querySelector('#ib-stu-open');if(b)b.addEventListener('click',function(){openFloat()});
  paintPage(wrap);
  setInterval(function(){if(document.getElementById('ib-stu-open'))paintPage(wrap)},3000);
}
function paintPage(wrap){
  var t=target();
  var cur=wrap.querySelector('#ib-stu-cur');
  if(cur)cur.textContent=t?((window.apiConfigs&&apiConfigs.find(function(a){return a.id===t.fid})||{}).nickname||'TA'):'（未检测到，先在 Chat 里打开一位 TA）';
  var vis=wrap.querySelector('#ib-stu-vision');
  if(vis)vis.textContent=t?(canSee(t.fid)?'这位 TA 可以看图':'这位 TA 的 API 不识图，发不了画面'):'—';
  var dm=wrap.querySelector('#ib-stu-dm');
  if(dm)dm.textContent=(navigator.mediaDevices&&navigator.mediaDevices.getDisplayMedia)?'支持（桌面 Chrome/Edge）':'当前浏览器不支持';
  var supp=wrap.querySelector('#ib-stu-supp');
  if(supp){
    var pipOK=!!(window.documentPictureInPicture&&documentPictureInPicture.requestWindow);
    supp.textContent=pipOK?'置顶小窗：支持（画中画）':'置顶小窗：画中画不支持，将用独立弹窗（不被最小化影响，但不再置顶）';
  }
}

/* ── 浮窗：原版 #chat-panel 整体浮出 ── */
var OVERRIDE_CSS=''
  +'html,body{width:100%;height:100%;overflow:hidden}'
  +'body>#chat-panel{display:flex !important;position:absolute;left:0;top:0;width:100%;height:100%;max-width:none;max-height:none;animation:none}'
  +'#cp-resize{display:none !important}'
  +'#ib-stu-sharebar{display:flex;gap:6px;padding:7px 10px;flex-wrap:wrap;align-items:center;flex:none;border-top:1px solid rgba(128,150,190,.22);background:rgba(127,150,190,.08)}'
  +'#ib-stu-sharebar button,#ib-stu-sharebar select{font-family:inherit;font-size:12.5px;line-height:1.2;padding:7px 10px;border-radius:9px;border:1px solid rgba(128,150,190,.35);background:rgba(127,150,190,.14);color:inherit;cursor:pointer}'
  +'#ib-stu-sharebar button.acc{background:#2f6fed;border-color:#2f6fed;color:#fff}'
  +'#ib-stu-sharebar button.warn{background:#8a3444;border-color:#8a3444;color:#fff}'
  +'#ib-stu-sharebar button:disabled{opacity:.45;cursor:default}'
  +'#ib-stu-sharebar label{display:flex;align-items:center;gap:4px;font-size:12px;opacity:.85}'
  +'#ib-stu-sharebar select{max-width:120px}'
  +'#ib-stu-pv{width:100%;max-height:104px;object-fit:contain;background:#000;display:none;flex:none}';

async function openFloat(){
  if(S.win){try{if(!S.win.closed){S.win.focus();return}}catch(e){}}
  var win=null,isPip=false;
  try{
    if(window.documentPictureInPicture&&documentPictureInPicture.requestWindow){
      var _pr=document.getElementById('chat-panel').getBoundingClientRect();
      var _W=Math.max(380,Math.round(_pr.width)||438),_H=Math.max(620,Math.round(_pr.height)||770);
      win=await documentPictureInPicture.requestWindow({width:_W,height:_H});isPip=true;
    }
  }catch(e){}
  if(!win){
    win=window.open('','ib-studio','width=438,height=770,menubar=no,toolbar=no,location=no,status=no');
    if(!win){toast('弹窗被拦截：请允许本站弹窗后重试');return}
  }
  S.win=win;S.isPip=isPip;
  buildUI(win.document,isPip);
}
function buildUI(doc,isPip){
  try{doc.title='自习室 · Chat'}catch(e){}
  /* 1) base：克隆样式里的相对 url()（字体/纹理）按主页面地址解析 */
  var head=doc.head;
  var base=doc.createElement('base');base.href=location.href;head.appendChild(base);
  /* 2) 原样复制全部样式与主题类 */
  try{document.querySelectorAll('style').forEach(function(st){head.appendChild(st.cloneNode(true))})}catch(e){}
  try{document.querySelectorAll('link[rel="stylesheet"]').forEach(function(lk){head.appendChild(lk.cloneNode(true))})}catch(e){}
  try{doc.documentElement.className=document.documentElement.className||''}catch(e){}
  try{doc.body.className=document.body.className||'';doc.body.style.cssText=document.body.style.cssText||''}catch(e){}
  /* 3) 原版面板整体克隆（含当前消息/会话条状态） */
  var panel=document.getElementById('chat-panel');
  if(!panel){doc.body.innerHTML='<p style="padding:20px">主页面没有找到悬浮聊天框（#chat-panel）。</p>';return}
  doc.body.innerHTML=panel.outerHTML;
  /* 3.5) 页面壁纸：玻璃面板要有和主页面一样的背景衬托才是原版观感 */
  try{['bg-internal-img','bg-infernal-img'].forEach(function(id){var el=document.getElementById(id);if(el)doc.body.appendChild(el.cloneNode(true))})}catch(e){}
  try{doc.body.style.backgroundColor=getComputedStyle(document.body).backgroundColor}catch(e){}
  /* 4) 覆盖：铺满小窗 + 共享工具条（放在输入区上方） */
  var ov=doc.createElement('style');ov.textContent=OVERRIDE_CSS;head.appendChild(ov);
  var pv=doc.createElement('video');pv.id='ib-stu-pv';pv.muted=true;pv.autoplay=true;pv.playsInline=true;
  doc.body.insertBefore(pv,doc.body.firstChild);
  var bar=doc.createElement('div');bar.id='ib-stu-sharebar';
  bar.innerHTML='<button id="stu-share" class="acc">共享屏幕/窗口</button>'
    +'<button id="stu-peek">让 TA 看一眼</button>'
    +'<select id="stu-auto"><option value="0">自动陪看：关</option><option value="1">每 1 分钟</option><option value="3">每 3 分钟</option><option value="5">每 5 分钟</option><option value="10">每 10 分钟</option></select>'
    +'<select id="stu-vq"><option value="s">清晰度：省流量</option><option value="m">清晰度：标准</option><option value="h">清晰度：高清</option><option value="f">清晰度：原画</option></select>'
    +'<label><input type="checkbox" id="stu-diff">画面没变不发</label>'
    +'<button id="stu-stop" class="warn" style="display:none">停止共享</button>';
  var inArea=doc.querySelector('.chat-input-area');
  inArea?inArea.parentNode.insertBefore(bar,inArea):doc.body.appendChild(bar);
  /* 5) 克隆节点里的内联处理器指向的是小窗（没有那些函数），全部摘除后重接主线 */
  doc.body.querySelectorAll('[onclick],[onkeydown],[oninput],[onchange],[onmousedown],[onmouseup],[ontouchstart]').forEach(function(el){
    ['onclick','onkeydown','oninput','onchange','onmousedown','onmouseup','ontouchstart'].forEach(function(a){el.removeAttribute(a)});
  });
  wire(doc);
  S.els={doc:doc,msgs:doc.getElementById('chat-messages'),friends:doc.getElementById('chat-panel-friends'),
    hname:doc.getElementById('chat-header-name'),quote:doc.getElementById('chat-mini-quote'),
    preview:doc.getElementById('chat-mini-preview'),ta:doc.getElementById('chat-input'),
    send:doc.getElementById('chat-send-btn'),stop:doc.getElementById('chat-stop-mini'),
    attach:doc.querySelector('.chat-attach-btn'),voice:doc.getElementById('chat-voice-mini'),pv:pv};
  /* 主窗口事件 → 小窗关闭时收尾 */
  try{win.addEventListener('pagehide',cleanup)}catch(e){}
  try{win.addEventListener('unload',cleanup)}catch(e){}
  if(S.poll)clearInterval(S.poll);
  S.poll=setInterval(mirror,700);
  mirror();
}
function wire(doc){
  var ta=doc.getElementById('chat-input');
  if(ta){
    ta.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendFromPip()}});
    ta.addEventListener('input',function(){ta.style.height='auto';ta.style.height=Math.min(120,ta.scrollHeight)+'px'});
  }
  var send=doc.getElementById('chat-send-btn');if(send)send.addEventListener('click',sendFromPip);
  var stop=doc.getElementById('chat-stop-mini');if(stop)stop.addEventListener('click',function(){try{window.stopStreaming()}catch(e){}});
  var x=doc.querySelector('.chat-close');if(x)x.addEventListener('click',function(){try{S.win.close()}catch(e){}});
  var att=doc.querySelector('.chat-attach-btn');if(att)att.addEventListener('click',function(e){e.stopPropagation();try{window.toggleAttachPopup(att)}catch(x_){}});
  var items=doc.querySelectorAll('.chat-attach-popup-item');
  if(items.length>=4){
    items[0].addEventListener('click',function(){try{window.pickImage('mini')}catch(e){}});
    items[1].addEventListener('click',function(){try{window.IBCALLW&&IBCALLW.open(window.activeFriendId)}catch(e){}});
    items[2].addEventListener('click',function(){try{window.IBCALLW&&IBCALLW.openVideo(window.activeFriendId)}catch(e){}});
    items[3].addEventListener('click',function(){try{window.pickFile('mini')}catch(e){}});
  }
  var voice=doc.getElementById('chat-voice-mini');if(voice)voice.addEventListener('click',function(){toast('语音录入请回主窗口使用')});
  /* Thought process 折叠块：克隆节点丢了监听，消息容器上做事件委托 */
  var _msgsEl=doc.getElementById('chat-messages');
  if(_msgsEl)_msgsEl.addEventListener('click',function(e){
    var t=e.target;
    while(t&&t!==_msgsEl&&!(t.classList&&t.classList.contains('chat-thinking-toggle')))t=t.parentNode;
    if(t&&t.classList&&t.classList.contains('chat-thinking-toggle')){
      var wrap=t.parentNode;
      if(wrap&&wrap.classList.contains('chat-thinking-wrap')){wrap.classList.toggle('expanded');t.classList.toggle('open')}
    }
  });
  doc.getElementById('stu-share').addEventListener('click',function(){shareScreen()});
  doc.getElementById('stu-peek').addEventListener('click',function(){peek()});
  doc.getElementById('stu-stop').addEventListener('click',function(){stopStream();paintShare()});
  var sel=doc.getElementById('stu-auto');sel.value=String(S.autoMin);
  sel.addEventListener('change',function(){setAuto(sel.value|0)});
  var dif=doc.getElementById('stu-diff');dif.checked=!!S.autoDiff;
  dif.addEventListener('change',function(){S.autoDiff=dif.checked;cfgSave()});
  var vqSel=doc.getElementById('stu-vq');vqSel.value=S.vq||'m';
  vqSel.addEventListener('change',function(){S.vq=vqSel.value;cfgSave()});
}
function cleanup(){
  if(S.poll){clearInterval(S.poll);S.poll=null}
  stopStream();S.video=null;S.win=null;S.els={};
}
function sendFromPip(){
  var els=S.els;if(!els||!els.ta)return;
  var t=target();
  if(!t){toast('先在 Chat 里打开一位 TA');return}
  var txt=String(els.ta.value||'').trim();if(!txt)return;
  if(isBusy(t.fid)){toast('TA 正在回复中，稍等');return}
  els.ta.value='';els.ta.style.height='auto';
  /* 直接走应用发送链（与主窗口同一管线），不再写主窗口输入框——currentPage 是 let 变量探测不到，曾导致写错输入框而静默失败 */
  try{CTX.chat.send(t.fid,t.tid,txt,{quiet:false}).then(function(ok){if(ok===false){els.ta.value=txt;toast('没发出去，请重试')}}).catch(function(e){els.ta.value=txt;toast(String((e&&e.message)||e))})}catch(e){els.ta.value=txt;toast(String((e&&e.message)||e))}
}
/* 每拍把主窗口原节点的最新状态镜像进来 */
function mirror(){
  var els=S.els;if(!els||!els.doc)return;
  var M=window.document;
  try{
    var src=M.getElementById('chat-messages'),_full=M.getElementById('chat-full-messages');
    if(_full&&(!src||_full.childElementCount>src.childElementCount))src=_full;/* 聊天页（全屏容器）有更完整的历史时优先镜像它 */
    if(src&&els.msgs){
      var last=src.lastElementChild;
      var sig=src.childElementCount+'|'+(last?(last.id||last.className)+'|'+last.textContent.length:0);
      if(sig!==S.lastMsgSig){
        S.lastMsgSig=sig;
        var nearBottom=els.msgs.scrollHeight-els.msgs.scrollTop-els.msgs.clientHeight<140||els.msgs.scrollTop+8>=els.msgs.scrollHeight-els.msgs.clientHeight;
        var nodes=Array.prototype.slice.call(src.childNodes).slice(-60);
        els.msgs.innerHTML=nodes.map(function(n){return n.outerHTML||''}).join('');
        if(nearBottom)els.msgs.scrollTop=els.msgs.scrollHeight;
      }
    }
  }catch(e){}
  try{
    var f=M.getElementById('chat-panel-friends');
    if(f&&els.friends&&f.innerHTML!==els.friends.innerHTML)els.friends.innerHTML=f.innerHTML;
    var h=M.getElementById('chat-header-name');
    if(h&&els.hname&&els.hname.textContent!==h.textContent)els.hname.textContent=h.textContent;
    var q=M.getElementById('chat-mini-quote');
    if(q&&els.quote&&q.innerHTML!==els.quote.innerHTML)els.quote.innerHTML=q.innerHTML;
    var p=M.getElementById('chat-mini-preview');
    if(p&&els.preview&&p.innerHTML!==els.preview.innerHTML)els.preview.innerHTML=p.innerHTML;
    var ms=M.getElementById('chat-send-btn'),xs=M.getElementById('chat-stop-mini');
    if(ms&&els.send){els.send.disabled=!!ms.disabled;els.send.style.display=ms.style.display}
    if(xs&&els.stop)els.stop.style.display=xs.style.display;
    var mq=M.getElementById('chat-input');
    if(mq&&els.ta&&document.activeElement!==els.ta&&mq.placeholder!==els.ta.placeholder)els.ta.placeholder=mq.placeholder;
  }catch(e){}
  paintShare();
}
/* ── 屏幕共享 ── */
function paintShare(){
  var els=S.els;if(!els||!els.doc)return;
  var on=!!S.stream;
  var stop=els.doc.getElementById('stu-stop');if(stop)stop.style.display=on?'':'none';
  var share=els.doc.getElementById('stu-share');if(share)share.disabled=on;
  if(els.pv){if(on){try{els.pv.srcObject=S.stream;els.pv.style.display='';try{els.pv.play()}catch(e){}}catch(e){}}else{try{els.pv.srcObject=null}catch(e){}els.pv.style.display='none'}}
}
function stopStream(){
  if(S.stream){try{S.stream.getTracks().forEach(function(tr){tr.stop()})}catch(e){}S.stream=null}
  if(S.autoT){clearInterval(S.autoT);S.autoT=null}
  S.lastSig='';
}
async function shareScreen(){
  var t=target();if(!t){toast('先在 Chat 里打开一位 TA');return}
  var nav=(S.win&&S.win.navigator)?S.win.navigator:navigator;
  if(!nav.mediaDevices||!nav.mediaDevices.getDisplayMedia){toast('这个浏览器不支持屏幕共享（需桌面版 Chrome/Edge）');return}
  try{
    var stream=await nav.mediaDevices.getDisplayMedia({video:{frameRate:5},audio:false});
    stopStream();S.stream=stream;
    try{stream.getVideoTracks()[0].addEventListener('ended',function(){stopStream();paintShare();toast('共享已结束')})}catch(e){}
    S.video=S.els.pv||null;/* 每次共享都重绑当前预览 */
    paintShare();toast('共享中：可「看一眼」或开「自动陪看」');
  }catch(e){toast('共享未开始：'+String((e&&e.message||e)).slice(0,80))}
}
function grabFrame(){
  if(!S.stream)return '';
  try{
    var v=S.els.pv||S.video;if(!v||!v.videoWidth)return '';/* 永远抓当前窗口预览，防旧窗口残留帧 */
    var vq=VQ[S.vq]||VQ.m;
    var w=vq.w?Math.min(vq.w,v.videoWidth):v.videoWidth,h=Math.round(v.videoHeight*w/v.videoWidth);
    var c=document.createElement('canvas');c.width=w;c.height=h;
    c.getContext('2d').drawImage(v,0,0,w,h);
    return c.toDataURL('image/jpeg',vq.q);
  }catch(e){return ''}
}
function sigOf(){
  try{
    var v=S.els.pv||S.video;if(!v||!v.videoWidth)return '';
    var c=document.createElement('canvas');c.width=48;c.height=27;
    var x=c.getContext('2d');x.drawImage(v,0,0,48,27);
    var d=x.getImageData(0,0,48,27).data,out=new Array(48*27);
    for(var i=0,j=0;i<d.length;i+=4,j++)out[j]=(d[i]*3+d[i+1]*4+d[i+2])>>3;
    return out;
  }catch(e){return ''}
}
function diffSig(a,b){
  if(!a||!b||a.length!==b.length)return 999;
  var d=0;for(var i=0;i<a.length;i++)d+=Math.abs(a[i]-b[i]);
  return d/a.length;
}
async function peek(){
  var t=target();if(!t){toast('先在 Chat 里打开一位 TA');return}
  if(!S.stream){toast('先点「共享屏幕/窗口」');return}
  if(!canSee(t.fid)){toast('这位 TA 的 API 不识图，发不了画面');return}
  if(isBusy(t.fid)){toast('TA 正在回复中，稍等');return}
  var f=grabFrame();
  for(var _try=0;!f&&_try<4;_try++){await new Promise(function(r){setTimeout(r,500)});f=grabFrame()}
  if(!f){toast('画面还没就绪：请确认共享仍在进行');return}
  var _img={dataUrl:f,base64:f.split(',')[1]||'',mime:'image/jpeg',name:'frame.jpg'};/* 桌面请求体用 base64 字段，必须带 */
  var cap='';
  if(S.els&&S.els.ta){cap=String(S.els.ta.value||'').trim();S.els.ta.value='';S.els.ta.style.height='auto'}
  if(!cap)cap='【共享屏幕】随这条消息附的图片是我此刻屏幕的原样截图，图中内容就是我现在正在看的东西。请先仔细看图，再围绕图回答我；不要聊图里没有的内容。';
  try{CTX.chat.send(t.fid,t.tid,cap,{images:[_img],quiet:false}).then(function(ok){if(ok===false)toast('没发出去，请重试')}).catch(function(e){toast(String((e&&e.message)||e))})}catch(e){toast(String((e&&e.message)||e))}
}
function setAuto(min){S.autoMin=min;cfgSave();autoRestart()}
function autoRestart(){
  if(S.autoT){clearInterval(S.autoT);S.autoT=null}
  if(S.autoMin&&S.stream)S.autoT=setInterval(autoTick,Math.max(1,S.autoMin)*60000);
}
function autoTick(){
  var t=target();if(!t||!S.stream)return;
  if(isBusy(t.fid)||!canSee(t.fid))return;
  var sig=sigOf();if(!sig)return;
  if(S.autoDiff&&S.lastSig&&diffSig(sig,S.lastSig)<6)return;
  S.lastSig=sig;
  var f=grabFrame();if(!f)return;
  var _img={dataUrl:f,base64:f.split(',')[1]||'',mime:'image/jpeg',name:'frame.jpg'};
  try{CTX.chat.send(t.fid,t.tid,'（自动陪看）我屏幕上的内容有更新，这一眼是这个。',{images:[_img],quiet:false})}catch(e){}
}

IBApps.register({
  id:'studio',name:'自习室',version:'1.2.0',sdk:2,wall:false,headless:false,nav:{label:'Studio',after:'cinema'},page:true,
  mount:function(h,c){CTX=c;try{buildPage(h,c)}catch(e){console.warn('[studio] mount',e)}}
});
})();
