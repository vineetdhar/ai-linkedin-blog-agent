# AI Trend Publisher — LangGraph LinkedIn Agent

A LangGraph-inspired agentic app that generates daily LinkedIn posts about the latest AI trends and publishes them automatically at 9:00 AM. Built with React + Vite on the frontend and a lightweight Node.js proxy to connect to Azure OpenAI.

---

## What It Does

Every time you run the agent, it goes through 5 pipeline nodes:

1. **🔍 Researcher** — asks the LLM to surface 5 trending AI topics from the current week
2. **📋 Curator** — parses and ranks the stories by relevance
3. **✍️ Writer** — drafts a plain, human-sounding LinkedIn post in British English
4. **🧠 Reviewer** — checks for AI-isms, em dashes, and unnatural phrasing
5. **🚀 Publisher** — queues the post for LinkedIn at 9:00 AM

The post is numbered 1–5, uses bold for key terms, avoids AI buzzwords, and is written in British English.

---

## Project Structure

```
AI Blog Agent/
├── src/
│   └── App.jsx          # Main React app (the agent UI)
├── proxy.cjs            # Node.js proxy server for Azure OpenAI
├── .env                 # Your Azure credentials (never commit this)
├── .gitignore
├── package.json
├── vite.config.js
└── README.md
```

---

## Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/) v18 or higher — check with `node --version`
- [Python 3.9+](https://www.python.org/) — for the visualisation script (optional)
- An **Azure OpenAI** resource with a deployed model (e.g. `gpt-4o`)

---

## Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-username/ai-blog-agent.git
cd ai-blog-agent
```

### 2. Install React app dependencies

```bash
npm install
```

### 3. Install proxy dependencies

The proxy is a separate Node.js script. Install its dependencies:

```bash
npm install express cors axios dotenv
```

### 4. Create your `.env` file

Create a file called `.env` in the root of the project (same folder as `proxy.cjs`):

```
AZURE_OPENAI_API_KEY=your-azure-api-key-here
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=your-deployment-name
```

You can find these values in the **Azure Portal**:
- Go to your Azure OpenAI resource
- **Keys and Endpoint** tab → copy Key 1 and the Endpoint URL
- **Model deployments → Manage Deployments** → copy your deployment name

> ⚠️ Never commit your `.env` file to GitHub. Make sure `.gitignore` includes `.env`.

---

## Running the App

The app requires **two terminals running at the same time** — one for the proxy and one for the React app.

### Terminal 1 — Start the proxy

The proxy sits between the browser and Azure OpenAI, bypassing browser CORS restrictions.

```bash
node proxy.cjs
```

You should see:

```
✅ Azure OpenAI proxy running on http://localhost:3001
```

> **Why is a proxy needed?** Browsers block direct API calls to Azure OpenAI due to CORS security rules. The proxy forwards requests from the browser to Azure on your behalf.

### Terminal 2 — Start the React app

```bash
npm run dev
```

Then open your browser at:

```
http://localhost:5173
```

---

## Using the App

1. Open **http://localhost:5173**
2. Check the top-right header — you should see a green **"Proxy connected"** badge
3. Go to the **🤖 Agent** tab
4. Click **▶ Run Agent Now**
5. Watch the 5 pipeline nodes light up as they run
6. When complete, the app automatically switches to the **📝 Post** tab
7. Review your generated LinkedIn post
8. Click **📋 Copy post** and paste it into LinkedIn

> Each run generates a completely fresh set of trending topics and a new post.

---

## Visualising the LangGraph Pipeline

To see a visual diagram of the agent graph, run the included Python script:

```bash
python visualise_graph.py
```

This will:
- Save `agent_graph.png` in your project folder — open it to see the node diagram
- Print a Mermaid diagram in the terminal

To view the Mermaid diagram interactively, copy the output and paste it at [mermaid.live](https://mermaid.live).

Or paste this directly into mermaid.live:

```
graph TD
    START([🚀 Start]) --> researcher
    researcher[🔍 Researcher] --> curator
    curator[📋 Curator] --> writer
    writer[✍️ Writer] --> reviewer
    reviewer[🧠 Reviewer] --> publisher
    publisher[🚀 Publisher] --> END([✅ End])

    style START fill:#7c3aed,color:#fff,stroke:none
    style END fill:#34d399,color:#fff,stroke:none
    style researcher fill:#1e1b4b,color:#a78bfa,stroke:#a78bfa
    style curator fill:#1e1b4b,color:#a78bfa,stroke:#a78bfa
    style writer fill:#1e1b4b,color:#a78bfa,stroke:#a78bfa
    style reviewer fill:#1e1b4b,color:#a78bfa,stroke:#a78bfa
    style publisher fill:#1e1b4b,color:#a78bfa,stroke:#a78bfa
```

---

## Post Style Guidelines

The agent is prompted to follow these rules on every run:

- Written in **British English** (organise, colour, whilst, recognise, etc.)
- Numbered list **1. through 5.**
- **Bold** key product names and concepts
- No em dashes
- No AI buzzwords (groundbreaking, game-changer, revolutionising, landscape, delve, etc.)
- Ends with a genuine question to spark engagement
- 3–4 relevant hashtags at the end
- Under 300 words

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Proxy offline` badge in the app | Run `node proxy.cjs` in a terminal |
| `require is not defined` error | Run `node proxy.cjs` not `node proxy.js` |
| `getaddrinfo ENOTFOUND` error | Check your `.env` — the endpoint still has placeholder values |
| `Cannot find module proxy.js` | You renamed to `.cjs` — run `node proxy.cjs` |
| Vite app shows default React page | Copy your app file: `copy ai-blog-agent_1.jsx src\App.jsx` |
| Topics don't change between runs | Each run calls the API fresh — topics are generated live each time |
| API version error | Set `AZURE_API_VERSION=2024-12-01-preview` in `.env` |

---

## .gitignore

Make sure your `.gitignore` includes:

```
.env
node_modules/
dist/
```

---

## Roadmap

- [ ] Auto-post to LinkedIn via LinkedIn API at 9:00 AM
- [ ] Full LangGraph Python backend with Tavily web search for real-time news
- [ ] Scheduling via cron or Python `schedule` library
- [ ] Support for additional LLM providers via backend proxy

---

## Tech Stack

- **Frontend** — React 18, Vite
- **LLM** — Azure OpenAI (GPT-4o)
- **Proxy** — Node.js, Express
- **Agent pattern** — LangGraph-inspired sequential pipeline
- **Styling** — inline CSS, Georgia serif

---

## License

MIT

---

## FOOTNOTE

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

---

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
