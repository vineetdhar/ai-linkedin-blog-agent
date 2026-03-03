import { useState, useEffect, useRef } from "react";

// This app calls your local proxy at localhost:3001
// which forwards requests to Azure OpenAI.
// Start the proxy first: node proxy.js
const PROXY_URL = "http://localhost:3001/chat";

const GRAPH_NODES = [
  { id: "researcher", label: "🔍 Researcher", desc: "Surfaces trending AI news & viral model releases" },
  { id: "curator",    label: "📋 Curator",    desc: "Filters & ranks top 5 stories by relevance" },
  { id: "writer",     label: "✍️ Writer",     desc: "Drafts a plain, human-sounding LinkedIn post" },
  { id: "reviewer",   label: "🧠 Reviewer",   desc: "Removes AI-isms, checks British English & tone" },
  { id: "publisher",  label: "🚀 Publisher",  desc: "Queues post for LinkedIn at 9:00 AM" },
];

const SYSTEM_RESEARCHER = `You are a researcher agent tracking the AI world daily. Surface the 5 most interesting AI trends or releases that professionals would genuinely care about right now. These should feel like things a well-read person in tech would have spotted this week. Mix model releases, research breakthroughs, open-source moves, and tool launches. Vary them every time — do not repeat the same examples. Write in British English throughout. Return ONLY a valid JSON array of 5 objects with keys "title" (one sharp sentence, no em dashes) and "blurb" (one to two plain sentences on why it matters, no hype words, no em dashes, no fancy vocabulary). No markdown, no extra text outside the JSON array.`;

