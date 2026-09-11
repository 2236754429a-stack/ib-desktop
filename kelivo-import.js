/* InternalBeyond Kelivo raw JSON importer. Pure normalization only: no IO, no secrets. */
(function(root, factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.IBKelivoImport=factory();
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  var SENSITIVE=/^(api[_-]?key|key|token|access[_-]?token|refresh[_-]?token|secret|password|passwd|authorization|cookie|headers?|system[_-]?prompt)$/i;
  var ROLE_KEYS=['role','senderRole','sender_role','senderType','sender_type','authorRole','author_role','speakerRole','speaker_role','messageType','message_type','type'];
  var EPOCH=946684800000;
  function str(v){return v==null?'':String(v)}
  function cleanText(v){
    if(typeof v==='string')return v.trim();
    if(Array.isArray(v))return v.map(function(x){return typeof x==='string'?x:(x&&typeof x==='object'?(x.text||x.content||''):'')}).join('').trim();
    if(v&&typeof v==='object')return cleanText(v.text||v.value||v.content||v.parts||'');
    return '';
  }
  function first(o,keys){for(var i=0;i<keys.length;i++){if(o&&o[keys[i]]!=null&&o[keys[i]]!=='')return o[keys[i]]}return ''}
  function finiteTime(v){
    if(v instanceof Date)return v.getTime();
    if(typeof v==='number'&&isFinite(v))return v<100000000000?v*1000:v;
    if(typeof v==='string'&&v.trim()){var n=Number(v);if(isFinite(n))return n<100000000000?n*1000:n;var d=Date.parse(v);if(isFinite(d))return d}
    return 0;
  }
  function hash(s){
    var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return ('00000000'+(h>>>0).toString(16)).slice(-8)}
  function stable(v){
    if(v===null||typeof v!=='object')return JSON.stringify(v);
    if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
    return '{'+Object.keys(v).filter(function(k){return !SENSITIVE.test(k)&&k!=='raw'&&k!=='mapping'}).sort().map(function(k){return JSON.stringify(k)+':'+stable(v[k])}).join(',')+'}';
  }
  function key(prefix,source,identity){return prefix+'_'+hash(str(source)+'|'+str(identity))}
  function roleOf(row){
    var r='';for(var i=0;i<ROLE_KEYS.length&&!r;i++)r=first(row, [ROLE_KEYS[i]]);
    if(r&&typeof r==='object')r=first(r,['role','name','type','kind']);
    r=str(r).toLowerCase().trim();
    if(r==='human'||r==='me'||r==='user'||r==='用户'||r==='human_user'||r==='human-user'||r==='person'||r==='0')return'user';
    if(r==='assistant'||r==='ai'||r==='bot'||r==='model'||r==='chatgpt'||r==='claude'||r==='助手'||r==='1')return'assistant';
    return '';
  }
  function unwrap(input){
    var d=input;
    if(Array.isArray(d)){
      if(d.some(function(x){return x&&typeof x==='object'&&x.mapping}))return {conversations:d};
      return {message_rows:d};
    }
    if(!d||typeof d!=='object')return {};
    var seen=[];
    for(var i=0;i<5;i++){
      var next=first(d,['data','export','backup','payload','result']);
      if(next&&typeof next==='object'&&seen.indexOf(next)<0){seen.push(d);d=next}else break;
    }
    if(Array.isArray(d)){
      if(d.some(function(x){return x&&typeof x==='object'&&x.mapping}))return {conversations:d};
      return {message_rows:d};
    }
    return d;
  }
  function collectRows(d,names){
    var out=[];
    names.forEach(function(n){var a=d&&d[n];if(Array.isArray(a))out=out.concat(a)});
    return out;
  }
  function rowId(row){return first(row,['id','uuid','message_id','messageId','rowid','_id'])}
  function convId(row){return first(row,['conversation_id','conversationId','conversationID','conv_id','thread_id','threadId','chat_id','chatId'])}
  function titleOf(row){return cleanText(first(row,['title','name','subject','conversation_title','conversationTitle']))}
  function rowTime(row,identity){return finiteTime(first(row,['timestamp','created','created_at','create_time','updated_at','updated']))||EPOCH+(parseInt(hash(str(identity)),16)%31536000000)}
  function chatText(row){
    return cleanText(first(row,['content','text','message','body','parts','value']))||cleanText(row&&row.message&&row.message.content);
  }
  function safeMeta(row){
    var out={};if(!row||typeof row!=='object')return out;
    Object.keys(row).forEach(function(k){if(SENSITIVE.test(k))return;if(k==='raw'||k==='mapping'||k==='content'||k==='parts'||k==='message')return;var v=row[k];if(['string','number','boolean'].indexOf(typeof v)>=0&&String(v).length<500)out[k]=v});return out;
  }
  function ensureThread(out,cid,title,created){
    cid=str(cid)||'conversation_0';
    var th=out.threadMap[cid]||(out.threadMap[cid]={cid:cid,title:title||'',created:created||0});
    if(!th.title&&title)th.title=title;if(created&&(!th.created||created<th.created))th.created=created;
    return th;
  }
  function addMessage(out,row,source,forcedConv,titleHint,idx){
    if(!row||typeof row!=='object')return;
    var role=roleOf(row);if(!role)return;
    var content=chatText(row);if(!content)return;
    var cid=forcedConv||convId(row)||'conversation_0';
    var rid=rowId(row)||stable({c:cid,r:role,t:content,ts:first(row,['timestamp','created','created_at','create_time','updated_at'])})+'_'+idx;
    var sk='message:'+str(source)+':'+str(cid)+':'+str(rid);
    var msg={id:key('kelivo_msg',source,sk),sourceKey:sk,friendId:out.friendId,threadId:key('kelivo_thread',source,'conversation:'+cid),role:role,content:content,timestamp:rowTime(row,sk),_kelivoImported:true,_kelivoSourceKey:sk};
    if(titleHint)msg._kelivoConversationTitle=titleHint;
    var sender=cleanText(first(row,['senderName','sender_name','authorName','author_name','name']));if(sender&&role==='assistant')msg.senderName=sender;
    out.messages.push(msg);
    ensureThread(out,cid,titleHint,msg.timestamp);
  }
  function addChatGpt(out,conversations,source){
    conversations.forEach(function(c,ci){
      if(!c||typeof c!=='object')return;var cid=first(c,['id','conversation_id','conversationId'])||('conversation_'+ci),title=titleOf(c)||'未命名会话';
      var map=c.mapping;
      if(map&&typeof map==='object'){
        Object.keys(map).forEach(function(nid,ni){var node=map[nid]||{},m=node.message;if(m)addMessage(out,{id:first(m,['id','message_id'])||nid,role:first(m,['author'])||m.author,content:m.content||m.parts||'',create_time:first(m,['create_time','created_at']),senderName:first(m,['recipient'])},source,cid,title,ni)})
      }else{
        var msgs=Array.isArray(c.messages)?c.messages:[];msgs.forEach(function(m,mi){addMessage(out,m,source,cid,title,mi)})
      }
    });
  }
  function memoryOf(row,out,source,idx){
    if(!row||typeof row!=='object')return;
    var content=cleanText(first(row,['content','text','memory','summary','description','value']));
    var title=cleanText(first(row,['title','name','subject','key']))||'导入记忆';
    var summary=cleanText(first(row,['summary','description','abstract']))||content.slice(0,120);
    if(!content&&!summary)return;
    var identity=rowId(row)||stable({title:title,content:content,summary:summary});
    var sk='memory:'+str(source)+':'+str(identity);
    out.memories.push({id:key('kelivo_mem',source,sk),sourceKey:sk,rawSource:'Kelivo',sourceId:sk,title:title.slice(0,200),summary:summary.slice(0,500),content:(content||summary).slice(0,10000),domain:'日常',tags:['Kelivo'],valence:0.5,arousal:0.3,importance:5,resolved:false,pinned:false,visibility:'private',visibleTo:[],excludeFrom:[],activationCount:0,created:rowTime(row,sk),lastActivated:rowTime(row,sk),createdBy:out.friendId,createdByName:out.friendName,editedByUser:false,_kelivoImported:true,_kelivoSourceKey:sk});
  }
  function normalize(input,opt){
    opt=opt||{};var d=unwrap(input),source=opt.source||'kelivo-json',out={messages:[],memories:[],threadMap:{},friendId:opt.friendId||'',friendName:opt.friendName||''};
    var cs=Array.isArray(d)?[]:collectRows(d,['conversation_rows','conversationRows','conversations','threads','chats']);
    var ms=Array.isArray(d)?d:collectRows(d,['message_rows','messageRows','messages','chatMessages','rows']);
    var mems=Array.isArray(d)?[]:collectRows(d,['memory_entry_rows','memoryEntryRows','memory_entries','memoryEntries','memories','memory']);
    var looksGpt=cs.some(function(c){return c&&c.mapping});if(looksGpt)addChatGpt(out,cs,source);
    cs.forEach(function(c,ci){
      if(!c||typeof c!=='object'||c.mapping)return;
      var cid=convId(c)||rowId(c)||('conversation_'+ci),title=titleOf(c),nested=collectRows(c,['message_rows','messageRows','messages','rows']);
      if(!nested.length)ensureThread(out,cid,title,finiteTime(first(c,['created','created_at','timestamp','updated_at']))||0);
      nested.forEach(function(m,mi){addMessage(out,m,source,cid,title,mi)});
    });
    ms.forEach(function(m,mi){addMessage(out,m,source,'',titleOf(m),mi)});
    mems.forEach(function(m,mi){memoryOf(m,out,source,mi)});
    out.threads=Object.keys(out.threadMap).map(function(cid){var t=out.threadMap[cid],tid=key('kelivo_thread',source,'conversation:'+cid),threadKey='thread:'+str(source)+':'+str(cid);return{id:tid,sourceKey:threadKey,friendId:out.friendId,name:t.title||('会话 · '+str(cid).slice(0,20)),created:t.created||rowTime({},threadKey),memoryEnabled:false,_kelivoConversationId:cid,_kelivoImported:true,_kelivoSourceKey:threadKey}});
    delete out.threadMap;
    out.messages.forEach(function(m){if(!out.threads.some(function(t){return t.id===m.threadId}))m.threadId=out.threads[0]&&out.threads[0].id||null});
    var uniq=function(a){var seen={};return a.filter(function(x){if(seen[x.sourceKey])return false;seen[x.sourceKey]=1;return true})};
    out.messages=uniq(out.messages);out.threads=uniq(out.threads);out.memories=uniq(out.memories);
    return out;
  }
  function parse(input,opt){
    var n=normalize(input,opt),warnings=[];
    if(!n.friendId)warnings.push('未找到可绑定的 API 配置');
    if(!n.messages.length&&!n.memories.length)warnings.push('未识别到可导入的消息或记忆');
    return {messages:n.messages,threads:n.threads,memories:n.memories,warnings:warnings,counts:{messages:n.messages.length,threads:n.threads.length,memories:n.memories.length},friendId:n.friendId,friendName:n.friendName};
  }
  return {parse:parse,normalize:normalize,hash:hash,roleOf:roleOf};
});
