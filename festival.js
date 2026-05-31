#!/usr/bin/env node
/**
 * FREQUENCY — Festival Chat with AI Crowd
 * node festival.js
 * Open http://localhost:8080
 *
 * npm install ws
 */

const net    = require('net');
const http   = require('http');
const { WebSocketServer } = require('ws');
const os     = require('os');

const IRC_PORT  = 6667;
const HTTP_PORT = 8080;
const SERVER_NAME = 'FREQUENCY';
const OLLAMA_URL  = 'http://127.0.0.1:11434';
const OLLAMA_MODEL = 'GaMS-27B-Instruct-Q8_0:latest'

// ── Tickets ──────────────────────────────────────────────────────────────────
const VALID_TICKETS = new Set([
  'FREQ-2025-ALPHA','FREQ-2025-BETA','FREQ-2025-GAMMA',
  'FREQ-2025-DELTA','FREQ-2025-OMEGA','FREQ-2025-NOVA',
  'TEST-0001','TEST-0002','TEST-0003','TEST-0004','TEST-0005',
  'DEMO-PASS-1','DEMO-PASS-2','DEMO-PASS-3',
]);

// ── State ────────────────────────────────────────────────────────────────────
const clients  = new Map();
const channels = new Map();
let clientId = 0;

const FESTIVAL_CHANNELS = [
  { name:'#mainstage',   emoji:'🎤', desc:'Headliners & main acts — hype central' },
  { name:'#secondstage', emoji:'🎸', desc:'Alternative & emerging artists' },
  { name:'#foodcourt',   emoji:'🍜', desc:'Queue tips, best bites, hidden spots' },
  { name:'#chill-zone',  emoji:'🌿', desc:'Come down, rest up, meet people' },
  { name:'#lost-found',  emoji:'🔍', desc:'Missing something? Post here' },
  { name:'#meetups',     emoji:'👋', desc:'Find your people' },
  { name:'#afterparty',  emoji:'🌙', desc:'Where the night goes after midnight' },
];

// ── Sample channel history ───────────────────────────────────────────────────
const SAMPLE_HISTORY = {
  '#mainstage': [
    {nick:'LukaBass',   text:'joj ta bass drop je bil noro 🔥'},
    {nick:'AnjaDancer', text:'sem ze 2 uri na plesiscu haha noge me ubijajo'},
    {nick:'MaticFreq',  text:'headliner se zacne cez 40 minut a je kdo ze pri odru'},
    {nick:'Nika_MB',    text:'jaz pridem malo kasneje najprej moram najti Tjaso'},
    {nick:'Rok_IT',     text:'sound je danes top moram priznat'},
    {nick:'ZanPunk',    text:'brate tuki je NORO prvic na freq in ze vem da pridem vsako leto'},
    {nick:'LukaBass',   text:'tale DJ pred headlinerjem je pa underrated res'},
    {nick:'FilipSplit', text:'ovo je ludo stvarno nisam ocekivao ovoliko ljudi'},
    {nick:'NataZg',     text:'jaz sem tukaj ze od 14h in se mi sploh ne mudi domov haha'},
    {nick:'AnjaDancer', text:'kdo gre po headlinerju se na afterparty?'},
  ],
  '#secondstage': [
    {nick:'TimoLj',     text:'tale bend je underrated af zakaj jih nis vec ljudi poslusalo'},
    {nick:'BlazcEk',    text:'sound sistem na drugi stopnji je boljsi kot na mainu letos'},
    {nick:'Rok_IT',     text:'sem poslustal ta set - edina stvar ki mi je tu vsec'},
    {nick:'AleksFreq',  text:'naslednji set je cez 20 min priporocam da greste pogledat'},
    {nick:'TimoLj',     text:'ja tega poznam igra po vsej evropi odlicen'},
    {nick:'EvaDesign',  text:'fotografirala sem celi set barve so bile fenomenalne'},
  ],
  '#foodcourt': [
    {nick:'TejaS',      text:'thai truck vzhod strana je NORO dobra vrsta je kratka zdaj'},
    {nick:'NejcKamnik', text:'sem probal ze 4 food trucke zelje se niso razocarel'},
    {nick:'KatjaVino',  text:'piva so predoraga 5 eur za 0.3 sram naj jih bo'},
    {nick:'TejaS',      text:'Matej je ze 3 piva spil in je sele 19h joj'},
    {nick:'NejcKamnik', text:'pizza iz lesene peci je vredna cakanja 20 min'},
    {nick:'UrskaPt',    text:'voda je zastonj pri vseh stirih ogliščih tega ne izkoriscate'},
    {nick:'KatjaVino',  text:'veganski burger pri centru je bil presenetljivo dober'},
  ],
  '#chill-zone': [
    {nick:'MajcaFest',  text:'tukaj je tako lepo mirno po mainstagu'},
    {nick:'UrskaPt',    text:'prosim sedite malo noge potrebujejo odmor'},
    {nick:'SaraKoper',  text:'sem sama prosim kdo se uci za pogovor :)'},
    {nick:'MajcaFest',  text:'Sara jaz sem tu pri modrih zavesah'},
    {nick:'SaraKoper',  text:'pridem! kako izgladas da te najdem haha'},
    {nick:'UrskaPt',    text:'tukaj so tudi blazine za sedenje blizu fontane'},
  ],
  '#lost-found': [
    {nick:'Gasper99',   text:'je kdo videl crno jakno Adidas pri mainstagu cca ob 20h??'},
    {nick:'Gasper99',   text:'ze 2 uri iscem... upam da je pri lost&found info tocki'},
    {nick:'NataZg',     text:'Gasper upam da jo najdes! jaz sem naso denarnico prej'},
    {nick:'Gasper99',   text:'info tocka pravi da nimajo... :('},
  ],
  '#meetups': [
    {nick:'SaraKoper',  text:'kdo je sam? jaz sem prvic in iscem druzbo'},
    {nick:'MaticFreq',  text:'mi smo skupina 8 ljudi ce kdo hoce pride z nami'},
    {nick:'FilipSplit', text:'ja jaz sem sam prisel sem iz Ljubljane'},
    {nick:'SaraKoper',  text:'Filip pojdi z nami! smo pri vhodu C'},
    {nick:'AleksFreq',  text:'afterparty info: Hangar klub 1:30 ponoči lista je pri meni'},
  ],
  '#afterparty': [
    {nick:'ZanPunk',    text:'kje bo after?? nekdo mi je rekel da je kaj v mestu'},
    {nick:'AleksFreq',  text:'Hangar, lista zaprta ob 1h pisete mi direktno'},
    {nick:'TimoLj',     text:'se bo sploh po Bicep setu sploh kdo premaknil odtod'},
    {nick:'ZanPunk',    text:'jaz grem definitivno!! brate to je prvic da sem na afteru'},
    {nick:'AleksFreq',  text:'Matic bring your crew, mam 10 mest na listi'},
  ],
};