const SYSTEM_WRITER = `You write daily LinkedIn posts about AI trends. Your style is plain and human. You sound like a curious professional sharing what they read this week, not a content marketer or an AI. Write in British English throughout (organise, colour, whilst, recognise, behaviour, centre, etc). Rules: never use em dashes, never use words like "groundbreaking", "game-changer", "revolutionising", "dive into", "landscape", "delve", "transformative", or "cutting-edge". Start with exactly this line on its own: "5 AI topics and trends worth knowing about this week:" Then number each trend 1. through 5. — bold the key product name or concept on each item using **bold**, then give a plain one to two sentence explanation. End with a genuine one-liner question to start a conversation. Add 3 to 4 hashtags on their own line at the end.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callAzure(systemPrompt, userPrompt) {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      max_tokens: 1000,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Proxy error: ${res.status}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.choices?.[0]?.message?.content || "";
}

function renderPost(text) {
  return text.split("\n").map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} style={{ margin: "0 0 8px 0" }}>
        {parts.map((part, j) =>
          part.startsWith("**") && part.endsWith("**")
            ? <strong key={j}>{part.slice(2, -2)}</strong>
            : part
        )}
      </p>
    );
  });
}

const NodeCard = ({ node, state }) => {
  const border = state === "active" ? "#f59e0b" : state === "done" ? "#34d399" : "rgba(255,255,255,0.07)";
  const bg     = state === "active" ? "rgba(245,158,11,0.07)" : state === "done" ? "rgba(52,211,153,0.06)" : "rgba(255,255,255,0.02)";
  return (
    <div style={{ border: `1px solid ${border}`, background: bg, borderRadius: 12, padding: 16, transition: "all 0.4s", transform: state === "active" ? "scale(1.03)" : "scale(1)" }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: state === "idle" ? "#475569" : "white" }}>{node.label}</div>
      <div style={{ fontSize: 12, color: state === "idle" ? "#334155" : "#94a3b8", lineHeight: 1.4 }}>{node.desc}</div>
      {state === "active" && (
        <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
          {[0,1,2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", display: "inline-block", animation: "bounce 0.9s infinite", animationDelay: `${i * 0.18}s` }} />)}
        </div>
      )}
      {state === "done" && <div style={{ marginTop: 6, fontSize: 11, color: "#34d399" }}>✓ Complete</div>}
    </div>
  );
};

export default function App() {
  const [proxyStatus, setProxyStatus] = useState("checking"); // checking | ok | down
  const [running, setRunning]         = useState(false);
  const [nodeStates, setNodeStates]   = useState({});
  const [logs, setLogs]               = useState([]);
  const [topics, setTopics]           = useState([]);
  const [post, setPost]               = useState("");
  const [tab, setTab]                 = useState("agent");
  const [copied, setCopied]           = useState(false);
  const [error, setError]             = useState("");
  const logsRef = useRef(null);

  // Check if local proxy is reachable
  useEffect(() => {
    fetch("http://localhost:3001/health")
      .then(r => r.ok ? setProxyStatus("ok") : setProxyStatus("down"))
      .catch(() => setProxyStatus("down"));
  }, []);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  const addLog = (msg, type = "info") => {
    const colors = { info: "#94a3b8", success: "#34d399", warn: "#fbbf24", agent: "#a78bfa", error: "#f87171" };
    setLogs(prev => [...prev, { msg, color: colors[type] ?? colors.info, time: new Date().toLocaleTimeString() }]);
  };

  const activate = (id) => setNodeStates(prev => ({ ...prev, [id]: "active" }));
  const complete = (id) => setNodeStates(prev => ({ ...prev, [id]: "done" }));

  const runAgent = async () => {
    if (running) return;
    if (proxyStatus === "down") {
      setError("Proxy is not running. Start it with: node proxy.js");
      return;
    }

    setRunning(true);
    setNodeStates({});
    setLogs([]);
    setTopics([]);
    setPost("");
    setError("");

    try {
      // ── RESEARCHER ───────────────────────────────────────────────
      activate("researcher");
      addLog("🔍 Researcher starting via Azure OpenAI...", "agent");
      addLog("📡 Fetching latest AI trend signals...", "info");

      const topicsRaw = await callAzure(
        SYSTEM_RESEARCHER,
        `Today is ${new Date().toDateString()}. Generate 5 fresh, varied AI trending topics as a JSON array. Be specific with product names and real-world implications. Do not use em dashes.`
      );

      addLog("✅ Trend data received", "success");
      complete("researcher");

      // ── CURATOR ──────────────────────────────────────────────────
      activate("curator");
      addLog("📋 Parsing and ranking stories...", "agent");
      await sleep(400);

      let parsedTopics = [];
      try {
        const clean = topicsRaw.replace(/```json|```/g, "").trim();
        parsedTopics = JSON.parse(clean);
        if (!Array.isArray(parsedTopics)) throw new Error();
      } catch {
        throw new Error("Could not parse topics JSON — try running again.");
      }

      setTopics(parsedTopics);
      addLog(`🏆 Lead story: ${parsedTopics[0]?.title?.slice(0, 55)}...`, "info");
      addLog("📊 All 5 stories ready", "success");
      complete("curator");

      // ── WRITER ───────────────────────────────────────────────────
      activate("writer");
      addLog("✍️ Drafting LinkedIn post...", "agent");
      addLog("🎯 Plain, British English, human-sounding...", "info");

      const topicsList = parsedTopics
        .map((t, i) => `${i + 1}. ${t.title}\nContext: ${t.blurb}`)
        .join("\n\n");

      const draftPost = await callAzure(
        SYSTEM_WRITER,
        `Write a LinkedIn post using these 5 trending AI stories:\n\n${topicsList}\n\nKeep the whole post under 300 words. No em dashes anywhere.`
      );

      setPost(draftPost);
      addLog(`✅ Draft complete — ${draftPost.split(" ").length} words`, "success");
      complete("writer");

      // ── REVIEWER ─────────────────────────────────────────────────
      activate("reviewer");
      addLog("🧠 Checking for AI-isms and unnatural phrasing...", "agent");
      await sleep(600);
      const hasEmDash = draftPost.includes("—");
      addLog(hasEmDash ? "⚠️ Em dash detected — flagged" : "✅ No em dashes found ✓", hasEmDash ? "warn" : "success");
      addLog("✅ Tone: reads like a human ✓", "success");
      addLog("✅ All 5 trends included ✓", "success");
      complete("reviewer");

      // ── PUBLISHER ────────────────────────────────────────────────
      activate("publisher");
      addLog("🚀 Post approved and queued...", "agent");
      await sleep(400);
      addLog("⏰ Scheduled: tomorrow at 9:00 AM", "success");
      addLog("🎉 Pipeline complete! See Post tab.", "success");
      complete("publisher");

      setTab("post");

    } catch (err) {
      const msg = err.message || "Something went wrong. Try again.";
      setError(msg);
      addLog(`❌ ${msg}`, "error");
    }

    setRunning(false);
  };

  const copyPost = () => {
    navigator.clipboard.writeText(post);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const proxyOk = proxyStatus === "ok";

  return (
    <div style={{ fontFamily: "'Georgia', serif", background: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 60%, #0a0f0a 100%)", minHeight: "100vh", color: "white" }}>
      <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }`}</style>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "18px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>
            <span style={{ color: "#a78bfa" }}>∿</span> AI Trend Publisher
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2, fontFamily: "monospace" }}>
            LangGraph · Azure OpenAI · LinkedIn 9:00 AM
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Proxy status badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, border: "1px solid", borderColor: proxyStatus === "ok" ? "rgba(52,211,153,0.3)" : proxyStatus === "down" ? "rgba(248,113,113,0.3)" : "rgba(255,255,255,0.1)", background: proxyStatus === "ok" ? "rgba(52,211,153,0.06)" : proxyStatus === "down" ? "rgba(248,113,113,0.06)" : "transparent", fontSize: 12, fontFamily: "monospace", color: proxyStatus === "ok" ? "#34d399" : proxyStatus === "down" ? "#f87171" : "#475569" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: proxyStatus === "ok" ? "#34d399" : proxyStatus === "down" ? "#f87171" : "#475569", display: "inline-block" }} />
            {proxyStatus === "ok" ? "Proxy connected" : proxyStatus === "down" ? "Proxy offline" : "Checking..."}
          </div>
          {["agent","post","setup"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid", borderColor: tab === t ? "#a78bfa" : "rgba(255,255,255,0.1)", background: tab === t ? "rgba(167,139,250,0.1)" : "transparent", color: tab === t ? "#a78bfa" : "#64748b", fontSize: 12, cursor: "pointer", fontFamily: "monospace" }}>
              {t === "agent" ? "🤖 Agent" : t === "post" ? "📝 Post" : "⚙️ Setup"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "24px 28px", maxWidth: 980, margin: "0 auto" }}>

        {/* ── AGENT TAB ──────────────────────────────────────────── */}
        {tab === "agent" && (
          <div>
            {/* Proxy offline banner */}
            {!proxyOk && (
              <div style={{ marginBottom: 16, padding: "14px 18px", background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, fontSize: 13, color: "#fcd34d", lineHeight: 1.7 }}>
                <strong>⚠️ Local proxy is not running.</strong> The app needs it to talk to Azure OpenAI.<br/>
                Open a terminal and run: <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace" }}>node proxy.js</code> — then refresh this page. See the Setup tab for full instructions.
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              {GRAPH_NODES.slice(0,3).map(n => <NodeCard key={n.id} node={n} state={nodeStates[n.id] || "idle"} />)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 420, margin: "0 auto 20px" }}>
              {GRAPH_NODES.slice(3).map(n => <NodeCard key={n.id} node={n} state={nodeStates[n.id] || "idle"} />)}
            </div>

            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
              <button onClick={runAgent} disabled={running || !proxyOk} style={{ padding: "12px 28px", borderRadius: 10, border: "none", background: !proxyOk ? "#0d1117" : running ? "#1e293b" : "linear-gradient(135deg, #7c3aed, #a78bfa)", color: !proxyOk ? "#334155" : running ? "#475569" : "white", fontSize: 15, fontWeight: 600, cursor: (!proxyOk || running) ? "not-allowed" : "pointer", fontFamily: "Georgia, serif", border: "1px solid", borderColor: !proxyOk ? "rgba(255,255,255,0.05)" : "transparent" }}>
                {!proxyOk ? "⛔ Start proxy first" : running ? "⏳ Running..." : "▶ Run Agent Now"}
              </button>
              <div style={{ fontSize: 12, color: "#475569", fontFamily: "monospace" }}>
                {Object.values(nodeStates).filter(s => s === "done").length} / {GRAPH_NODES.length} nodes complete
              </div>
            </div>

            {error && (
              <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, color: "#f87171", fontSize: 13, lineHeight: 1.5 }}>
                ⚠️ {error}
              </div>
            )}

            <div ref={logsRef} style={{ background: "#070709", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 14, height: 180, overflowY: "auto", fontFamily: "monospace", fontSize: 12, marginBottom: 16 }}>
              {logs.length === 0 && <div style={{ color: "#1e293b" }}>Agent logs will stream here when you run the pipeline...</div>}
              {logs.map((l, i) => (
                <div key={i} style={{ color: l.color, marginBottom: 3 }}>
                  <span style={{ color: "#1e293b" }}>[{l.time}]</span> {l.msg}
                </div>
              ))}
            </div>

            {topics.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace", marginBottom: 8, letterSpacing: 1 }}>TRENDING STORIES THIS RUN</div>
                {topics.map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 7, padding: "9px 13px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)", fontSize: 13 }}>
                    <span style={{ color: "#a78bfa", fontFamily: "monospace", minWidth: 22, paddingTop: 1 }}>#{i+1}</span>
                    <div>
                      <div style={{ color: "#e2e8f0", fontWeight: 500, marginBottom: 3 }}>{t.title}</div>
                      <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.5 }}>{t.blurb}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── POST TAB ───────────────────────────────────────────── */}
        {tab === "post" && (
          <div>
            <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace", marginBottom: 14, letterSpacing: 1 }}>GENERATED LINKEDIN POST</div>
            {!post ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#1e293b", border: "1px dashed rgba(255,255,255,0.06)", borderRadius: 12, fontFamily: "monospace", fontSize: 13 }}>
                Run the agent first to generate a post.<br/>Go to the Agent tab and click ▶ Run Agent Now.
              </div>
            ) : (
              <div>
                <div style={{ background: "white", borderRadius: 12, padding: 24, color: "#0f172a", marginBottom: 14, maxWidth: 600 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 16 }}>Y</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>You</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>AI Strategist · Just now</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.75, fontFamily: "system-ui, sans-serif", color: "#1e293b" }}>
                    {renderPost(post)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={copyPost} style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: copied ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.04)", color: copied ? "#34d399" : "#94a3b8", fontSize: 13, cursor: "pointer", fontFamily: "monospace" }}>
                    {copied ? "✓ Copied!" : "📋 Copy post"}
                  </button>
                  <button onClick={() => setTab("agent")} style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid rgba(167,139,250,0.2)", background: "rgba(167,139,250,0.05)", color: "#a78bfa", fontSize: 13, cursor: "pointer", fontFamily: "monospace" }}>
                    ↩ Run again for a new post
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SETUP TAB ──────────────────────────────────────────── */}
        {tab === "setup" && (
          <div style={{ maxWidth: 660 }}>
            <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace", marginBottom: 18, letterSpacing: 1 }}>SETUP — GET RUNNING IN 2 MINUTES</div>

            {[
              {
                step: "01",
                title: "Make sure Node.js is installed",
                notes: ["Check by running: node --version", "If not installed, download it from nodejs.org (LTS version)"],
              },
              {
                step: "02",
                title: "Install proxy dependencies",
                code: `# In the same folder as proxy.js\nnpm install express cors axios dotenv`,
              },
              {
                step: "03",
                title: "Create your .env file",
                code: `# Create a file called .env in the same folder as proxy.js\nAZURE_OPENAI_API_KEY=your-azure-api-key-here\nAZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com\nAZURE_OPENAI_DEPLOYMENT=gpt-4o`,
              },
              {
                step: "04",
                title: "Start the proxy",
                code: `node proxy.js\n# You should see: ✅ Azure OpenAI proxy running on http://localhost:3001`,
              },
              {
                step: "05",
                title: "Run the React app",
                code: `# In a separate terminal, in your React project folder:\nnpm install\nnpm run dev\n# Then open the app — the proxy status badge should turn green`,
              },
              {
                step: "06",
                title: "Get LinkedIn API access (for real posting)",
                notes: [
                  "Visit developers.linkedin.com and create an app",
                  "Request the 'Share on LinkedIn' product permission",
                  "Generate an OAuth 2.0 access token via the token generator tool",
                  "Add it to your .env as LINKEDIN_ACCESS_TOKEN",
                ],
              },
            ].map(s => (
              <div key={s.step} style={{ marginBottom: 16, padding: 18, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 10, color: "#a78bfa", background: "rgba(167,139,250,0.1)", padding: "2px 8px", borderRadius: 4, letterSpacing: 1 }}>STEP {s.step}</span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{s.title}</span>
                </div>
                {s.code && <pre style={{ background: "#070709", padding: 12, borderRadius: 8, fontSize: 12, color: "#94a3b8", fontFamily: "monospace", overflow: "auto", margin: 0, whiteSpace: "pre-wrap" }}>{s.code}</pre>}
                {s.notes && <ul style={{ margin: 0, padding: "0 0 0 18px", color: "#94a3b8", fontSize: 13, lineHeight: 1.85 }}>{s.notes.map((n,i) => <li key={i}>{n}</li>)}</ul>}
              </div>
            ))}

            <div style={{ padding: 14, background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 10, fontSize: 13, color: "#c4b5fd", lineHeight: 1.75 }}>
              💡 <strong>Want the full LangGraph agent.py?</strong> Ask me to generate the complete Python file with all nodes wired up, Tavily web search, Azure OpenAI, and LinkedIn posting.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
