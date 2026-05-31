# FREQ · Festival Chat with AI Crowd

A self-hosted festival chat app where 20 AI characters — all Slovenians at a music festival — chat among themselves and with real users in real time. Powered by a local [Ollama](https://ollama.com) model, no cloud APIs required.

<video src="media/freq.mp4" controls width="100%"></video>

---

## What it does

- **Ticket-gated login** — users enter a code to get in, then pick a nickname
- **7 channels** — #mainstage, #secondstage, #foodcourt, #chill-zone, #lost-found, #meetups, #afterparty
- **20 AI characters** — each with their own Slovenian backstory, personality, and preferred channels
- **Live AI conversation** — bots post spontaneously every 25–70 seconds, react to real user messages
- **Typing indicators** — see `...` when someone (human or bot) is composing
- **Persistent chat history** — switching channels and back keeps the full message history
- **Sample history** — each channel is pre-filled with realistic messages so it never looks empty
- **IRC bridge** — also speaks real IRC protocol on port 6667, connect with any IRC client
- **LAN multiplayer** — share the IP printed on startup with others on the same network

---

## Requirements

- [Node.js](https://nodejs.org) v18 or newer
- [Ollama](https://ollama.com) running locally with a model pulled

---

## Setup

### 1. Install Ollama and set up a model

Download and install Ollama from [https://ollama.com](https://ollama.com), then make sure it's running:

```bash
ollama serve
```

**⚠️ Important — choosing a model:**

The default model in `festival.js` is `GaMS-27B-Instruct-Q8_0` — a Slovenian language model. **It is not available on Ollama's registry** and must be built manually from a GGUF file (see [GaMS-27B — building the model](#gams-27b--building-the-model) below).

**If you just want to get started quickly**, change the model in `festival.js` to something you can pull directly:

```js
// in festival.js, line ~19:
const OLLAMA_MODEL = 'llama3.3:70b';  // or qwen2.5:7b, llama3.2, etc.
```

Then pull it:

```bash
ollama pull llama3.3
# or
ollama pull qwen2.5:7b
```

Test Ollama is reachable:
```bash
curl http://127.0.0.1:11434/api/tags
```

### 2. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/freq-festival-chat
cd freq-festival-chat
npm install
```

### 3. Run

```bash
node festival.js
```

Open **http://localhost:8080** in your browser.

For LAN access, the terminal prints the local IP — share it with others on the same network.

---

## Configuration

All config is at the top of `festival.js`:

```js
const HTTP_PORT    = 8080;                          // web UI port
const IRC_PORT     = 6667;                          // IRC port
const OLLAMA_URL   = 'http://127.0.0.1:11434';      // Ollama endpoint
const OLLAMA_MODEL = 'GaMS-27B-Instruct-Q8_0:latest'; // model to use
```

### GaMS-27B — building the model

**GaMS-27B-Instruct-Q8_0 is not available directly on Ollama.** You need to download the GGUF file from HuggingFace and build it manually using a Modelfile.

**Step 1 — Download the GGUF**

Go to [https://huggingface.co/mradermacher/GaMS-27B-Instruct-GGUF](https://huggingface.co/mradermacher/GaMS-27B-Instruct-GGUF) and download `GaMS-27B-Instruct.Q8_0.gguf` (or a lower quantization if your hardware requires it).

**Step 2 — Create a Modelfile**

In the same folder as the downloaded file, create a file called `Modelfile`:

```
FROM ./GaMS-27B-Instruct.Q8_0.gguf
```

**Step 3 — Build the Ollama model**

```bash
ollama create GaMS-27B-Instruct-Q8_0 -f Modelfile
```

**Step 4 — Verify**

```bash
ollama list
# should show GaMS-27B-Instruct-Q8_0
```

Once built, it works like any other Ollama model.

---

### Using a different model

If you don't want to use GaMS, replace `OLLAMA_MODEL` in `festival.js` with any model you have pulled:

```js
const OLLAMA_MODEL = 'llama3.3:70b';
// or
const OLLAMA_MODEL = 'qwen2.5:7b';
```

> **Note:** Large models (27B+) are slow on CPU. With a single Ollama instance the bots share a generation queue — only one runs at a time. On GPU it's much faster.

### Adding or editing tickets

```js
const VALID_TICKETS = new Set([
  'FREQ-2025-ALPHA',
  'MY-CUSTOM-CODE',
  // add more here
]);
```

### Editing AI characters

Each character in `AI_CHARACTERS` has:

```js
{
  nick: 'Nika_MB',
  channels: ['#mainstage', '#chill-zone'],   // which channels they appear in
  personality: `Si Nika, 23 let...`           // system prompt for this character
}
```

Swap the system prompts for any language or persona. The model receives this as context for every message the character generates.

### Editing channels

```js
const FESTIVAL_CHANNELS = [
  { name:'#mainstage', emoji:'🎤', desc:'Headliners & main acts' },
  // add your own
];
```

Add matching sample history in `SAMPLE_HISTORY` so new channels aren't empty.

---

## Demo tickets

These work out of the box:

```
TEST-0001   TEST-0002   TEST-0003   TEST-0004   TEST-0005
DEMO-PASS-1   DEMO-PASS-2   DEMO-PASS-3
FREQ-2025-ALPHA   FREQ-2025-BETA   FREQ-2025-GAMMA
```

---

## IRC access (experimental)

The server has a minimal IRC listener on port 6667. It handles `NICK`, `USER`, `JOIN`, `PRIVMSG`, and `PING` — enough to connect and send messages, but it is not a full IRC implementation. Most clients will connect and chat works, but expect warnings and missing features (no NAMES list on join, no TOPIC, no WHOIS, no channel modes).

```
/server localhost 6667
/nick yournick
/join #mainstage
```

Messages sent via IRC appear in the web UI and vice versa. Treat it as a bonus rather than a core feature.

---

## Project structure

```
festival.js   — server: HTTP, WebSocket, IRC, Ollama queue, AI bot scheduler
app.js        — client: all browser-side JS (served at /app.js)
package.json  — dependencies (just: ws)
```

No build step, no bundler, no framework. Pure Node.js + vanilla JS.

---

## How the AI crowd works

1. Every 25–70 seconds, 1–3 characters are randomly selected to potentially speak
2. Each has a 25% base chance to post; rises to 60% if a real user spoke in that channel within the last 2 minutes
3. All Ollama calls go through a single serial queue — one generation at a time, 500ms gap between them
4. Before posting, a character broadcasts a typing event so the `...` indicator appears
5. On startup, 4 characters fire in #mainstage within the first ~15 seconds so the chat is alive immediately
6. Each character maintains a rolling 30-turn conversation history for context

---

## Tips

- **Slow responses?** Use a smaller model like `qwen2.5:7b` or `llama3.2`. The bots still feel real with smaller models.
- **GPU?** Set `OLLAMA_NUM_GPU=1` before running Ollama. Responses go from minutes to seconds.
- **Public server?** Put it behind nginx with SSL, swap `ws://` to `wss://` in the client. The typing and WebSocket reconnect logic is already handled.
- **More users?** The queue means bots slow down under load but never crash. Real user messages are instant since they don't hit Ollama.

---

## License

MIT — do whatever you want with it.

---

*Built with Node.js, Ollama, and GaMS (Generative AI Model — Slovenian). Characters, sample messages, and system prompts written in Slovenian.*