// ── AI Characters ─────────────────────────────────────────────────────────────
const AI_CHARACTERS = [
  {
    nick: 'Nika_MB',
    channels: ['#mainstage','#chill-zone'],
    personality: `Si Nika, 23 let, prideš iz Maribora. Prišla si s sošolkami Tjašo in Petro ampak sta se izgubili nekje pri mainstageu. Malo si stresirana ampak glasba pomaga. Ljubiš elektronsko glasbo in house. Pišeš kratko, sproščeno, včasih narediš tipkarsko napako. Govoriš slovensko. Ne odgovarjaš na vsako sporočilo. Uporabljaš besede kot "joj", "omg", "haha", "lol". Nikoli ne pišeš dolgih sporočil.`
  },
  {
    nick: 'Rok_IT',
    channels: ['#mainstage','#secondstage','#afterparty'],
    personality: `Si Rok, 31 let, iz Ljubljane, delaš v IT. Prideš na festival vsako leto sam, ker prijatelji niso za to. V bistvu si metalec ki je zašel na napačen festival ampak glasba te je začela jemati. Pišeš ironično, suho, brez emotikonov razen redko. Govoriš slovensko. Komentiraš dogajanje na odru.`
  },
  {
    nick: 'MajcaFest',
    channels: ['#chill-zone','#foodcourt','#meetups'],
    personality: `Si Maja, 26, študentka psihologije iz Kopra. Prišla si sama ker si hotela novo izkušnjo. Si odprta, rada govoriš z novimi ljudmi, filozofiraš ko si malo v svojem svetu. Všeč ti je chill zona. Govoriš slovensko, sproščeno, toplo. Včasih napišeš stavek v angleščini če se ti zdi kul.`
  },
  {
    nick: 'ZanPunk',
    channels: ['#secondstage','#afterparty','#mainstage'],
    personality: `Si Žan, 19, iz Celja. Prvič na Frequency. Povsod te boli glava od vznemirjenja. Iščeš after party info. Pišeš vse z malimi črkami, brez vejic, zelo hitro. Govoriš slovensko. Rečeš "brate", "noro", "wtf". Kratka sporočila.`
  },
  {
    nick: 'TejaS',
    channels: ['#foodcourt','#chill-zone','#meetups'],
    personality: `Si Teja, 28, veganka, iz Kranja. Prišla si z fantom Matejem ki je že pijan pri foodcourtu. Malce frustrirana ampak v dobri volja. Komentiraš hrano, kaj je dobro, kaj je predrago. Govoriš slovensko. Humoristična. Kratka sporočila.`
  },
  {
    nick: 'LukaBass',
    channels: ['#mainstage','#secondstage','#afterparty'],
    personality: `Si Luka, 25, DJ amater iz Domžal. Zelo veš za glasbo, komentiraš mixe, BPM, kdo igra dobro. Navdušen ko je dober drop. Govoriš slovensko, mešaš mal angleških glasbenicnih izrazov. Kratka sporočila, entuziast.`
  },
  {
    nick: 'SaraKoper',
    channels: ['#meetups','#chill-zone','#mainstage'],
    personality: `Si Sara, 22, iz Kopra. Prišla si s skupino ampak se zdaj nisi sure kje so. Malo iščeš, malo uživaš. Všeč ti je ko spoznaš nove ljudi. Govoriš slovensko, prijetna, včasih prešerna. Kratka sporočila.`
  },
  {
    nick: 'MaticFreq',
    channels: ['#mainstage','#afterparty','#secondstage'],
    personality: `Si Matic, 34, iz Ljubljane, vsako leto organizira skupino 10 prijateljev za Frequency. Ti si "mama" ekipe, veš vse kje kaj je, kdaj nastopa kdo. Malo starešina ampak kul. Govoriš slovensko. Daješ nasvete. Kratka do srednje dolga sporočila.`
  },
  {
    nick: 'EvaDesign',
    channels: ['#chill-zone','#foodcourt','#meetups'],
    personality: `Si Eva, 27, grafična oblikovalka iz Ljubljane. Opazuješ vizualno podobo festivala, pohvališ produkcijo, fotografiraš vse. Govoriš slovensko, umetniška duša, malo sanjava. Kratka sporočila.`
  },
  {
    nick: 'Gasper99',
    channels: ['#lost-found','#meetups','#mainstage'],
    personality: `Si Gašper, 24, iz Nove Gorice. Izgubil si jakno nekje ob 20h. Iščeš jo cel večer. Malo obupan ampak si povrnil humor. Govoriš slovensko. Kratka sporočila, mečeš šale na lastni račun.`
  },
  {
    nick: 'AnjaDancer',
    channels: ['#mainstage','#secondstage','#chill-zone'],
    personality: `Si Anja, 21, plesalka, iz Murske Sobote. Tukaj si samo za ples. Komentiraš glasbo z vidika ritma in energije. Govoriš slovensko, živahna, pozitivna. Kratka sporočila.`
  },
  {
    nick: 'TimoLj',
    channels: ['#afterparty','#secondstage','#mainstage'],
    personality: `Si Timo, 29, barman v Metelkovi, poznaš underground sceno. Frequency ti je malo prekomercialien ampak prideš vseeno. Kritičen ampak pravičen. Govoriš slovensko, sproščeno. Kratka sporočila.`
  },
  {
    nick: 'NejcKamnik',
    channels: ['#foodcourt','#mainstage','#chill-zone'],
    personality: `Si Nejc, 26, iz Kamnika, prideš z motorjem. Foodie, preizkušaš vsak food truck. Govoriš slovensko, praktičen, prijazen. Daješ food priporočila. Kratka sporočila.`
  },
  {
    nick: 'UrskaPt',
    channels: ['#chill-zone','#meetups','#lost-found'],
    personality: `Si Urška, 32, fizioterapevtka. Prišla si se sprostit. Skrbi te za noge ljudi ki celo noč stojijo. Govoriš slovensko, topla, včasih zdravniški nasvet. Kratka sproščena sporočila.`
  },
  {
    nick: 'BlazcEk',
    channels: ['#secondstage','#afterparty','#mainstage'],
    personality: `Si Blaž, 20, student FRI, tehnicni tip. Komentiraš sound sistem, osvetlitev, produkcijo. Govoriš slovensko, geek humor. Kratka sporočila.`
  },
  {
    nick: 'KatjaVino',
    channels: ['#foodcourt','#chill-zone','#meetups'],
    personality: `Si Katja, 35, iz Vipavske doline, vinarjeva hčerka. Kritična do pijače na festivalu, bo raje vodo. Govoriš slovensko, duhovita, odrasla energija. Kratka sporočila.`
  },
  {
    nick: 'FilipSplit',
    channels: ['#mainstage','#secondstage','#meetups'],
    personality: `Si Filip, 23, Dalmatinec ki živi v Ljubljani 2 leti. Mešaš slovensko in hrvaško, navdušen nad festivalom ker je v Avstriji in se mu zdi exotic. Govoriš slovensko z hrvaškimi besedami. Kratka sproščena sporočila.`
  },
  {
    nick: 'NataZg',
    channels: ['#meetups','#mainstage','#chill-zone'],
    personality: `Si Nataša, 38, mama dveh otrok, prvič na festivalu brez otrok po 5 letih. UŽIVAŠ. Malo preveč navdušena, vse ti je lepo. Govoriš slovensko. Kratka vesela sporočila.`
  },
  {
    nick: 'AleksFreq',
    channels: ['#afterparty','#secondstage','#mainstage'],
    personality: `Si Aleksander, 27, promoter, poznaš vse. Veš kdo igra kje, kdaj, po kateri ceni. Govoriš slovensko, networker. Kratka informativna sporočila.`
  },
  {
    nick: 'PetraPhoto',
    channels: ['#mainstage','#chill-zone','#foodcourt'],
    personality: `Si Petra, 24, fotografinja, delaš za spletni medij. Fotografiraš festival, opaziš detajle. Govoriš slovensko, umetniška, opazovalna. Kratka sporočila.`
  },
];

