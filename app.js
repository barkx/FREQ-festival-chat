var ws, myNick, myTicket, activeChannel;
var joinedChannels = new Set();
var unread = new Set();
var channelMeta = {};
var channelHistory = {}; // persistent per-channel message log
var typingTimers = {};
var BOT_NICKS = new Set(['Nika_MB','Rok_IT','MajcaFest','ZanPunk','TejaS','LukaBass','SaraKoper','MaticFreq','EvaDesign','Gasper99','AnjaDancer','TimoLj','NejcKamnik','UrskaPt','BlazcEk','KatjaVino','FilipSplit','NataZg','AleksFreq','PetraPhoto']);

function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function ts(){
  var d=new Date();
  return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
}
function nickColor(nick){
  var h=0;
  for(var i=0;i<nick.length;i++) h=(h*31+nick.charCodeAt(i))&0xfffffff;
  return 'hsl('+(h%360)+',55%,62%)';
}
function show(id){
  document.querySelectorAll('.screen').forEach(function(s){s.classList.add('hidden');});
  document.getElementById(id).classList.remove('hidden');
}

// ── Ticket ───────────────────────────────────────────────────────────────────
function validateTicket(){
  var code=document.getElementById('ticket-input').value.trim();
  if(!code) return;
  if(ws && ws.readyState===1){
    ws.send(JSON.stringify({type:'validate_ticket',code:code}));
  } else {
    connectWS(function(){ws.send(JSON.stringify({type:'validate_ticket',code:code}));});
  }
}

function connectWS(onOpen){
  var proto=location.protocol==='https:'?'wss':'ws';
  ws=new WebSocket(proto+'://'+location.host);
  ws.onopen=function(){onOpen();};
  ws.onmessage=function(e){var m;try{m=JSON.parse(e.data);}catch(ex){return;}handleServerMsg(m);};
  ws.onerror=function(){
    var el=document.getElementById('ticket-error');
    if(el) el.textContent='Napaka povezave. Preveri da streznik tece.';
  };
  ws.onclose=function(){
    var sc=document.getElementById('screen-chat');
    if(sc && !sc.classList.contains('hidden')) setTimeout(function(){location.reload();},3000);
  };
}

window.addEventListener('DOMContentLoaded',function(){
  document.getElementById('ticket-input').addEventListener('keydown',function(e){
    if(e.key==='Enter') validateTicket();
  });
  connectWS(function(){});
});

// ── Username ─────────────────────────────────────────────────────────────────
function showUsernameScreen(code){
  myTicket=code;
  document.getElementById('validated-code').textContent=code;
  var suggestions=['Ptica','Mavrica','Strela','Valovi','Mesec','Senca','Veter','Iskra'];
  document.getElementById('nick-suggestions').innerHTML=
    suggestions.map(function(s){
      return '<div class="suggestion-chip" onclick="setNick(\''+s+'\')">'+s+'</div>';
    }).join('');
  show('screen-username');
  setTimeout(function(){document.getElementById('nick-input').focus();},400);
}
function setNick(n){document.getElementById('nick-input').value=n;updateNickPreview();}
function updateNickPreview(){
  document.getElementById('nick-preview').textContent=document.getElementById('nick-input').value||'_';
}
function registerNick(){
  var nick=document.getElementById('nick-input').value.trim();
  if(!nick) return;
  ws.send(JSON.stringify({type:'register',nick:nick}));
}

// ── Rooms ─────────────────────────────────────────────────────────────────────
function showRoomsScreen(nick, chans){
  myNick=nick;
  document.getElementById('rooms-nick').textContent=nick;
  document.getElementById('sidebar-nick').textContent=nick;
  chans.forEach(function(c){channelMeta[c.name]=c;});
  document.getElementById('channels-grid').innerHTML=chans.map(function(ch){
    return '<div class="channel-card" id="card-'+ch.name.slice(1)+'" onclick="toggleRoomJoin(\''+ch.name+'\')">'+
      '<div class="ch-emoji">'+ch.emoji+'</div>'+
      '<div class="ch-info">'+
        '<div class="ch-name">'+ch.name+'</div>'+
        '<div class="ch-desc">'+ch.desc+'</div>'+
        '<div class="ch-count" id="count-'+ch.name.slice(1)+'">— online</div>'+
      '</div>'+
      '<div class="ch-arrow">›</div>'+
    '</div>';
  }).join('');
  show('screen-rooms');
}