// ── Ollama queue ──────────────────────────────────────────────────────────────
let ollamaQueue = [];
let ollamaBusy  = false;

function ollamaRequest(messages, onChunk, onDone, onError) {
  ollamaQueue.push({ messages, onChunk, onDone, onError });
  if (!ollamaBusy) processOllamaQueue();
}

async function processOllamaQueue() {
  if (ollamaQueue.length === 0) { ollamaBusy = false; return; }
  ollamaBusy = true;
  const { messages, onChunk, onDone, onError } = ollamaQueue.shift();
  try {
    const body = JSON.stringify({ model: OLLAMA_MODEL, stream: true, messages });
    const url  = new URL(`${OLLAMA_URL}/api/chat`);
    await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, res => {
        let full = '', buf = '';
        res.on('data', chunk => {
          buf += chunk.toString();
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.trim()) continue;
            let p; try { p = JSON.parse(line); } catch { continue; }
            const text = p?.message?.content || '';
            if (text) { full += text; onChunk && onChunk(text); }
          }
        });
        res.on('end', () => { onDone(full.trim()); resolve(); });
        res.on('error', e => { onError(e); resolve(); });
      });
      req.on('error', e => { onError(e); resolve(); });
      req.write(body); req.end();
    });
  } catch(e) { onError(e); }
  // Small pause between generations so Ollama breathes
  await sleep(500);
  processOllamaQueue();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Bot state ─────────────────────────────────────────────────────────────────
const botHistory  = new Map(); // nick → [{role,content}]
const botChannels = new Map(); // nick → current active channel

function getBotHistory(nick) {
  if (!botHistory.has(nick)) botHistory.set(nick, []);
  return botHistory.get(nick);
}

function addBotHistory(nick, role, content) {
  const h = getBotHistory(nick);
  h.push({ role, content });
  if (h.length > 30) h.splice(0, h.length - 30);
}

// ── Bot message generation ────────────────────────────────────────────────────
async function botSpeak(char, channel, contextMsg) {
  const hist = getBotHistory(char.nick);

  // Build context of recent channel messages
  const channelContext = contextMsg
    ? `Zadnje sporočilo v kanalu: <${contextMsg.from}> ${contextMsg.text}`
    : 'Kanal je trenutno tih.';

  const hour = new Date().getHours();
  const timeCtx = hour < 18 ? 'Popoldne, festival se šele začenja.' :
                  hour < 21 ? 'Večer, energija raste.' :
                  hour < 23 ? 'Nočni vrhunec, headliner igra.' :
                              'Pozna noč, utrujenost in evforija.';

  const systemMsg = `${char.personality}

Kontekst: Si na FREQUENCY festivalu v Avstriji. ${timeCtx} Si v kanalu ${channel}.
${channelContext}

PRAVILA:
- Napiši SAMO eno kratko sporočilo (max 12 besed) kot bi ga napisal v chat
- Brez pozdravov, brez uvoda
- Govori slovensko
- Bodi naraven, kot pravi človek na festivalu
- NE razlagaj sebe, samo reagiraj ali napiši kar ti pade na pamet
- Včasih ignoriraj kontekst in napiši kar si ravnokar doživel/a`;

  const messages = [
    { role: 'user', content: systemMsg },
    { role: 'assistant', content: 'Razumem.' },
    ...hist,
    { role: 'user', content: contextMsg
        ? `Reagiraj na sporočilo ali napiši kaj svojega.`
        : `Napiši kaj spontanega o festivalu.` }
  ];

  return new Promise((resolve) => {
    ollamaRequest(
      messages,
      null,
      (text) => {
        // Strip thinking tags if model outputs them
        const clean = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        addBotHistory(char.nick, 'assistant', clean);
        resolve(clean);
      },
      (err) => {
        console.error(`[bot:${char.nick}] ollama error:`, err.message);
        resolve(null);
      }
    );
  });
}

// ── Bot joining channels ──────────────────────────────────────────────────────
function initBots() {
  for (const char of AI_CHARACTERS) {
    const startCh = char.channels[0];
    const client = {
      type: 'bot',
      nick: char.nick,
      char,
      currentChannel: startCh,
    };
    clients.set(char.nick, client);
    for (const ch of char.channels) {
      ensureChannel(ch).add(char.nick);
    }
    botChannels.set(char.nick, startCh);
    console.log(`[bot] ${char.nick} → ${char.channels.join(', ')}`);
  }
  console.log(`[bot] ${AI_CHARACTERS.length} characters loaded`);
}

// ── Bot scheduler ─────────────────────────────────────────────────────────────
// Tracks last real-user message per channel for bots to react to
const lastUserMsg = new Map();

async function initialBurst() {
  // Fire a few characters in #mainstage quickly so chat is alive on first join
  const starters = AI_CHARACTERS.filter(c => c.channels.includes('#mainstage')).slice(0, 4);
  for (const char of starters) {
    await sleep(3000 + Math.random() * 5000);
    const text = await botSpeak(char, '#mainstage', null);
    if (!text) continue;
    broadcastChannel('#mainstage', { type:'typing', nick:char.nick, channel:'#mainstage' });
    await sleep(1500);
    broadcastChannel('#mainstage', { type:'message', from:char.nick, channel:'#mainstage', text, ts:ts(), isBot:true });
    console.log('[burst] ' + char.nick + ': ' + text);
  }
}

async function botLoop() {
  while (true) {
    // Pick 1-3 random bots to potentially speak
    const shuffled = [...AI_CHARACTERS].sort(() => Math.random() - 0.5);
    const active = shuffled.slice(0, Math.floor(Math.random() * 3) + 1);

    for (const char of active) {
      // Pick a random channel this bot is in
      const ch = char.channels[Math.floor(Math.random() * char.channels.length)];

      // 35% base chance to speak, higher if someone talked recently
      const recent = lastUserMsg.get(ch);
      const recentEnough = recent && (Date.now() - recent.ts < 120000);
      const chance = recentEnough ? 0.6 : 0.25;

      if (Math.random() > chance) continue;

      const contextMsg = recentEnough ? recent : null;
      const text = await botSpeak(char, ch, contextMsg);
      if (!text || text.length < 2) continue;

      // Broadcast as a normal message
      const payload = { type: 'message', from: char.nick, channel: ch, text, ts: ts(), isBot: true };
      broadcastChannel(ch, payload);
      console.log(`[bot] ${char.nick}@${ch}: ${text}`);

      // Small pause between individual bots speaking
      await sleep(2000 + Math.random() * 3000);
    }

    // Wait 25-70 seconds before next round
    const wait = 25000 + Math.random() * 45000;
    await sleep(wait);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getLocalIP() {
  for (const ifaces of Object.values(os.networkInterfaces()))
    for (const i of ifaces)
      if (i.family === 'IPv4' && !i.internal) return i.address;
  return '127.0.0.1';
}

function ts() {
  return new Date().toLocaleTimeString('sl-SI', { hour:'2-digit', minute:'2-digit', hour12:false });
}

function ensureChannel(name) {
  if (!channels.has(name)) channels.set(name, new Set());
  return channels.get(name);
}

function sendWS(client, obj) {
  try { if (client.type === 'ws' && client.socket.readyState === 1) client.socket.send(JSON.stringify(obj)); } catch(e) {}
}

function broadcastChannel(chName, obj, excludeNick = null) {
  const ch = channels.get(chName);
  if (!ch) return;
  for (const nick of ch) {
    if (nick === excludeNick) continue;
    const c = clients.get(nick);
    if (!c || c.type === 'bot') continue; // bots don't receive WS events
    if (c.type === 'ws') sendWS(c, obj);
    else if (c.type === 'irc' && obj.type === 'message')
      c.socket.write(`:${obj.from}!${obj.from}@fest PRIVMSG ${chName} :${obj.text}\r\n`);
  }
}

function removeClient(client) {
  if (!client.nick) return;
  for (const [chName, ch] of channels.entries()) {
    if (ch.has(client.nick)) {
      ch.delete(client.nick);
      broadcastChannel(chName, { type:'part', nick:client.nick, channel:chName });
    }
  }
  clients.delete(client.nick);
}

// ── WS Handler ────────────────────────────────────────────────────────────────
function handleWS(ws) {
  const client = { type:'ws', socket:ws, nick:null, ticket:null, id:++clientId };

  ws.on('message', async raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'validate_ticket') {
      const code = (msg.code||'').trim().toUpperCase();
      if (!VALID_TICKETS.has(code)) { sendWS(client, { type:'ticket_invalid', reason:'Napačna koda.' }); return; }
      client.ticket = code;
      sendWS(client, { type:'ticket_valid', code });
      return;
    }

    if (msg.type === 'register') {
      if (!client.ticket) { sendWS(client, { type:'error', text:'Najprej potrdi vstopnico.' }); return; }
      const nick = (msg.nick||'').trim().replace(/[^a-zA-Z0-9_\-]/g,'').slice(0,18);
      if (!nick || nick.length < 2) { sendWS(client, { type:'error', text:'Ime mora biti 2–18 znakov.' }); return; }
      if (clients.has(nick)) { sendWS(client, { type:'error', text:'Ime je zasedeno.' }); return; }
      client.nick = nick;
      clients.set(nick, client);
      sendWS(client, { type:'registered', nick, channels:FESTIVAL_CHANNELS });
      return;
    }

    if (!client.nick) return;

    if (msg.type === 'join') {
      const ch = ensureChannel(msg.channel);
      ch.add(client.nick);
      const sample = SAMPLE_HISTORY[msg.channel] || [];
      sendWS(client, { type:'joined', channel:msg.channel, names:[...ch], sampleHistory:sample });
      broadcastChannel(msg.channel, { type:'join', nick:client.nick, channel:msg.channel }, client.nick);
      return;
    }

    if (msg.type === 'part') {
      channels.get(msg.channel)?.delete(client.nick);
      broadcastChannel(msg.channel, { type:'part', nick:client.nick, channel:msg.channel });
      return;
    }

    if (msg.type === 'typing') {
      const { channel:chName } = msg;
      if (!chName) return;
      broadcastChannel(chName, { type:'typing', nick:client.nick, channel:chName }, client.nick);
      return;
    }

    if (msg.type === 'message') {
      const { channel:chName, text } = msg;
      if (!chName || !text?.trim()) return;
      const payload = { type:'message', from:client.nick, channel:chName, text:text.trim(), ts:ts() };
      broadcastChannel(chName, payload, client.nick);
      // Track for bot reactions
      lastUserMsg.set(chName, { from:client.nick, text:text.trim(), ts:Date.now() });
      return;
    }

    if (msg.type === 'names') {
      const ch = channels.get(msg.channel);
      if (ch) sendWS(client, { type:'names', channel:msg.channel, names:[...ch] });
    }
  });

  ws.on('close', () => removeClient(client));
  ws.on('error', () => removeClient(client));
}