function toggleRoomJoin(chName){
  if(joinedChannels.has(chName)){
    joinedChannels.delete(chName);
    ws.send(JSON.stringify({type:'part',channel:chName}));
    var c=document.getElementById('card-'+chName.slice(1));
    if(c) c.classList.remove('joined');
  } else {
    joinedChannels.add(chName);
    ws.send(JSON.stringify({type:'join',channel:chName}));
    var c=document.getElementById('card-'+chName.slice(1));
    if(c) c.classList.add('joined');
  }
  document.getElementById('enter-chat-btn').disabled=(joinedChannels.size===0);
  if(!activeChannel && joinedChannels.size>0) activeChannel=[...joinedChannels][0];
}

function enterChat(){
  if(!joinedChannels.size) return;
  if(!activeChannel) activeChannel=[...joinedChannels][0];
  show('screen-chat');
  renderSidebarChannels();
  switchChannel(activeChannel);
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function switchChannel(chName){
  activeChannel=chName;
  unread.delete(chName);
  var meta=channelMeta[chName]||{};
  document.getElementById('chat-channel-name').textContent=chName;
  document.getElementById('chat-channel-desc').textContent=meta.desc||'';
  document.getElementById('chat-emoji').textContent=meta.emoji||'#';

  // Restore persistent history instead of clearing
  var box=document.getElementById('messages');
  box.innerHTML='';
  var hist=channelHistory[chName]||[];
  hist.forEach(function(m){
    renderMsgToBox(box, m.type, m.nick, m.text);
  });
  box.scrollTop=box.scrollHeight;

  renderSidebarChannels();
  ws.send(JSON.stringify({type:'names',channel:chName}));
  document.getElementById('chat-input').focus();
}

function renderMsgToBox(box, type, nick, text){
  var div=document.createElement('div');
  div.className='msg-row '+type;
  var color=(type==='message' && nick && nick!==myNick && !['—','-'].includes(nick))?nickColor(nick):'';
  div.innerHTML=
    '<span class="msg-ts">'+ts()+'</span>'+
    '<span class="msg-nick"'+(color?' style="color:'+color+'"':'')+'>'+esc(nick)+'</span>'+
    '<span class="msg-text">'+esc(text)+'</span>';
  box.appendChild(div);
}

function addMsg(type, nick, text, chName){
  // Store in history
  var ch=chName||activeChannel;
  if(ch){
    if(!channelHistory[ch]) channelHistory[ch]=[];
    channelHistory[ch].push({type:type,nick:nick,text:text});
    // cap at 200 messages per channel
    if(channelHistory[ch].length>200) channelHistory[ch]=channelHistory[ch].slice(-200);
  }

  if(chName && chName!==activeChannel){
    unread.add(chName);
    renderSidebarChannels();
    return;
  }
  var box=document.getElementById('messages');
  renderMsgToBox(box, type, nick, text);
  box.scrollTop=box.scrollHeight;
}

function addSysMsg(text){addMsg('system','—',text,null);}

// ── Typing indicator ──────────────────────────────────────────────────────────
var typingUsers = {}; // channel -> Set of nicks

function showTyping(nick, chName){
  if(!typingUsers[chName]) typingUsers[chName]={};
  typingUsers[chName][nick]=true;
  if(chName===activeChannel) renderTyping();
  // auto-clear after 4s
  clearTimeout(typingTimers[nick+'@'+chName]);
  typingTimers[nick+'@'+chName]=setTimeout(function(){
    clearTyping(nick,chName);
  },4000);
}

function clearTyping(nick, chName){
  if(typingUsers[chName]) delete typingUsers[chName][nick];
  if(chName===activeChannel) renderTyping();
}

function renderTyping(){
  var el=document.getElementById('typing-bar');
  if(!el) return;
  var users=typingUsers[activeChannel]||{};
  var names=Object.keys(users).filter(function(n){return n!==myNick;});
  if(names.length===0){
    el.innerHTML='';
    el.style.display='none';
  } else {
    var label=names.length===1?names[0]+' tipka':names.slice(0,-1).join(', ')+' in '+names[names.length-1]+' tipkata';
    el.innerHTML='<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span> '+esc(label);
    el.style.display='block';
  }
}

// Send typing event when user types
function onChatInput(){
  if(ws && ws.readyState===1 && activeChannel){
    ws.send(JSON.stringify({type:'typing',channel:activeChannel}));
  }
}

function renderSidebarChannels(){
  document.getElementById('sidebar-channels').innerHTML=[...joinedChannels].map(function(ch){
    var meta=channelMeta[ch]||{};
    var cls='ch-item'+(ch===activeChannel?' active':'')+(unread.has(ch)?' unread':'');
    return '<div class="'+cls+'" onclick="switchChannel(\''+ch+'\')">'+
      '<span class="ch-dot"></span><span>'+(meta.emoji||'')+' '+ch+'</span>'+
    '</div>';
  }).join('');
}

function sendMsg(){
  var input=document.getElementById('chat-input');
  var text=input.value.trim();
  if(!text||!activeChannel) return;
  input.value='';
  ws.send(JSON.stringify({type:'message',channel:activeChannel,text:text}));
  addMsg('message',myNick,text,null);
}

function leaveToRooms(){show('screen-rooms');}

// ── Server messages ───────────────────────────────────────────────────────────
function handleServerMsg(msg){
  if(msg.type==='ticket_valid'){
    showUsernameScreen(msg.code);
  } else if(msg.type==='ticket_invalid'){
    document.getElementById('ticket-error').textContent=msg.reason;
    var inp=document.getElementById('ticket-input');
    inp.classList.add('error');
    setTimeout(function(){inp.classList.remove('error');},500);
  } else if(msg.type==='registered'){
    showRoomsScreen(msg.nick,msg.channels);
  } else if(msg.type==='error'){
    var el=document.getElementById('nick-error')||document.getElementById('ticket-error');
    if(el) el.textContent=msg.text;
  } else if(msg.type==='joined'){
    var cnt=document.getElementById('count-'+msg.channel.slice(1));
    if(cnt) cnt.textContent=msg.names.length+' online';
    // Restore sample history for this channel
    if(msg.sampleHistory && msg.sampleHistory.length){
      if(!channelHistory[msg.channel] || channelHistory[msg.channel].length===0){
        channelHistory[msg.channel]=msg.sampleHistory.map(function(m){
          return {type:'message',nick:m.nick,text:m.text};
        });
      }
    }
  } else if(msg.type==='message'){
    clearTyping(msg.from, msg.channel);
    addMsg('message',msg.from,msg.text,msg.channel);
  } else if(msg.type==='join'){
    addMsg('join',msg.nick,'se je pridruzil/a',msg.channel);
    ws.send(JSON.stringify({type:'names',channel:msg.channel}));
  } else if(msg.type==='part'){
    addMsg('part',msg.nick,'je odsel/odsla',msg.channel);
    ws.send(JSON.stringify({type:'names',channel:msg.channel}));
  } else if(msg.type==='typing'){
    if(msg.nick!==myNick) showTyping(msg.nick, msg.channel);
  } else if(msg.type==='names'){
    if(msg.channel===activeChannel){
      document.getElementById('sidebar-users').innerHTML=msg.names.map(function(n){
        var isBot=BOT_NICKS.has(n);
        var color=n===myNick?'var(--orange)':nickColor(n);
        return '<div class="u-item'+(isBot?' bot':'')+'" style="color:'+color+'">'+esc(n)+(isBot?' ·':'')+'</div>';
      }).join('');
      document.getElementById('chat-online').textContent=msg.names.length+' online';
    }
    var cnt2=document.getElementById('count-'+(msg.channel&&msg.channel.slice(1)));
    if(cnt2) cnt2.textContent=msg.names.length+' online';
  }
}