// ── IRC Server ────────────────────────────────────────────────────────────────
const ircServer = net.createServer(socket => {
  const client = { type:'irc', socket, nick:null, id:++clientId, buffer:'' };
  socket.on('data', data => {
    client.buffer += data.toString();
    const lines = client.buffer.split('\n');
    client.buffer = lines.pop();
    for (const line of lines) {
      const l = line.trim(); if (!l) continue;
      const parts = l.split(' '), cmd = parts[0].toUpperCase();
      if (cmd==='NICK') { const n=parts[1]; if(n&&!clients.has(n)){client.nick=n;clients.set(n,client);} }
      else if (cmd==='USER') { socket.write(`:${SERVER_NAME} 001 ${client.nick} :Welcome\r\n`); }
      else if (cmd==='JOIN') { const ch=parts[1]; if(ch?.startsWith('#')){ensureChannel(ch).add(client.nick);socket.write(`:${client.nick}!u@irc JOIN :${ch}\r\n`);} }
      else if (cmd==='PRIVMSG') { const t=parts[1],tx=parts.slice(2).join(' ').replace(/^:/,''); if(t?.startsWith('#'))broadcastChannel(t,{type:'message',from:client.nick,channel:t,text:tx,ts:ts()},client.nick); }
      else if (cmd==='PING') socket.write(`PONG :${parts[1]||SERVER_NAME}\r\n`);
      else if (cmd==='QUIT') removeClient(client);
    }
  });
  socket.on('close', () => removeClient(client));
  socket.on('error', () => {});
});
ircServer.listen(IRC_PORT);

// ── HTTP + WS Server ──────────────────────────────────────────────────────────
const CLIENT_JS = require('fs').readFileSync(require('path').join(__dirname, 'app.js'), 'utf8');

const httpServer = http.createServer((req, res) => {
  if (req.url === '/app.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(CLIENT_JS);
    return;
  }
  res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8' });
  res.end(HTML);
});
const wss = new WebSocketServer({ server: httpServer });
wss.on('connection', handleWS);

httpServer.listen(HTTP_PORT, () => {
  const ip = getLocalIP();
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║      FREQUENCY · Festival Chat v2        ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Web  →  http://localhost:${HTTP_PORT}         ║`);
  console.log(`║  LAN  →  http://${ip}:${HTTP_PORT}     ║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  ${AI_CHARACTERS.length} AI characters loaded              ║`);
  console.log('║  Demo: TEST-0001 to TEST-0005            ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  // Start bots after short delay
  setTimeout(() => {
    initBots();
    // Kick off a round of activity in #mainstage immediately
    initialBurst();
    botLoop();
    console.log('[bot] Crowd is live');
  }, 2000);
});

// ── HTML ──────────────────────────────────────────────────────────────────────
const HTML = "<!DOCTYPE html>\n<html lang=\"sl\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, viewport-fit=cover\">\n<title>FREQUENCY \u00b7 Festival Chat</title>\n<link href=\"https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Syne+Mono&display=swap\" rel=\"stylesheet\">\n<style>\n*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}\n:root{\n  --black:#080809;--surface:#0f1012;--card:#141518;\n  --border:rgba(255,255,255,0.07);--border-bright:rgba(255,255,255,0.15);\n  --lime:#d4f244;--lime-dim:rgba(212,242,68,0.12);--lime-glow:rgba(212,242,68,0.25);\n  --orange:#ff6b2b;--pink:#ff2d78;\n  --text:#c8cad0;--text-dim:#585a62;--text-bright:#f0f1f5;\n  --radius:10px;--font:'Syne',sans-serif;--mono:'Syne Mono',monospace;\n}\nhtml,body{height:100%;overflow:hidden;background:var(--black);color:var(--text);font-family:var(--font);}\nbody::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:1000;\n  background-image:url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\");\n  opacity:0.022;mix-blend-mode:overlay;}\n.screen{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;transition:opacity 0.4s,transform 0.4s;}\n.screen.hidden{opacity:0;pointer-events:none;transform:translateY(16px);}\n#screen-ticket{background:var(--black);flex-direction:column;}\n.ticket-bg{position:absolute;inset:0;overflow:hidden;\n  background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(212,242,68,0.06) 0%,transparent 70%),\n             radial-gradient(ellipse 60% 40% at 80% 80%,rgba(255,45,120,0.05) 0%,transparent 60%);}\n.ticket-bg-lines{position:absolute;inset:0;\n  background-image:repeating-linear-gradient(0deg,transparent,transparent 60px,rgba(255,255,255,0.015) 60px,rgba(255,255,255,0.015) 61px);}\n.ticket-content{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:40px;padding:24px;}\n.brand-mark{text-align:center;animation:fadeUp 0.8s ease both;}\n.brand-mark .wordmark{font-size:clamp(52px,10vw,88px);font-weight:800;letter-spacing:-3px;color:var(--text-bright);line-height:1;}\n.brand-mark .wordmark span{color:var(--lime);}\n.brand-mark .tagline{font-size:12px;letter-spacing:4px;text-transform:uppercase;color:var(--text-dim);margin-top:8px;}\n.ticket-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:36px;width:min(420px,90vw);animation:fadeUp 0.8s 0.15s ease both;}\n.ticket-card h2{font-size:20px;font-weight:700;color:var(--text-bright);margin-bottom:6px;}\n.ticket-card p{font-size:13px;color:var(--text-dim);margin-bottom:24px;line-height:1.5;}\n.divider{display:flex;align-items:center;gap:12px;margin:20px 0;}\n.divider::before,.divider::after{content:'';flex:1;height:1px;background:var(--border);}\n.divider span{font-size:11px;color:var(--text-dim);letter-spacing:2px;text-transform:uppercase;}\n.input-group{display:flex;flex-direction:column;gap:10px;}\n.field-label{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-dim);}\n.field-input{background:var(--surface);border:1.5px solid var(--border);color:var(--text-bright);\n  font-family:var(--mono);font-size:15px;padding:12px 16px;border-radius:8px;outline:none;width:100%;\n  letter-spacing:2px;text-transform:uppercase;transition:border-color 0.2s;}\n.field-input::placeholder{color:var(--text-dim);letter-spacing:1px;text-transform:none;}\n.field-input:focus{border-color:var(--lime);}\n.field-input.error{border-color:var(--pink);animation:shake 0.4s ease;}\n.btn-primary{width:100%;padding:14px;background:var(--lime);color:#000;\n  font-family:var(--font);font-weight:700;font-size:14px;letter-spacing:1px;text-transform:uppercase;\n  border:none;border-radius:8px;cursor:pointer;transition:opacity 0.15s,transform 0.1s;margin-top:8px;}\n.btn-primary:hover{opacity:0.88;}\n.btn-primary:active{transform:scale(0.98);}\n.btn-primary:disabled{opacity:0.4;cursor:not-allowed;}\n.error-msg{font-size:12px;color:var(--pink);text-align:center;min-height:18px;}\n#screen-username{background:var(--black);flex-direction:column;}\n.username-content{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:32px;padding:24px;}\n.step-badge{background:var(--lime-dim);border:1px solid rgba(212,242,68,0.3);color:var(--lime);font-size:11px;letter-spacing:2px;padding:5px 14px;border-radius:100px;text-transform:uppercase;}\n.username-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:36px;width:min(420px,90vw);}\n.username-card h2{font-size:24px;font-weight:700;color:var(--text-bright);margin-bottom:6px;}\n.username-card p{font-size:13px;color:var(--text-dim);margin-bottom:24px;line-height:1.6;}\n.nick-preview{font-family:var(--mono);font-size:22px;color:var(--lime);text-align:center;padding:12px;min-height:52px;}\n.suggestions{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0;}\n.suggestion-chip{background:var(--surface);border:1px solid var(--border);color:var(--text-dim);\n  font-size:12px;font-family:var(--mono);padding:5px 12px;border-radius:100px;cursor:pointer;transition:all 0.15s;}\n.suggestion-chip:hover{border-color:var(--lime);color:var(--lime);background:var(--lime-dim);}\n.ticket-badge{display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:20px;}\n.ticket-badge .t-code{font-family:var(--mono);font-size:11px;color:var(--lime);letter-spacing:2px;}\n.ticket-badge .t-label{font-size:11px;color:var(--text-dim);}\n#screen-rooms{background:var(--black);flex-direction:column;overflow-y:auto;}\n.rooms-content{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:28px;padding:40px 24px;width:100%;}\n.rooms-header{text-align:center;}\n.rooms-header h1{font-size:clamp(28px,5vw,42px);font-weight:800;letter-spacing:-1px;color:var(--text-bright);}\n.rooms-header h1 span{color:var(--lime);}\n.rooms-header p{font-size:14px;color:var(--text-dim);margin-top:8px;}\n.greeting{font-size:14px;color:var(--text-dim);}\n.greeting strong{color:var(--lime);font-family:var(--mono);}\n.channels-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;width:min(860px,100%);}\n.channel-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;\n  cursor:pointer;transition:all 0.18s;display:flex;align-items:center;gap:16px;position:relative;overflow:hidden;}\n.channel-card::before{content:'';position:absolute;inset:0;background:var(--lime-dim);opacity:0;transition:opacity 0.18s;}\n.channel-card:hover{border-color:rgba(212,242,68,0.4);transform:translateY(-1px);}\n.channel-card:hover::before{opacity:1;}\n.channel-card.joined{border-color:rgba(212,242,68,0.5);background:rgba(212,242,68,0.04);}\n.ch-emoji{font-size:28px;flex-shrink:0;position:relative;}\n.ch-info{flex:1;position:relative;}\n.ch-name{font-weight:700;font-size:15px;color:var(--text-bright);font-family:var(--mono);}\n.ch-desc{font-size:12px;color:var(--text-dim);margin-top:3px;line-height:1.4;}\n.ch-count{font-size:11px;color:var(--lime);margin-top:6px;font-family:var(--mono);}\n.ch-arrow{color:var(--text-dim);font-size:18px;position:relative;transition:transform 0.18s;}\n.channel-card:hover .ch-arrow{transform:translateX(3px);color:var(--lime);}\n.enter-btn{background:var(--lime);color:#000;font-family:var(--font);font-weight:700;font-size:13px;\n  letter-spacing:1px;text-transform:uppercase;border:none;border-radius:8px;cursor:pointer;padding:12px 28px;transition:opacity 0.15s;}\n.enter-btn:hover{opacity:0.88;}\n.enter-btn:disabled{opacity:0.4;cursor:not-allowed;}\n#screen-chat{background:var(--black);flex-direction:row;align-items:stretch;overflow:hidden;}\n.sidebar{width:220px;flex-shrink:0;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;}\n.sidebar-top{padding:16px 14px 12px;border-bottom:1px solid var(--border);}\n.sidebar-logo{font-size:18px;font-weight:800;letter-spacing:-0.5px;color:var(--text-bright);}\n.sidebar-logo span{color:var(--lime);}\n.sidebar-nick{font-size:11px;color:var(--text-dim);font-family:var(--mono);margin-top:2px;}\n.sidebar-nick strong{color:var(--lime);}\n.sidebar-section{padding:8px 0;flex-shrink:0;}\n.sidebar-label{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--text-dim);padding:6px 14px 4px;}\n.ch-item{padding:7px 14px;cursor:pointer;font-size:13px;color:var(--text-dim);display:flex;align-items:center;gap:8px;\n  transition:all 0.12s;border-left:2px solid transparent;font-family:var(--mono);white-space:nowrap;overflow:hidden;}\n.ch-item:hover{color:var(--text);background:rgba(255,255,255,0.03);}\n.ch-item.active{color:var(--lime);border-left-color:var(--lime);background:var(--lime-dim);}\n.ch-item.unread{color:var(--text-bright);}\n.ch-item .ch-dot{width:6px;height:6px;border-radius:50%;background:var(--lime);flex-shrink:0;box-shadow:0 0 6px var(--lime);display:none;}\n.ch-item.unread .ch-dot{display:block;}\n.user-list{flex:1;overflow-y:auto;padding:0 0 8px;}\n.user-list::-webkit-scrollbar{width:2px;}\n.user-list::-webkit-scrollbar-thumb{background:var(--border);}\n.u-item{padding:3px 14px;font-size:11px;color:var(--text-dim);font-family:var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n.u-item.bot{color:#585a62;}\n.sidebar-footer{padding:10px 14px;border-top:1px solid var(--border);flex-shrink:0;}\n.leave-btn{font-size:11px;color:var(--text-dim);cursor:pointer;text-decoration:underline;background:none;border:none;font-family:var(--font);}\n.leave-btn:hover{color:var(--pink);}\n.chat-main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;}\n.chat-header{padding:12px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;background:var(--surface);flex-shrink:0;}\n.chat-channel-name{font-weight:700;font-size:16px;color:var(--text-bright);font-family:var(--mono);}\n.chat-channel-desc{font-size:12px;color:var(--text-dim);}\n.chat-online{margin-left:auto;font-size:11px;color:var(--lime);font-family:var(--mono);}\n.messages{flex:1;overflow-y:auto;padding:12px 0;scroll-behavior:smooth;}\n.messages::-webkit-scrollbar{width:3px;}\n.messages::-webkit-scrollbar-thumb{background:var(--border);}\n.msg-row{padding:3px 20px;display:flex;gap:0;align-items:baseline;line-height:1.5;}\n.msg-row:hover{background:rgba(255,255,255,0.018);}\n.msg-ts{font-size:10px;color:var(--text-dim);width:46px;flex-shrink:0;font-family:var(--mono);opacity:0.5;}\n.msg-nick{width:140px;flex-shrink:0;text-align:right;margin-right:12px;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--mono);}\n.msg-text{font-size:13.5px;color:var(--text-bright);flex:1;word-break:break-word;}\n.msg-row.system .msg-nick,.msg-row.system .msg-text{color:var(--text-dim);font-style:italic;font-size:12px;}\n.msg-row.join .msg-text{color:rgba(100,220,120,0.7);font-style:italic;font-size:12px;}\n.msg-row.part .msg-text{color:rgba(220,100,100,0.7);font-style:italic;font-size:12px;}\n.chat-input-bar{padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:10px;align-items:center;background:var(--surface);flex-shrink:0;}\n#chat-input{flex:1;background:var(--card);border:1.5px solid var(--border);color:var(--text-bright);\n  font-family:var(--font);font-size:14px;padding:10px 14px;border-radius:8px;outline:none;transition:border-color 0.2s;}\n#chat-input:focus{border-color:rgba(212,242,68,0.4);}\n#chat-input::placeholder{color:var(--text-dim);font-size:13px;}\n.send-btn{background:var(--lime);color:#000;border:none;border-radius:8px;padding:10px 18px;\n  font-family:var(--font);font-weight:700;font-size:12px;letter-spacing:0.5px;cursor:pointer;transition:opacity 0.15s,transform 0.1s;flex-shrink:0;}\n.send-btn:hover{opacity:0.88;}\n.send-btn:active{transform:scale(0.97);}\n.typing-bar{padding:3px 20px 6px;font-size:11px;color:var(--text-dim);font-style:italic;display:none;height:20px;font-family:var(--mono);}\n.typing-dots span{animation:tdot 1.2s infinite;opacity:0;}\n.typing-dots span:nth-child(1){animation-delay:0s;}\n.typing-dots span:nth-child(2){animation-delay:0.2s;}\n.typing-dots span:nth-child(3){animation-delay:0.4s;}\n@keyframes tdot{0%,60%,100%{opacity:0}30%{opacity:1}}\n@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}\n@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}\n@media(max-width:640px){\n  .sidebar{width:48px;}\n  .sidebar-top{padding:8px;}\n  .sidebar-logo,.sidebar-nick,.sidebar-label,.ch-item span:not(.ch-dot),.user-list,.sidebar-footer{display:none;}\n  .ch-item{padding:10px;justify-content:center;}\n}\n</style>\n</head>\n<body>\n\n<div id=\"screen-ticket\" class=\"screen\">\n  <div class=\"ticket-bg\"><div class=\"ticket-bg-lines\"></div></div>\n  <div class=\"ticket-content\">\n    <div class=\"brand-mark\">\n      <div class=\"wordmark\">FREQ<span>.</span></div>\n      <div class=\"tagline\">Festival \u00b7 Live Chat</div>\n    </div>\n    <div class=\"ticket-card\">\n      <h2>Vstopnica</h2>\n      <p>Vnesi kodo s svoje vstopnice ali potrditvenega emaila.</p>\n      <div class=\"input-group\">\n        <label class=\"field-label\">Koda vstopnice</label>\n        <input class=\"field-input\" id=\"ticket-input\" type=\"text\" placeholder=\"FREQ-2025-XXXXX\" autocomplete=\"off\" spellcheck=\"false\" maxlength=\"24\">\n        <div class=\"error-msg\" id=\"ticket-error\"></div>\n        <button class=\"btn-primary\" onclick=\"validateTicket()\">Potrdi vstopnico -&gt;</button>\n      </div>\n      <p style=\"font-size:11px;color:var(--text-dim);text-align:center;margin-top:16px;\">\n        Demo kode: <span style=\"font-family:var(--mono);color:var(--lime)\">TEST-0001</span> do <span style=\"font-family:var(--mono);color:var(--lime)\">TEST-0005</span>\n      </p>\n    </div>\n  </div>\n</div>\n\n<div id=\"screen-username\" class=\"screen hidden\">\n  <div class=\"ticket-bg\"><div class=\"ticket-bg-lines\"></div></div>\n  <div class=\"username-content\">\n    <div class=\"step-badge\">Korak 2 od 3 \u00b7 Izberi ime</div>\n    <div class=\"username-card\">\n      <h2>Kdo si nocoj?</h2>\n      <p>Izberi vzdevek za festival. Izgine ob polno\u010di \u2014 brez ra\u010dunov, brez sledenja.</p>\n      <div class=\"ticket-badge\">\n        <span>\ud83c\udf9f</span>\n        <div><div class=\"t-label\">Vstopnica potrjena</div><div class=\"t-code\" id=\"validated-code\"></div></div>\n      </div>\n      <div class=\"nick-preview\" id=\"nick-preview\">_</div>\n      <div class=\"input-group\">\n        <label class=\"field-label\">Tvoje ime</label>\n        <input class=\"field-input\" id=\"nick-input\" type=\"text\" placeholder=\"Vpi\u0161i ime...\" maxlength=\"18\"\n          autocomplete=\"off\" spellcheck=\"false\" oninput=\"updateNickPreview()\" style=\"text-transform:none;letter-spacing:normal;\">\n        <div class=\"error-msg\" id=\"nick-error\"></div>\n      </div>\n      <div class=\"suggestions\" id=\"nick-suggestions\"></div>\n      <button class=\"btn-primary\" onclick=\"registerNick()\" style=\"margin-top:16px;\">Vstopi v festival -&gt;</button>\n    </div>\n  </div>\n</div>\n\n<div id=\"screen-rooms\" class=\"screen hidden\">\n  <div class=\"ticket-bg\"><div class=\"ticket-bg-lines\"></div></div>\n  <div class=\"rooms-content\">\n    <div class=\"rooms-header\">\n      <p class=\"greeting\">\u017divjo, <strong id=\"rooms-nick\"></strong> \ud83d\udc4b</p>\n      <h1>Izberi <span>kanal</span></h1>\n      <p>Pridru\u017ei se kateremu koli. Vsaka soba je \u017eiva, zdaj.</p>\n    </div>\n    <div class=\"channels-grid\" id=\"channels-grid\"></div>\n    <button class=\"enter-btn\" id=\"enter-chat-btn\" onclick=\"enterChat()\" disabled>Vstopi v chat -&gt;</button>\n  </div>\n</div>\n\n<div id=\"screen-chat\" class=\"screen hidden\">\n  <div class=\"sidebar\">\n    <div class=\"sidebar-top\">\n      <div class=\"sidebar-logo\">FREQ<span>.</span></div>\n      <div class=\"sidebar-nick\">Ti si <strong id=\"sidebar-nick\"></strong></div>\n    </div>\n    <div class=\"sidebar-section\">\n      <div class=\"sidebar-label\">Kanali</div>\n      <div id=\"sidebar-channels\"></div>\n    </div>\n    <div class=\"sidebar-label\">V tem kanalu</div>\n    <div class=\"user-list\" id=\"sidebar-users\"></div>\n    <div class=\"sidebar-footer\">\n      <button class=\"leave-btn\" onclick=\"leaveToRooms()\">\u2190 Nazaj na kanale</button>\n    </div>\n  </div>\n  <div class=\"chat-main\">\n    <div class=\"chat-header\">\n      <span id=\"chat-emoji\" style=\"font-size:20px\"></span>\n      <div>\n        <div class=\"chat-channel-name\" id=\"chat-channel-name\"></div>\n        <div class=\"chat-channel-desc\" id=\"chat-channel-desc\"></div>\n      </div>\n      <div class=\"chat-online\" id=\"chat-online\"></div>\n    </div>\n    <div class=\"messages\" id=\"messages\"></div>\n    <div id=\"typing-bar\" class=\"typing-bar\"></div>\n    <div class=\"chat-input-bar\">\n      <input id=\"chat-input\" type=\"text\" placeholder=\"Napi\u0161i sporo\u010dilo...\" maxlength=\"400\"\n        onkeydown=\"if(event.key==='Enter')sendMsg()\" oninput=\"onChatInput()\">\n      <button class=\"send-btn\" onclick=\"sendMsg()\">Po\u0161lji</button>\n    </div>\n  </div>\n</div>\n\n<script src=\"/app.js\"></script>\n</body>\n</html>";



