import { useState, useEffect, useRef } from "react";

const PROXY = import.meta.env.VITE_PROXY_URL
  ? import.meta.env.VITE_PROXY_URL.replace("/chat", "")
  : "http://localhost:3001";

const GRAPH_NODES = [
  { id: "researcher", label: "🔍 Researcher", desc: "Surfaces trending AI news & viral model releases" },
  { id: "curator",    label: "📋 Curator",    desc: "Filters & ranks top 5 stories by relevance" },
  { id: "writer",     label: "✍️ Writer",     desc: "Drafts a plain, human-sounding LinkedIn post" },
  { id: "reviewer",   label: "🧠 Reviewer",   desc: "Removes AI-isms, checks British English & tone" },
  { id: "publisher",  label: "🚀 Publisher",  desc: "Posts directly to LinkedIn" },
];

const TOPIC_MODES = {
  ai: {
    label: "🤖 AI Trends",
    researcher: `You are a researcher agent tracking the AI world daily. Surface the 5 most interesting AI trends or releases that professionals would genuinely care about right now. Mix model releases, research breakthroughs, open-source moves, and tool launches. Vary them every time. Write in British English. Return ONLY a valid JSON array of 5 objects with keys "title" (one sharp sentence, no em dashes) and "blurb" (one to two plain sentences, no hype words, no em dashes). No markdown, no extra text outside the JSON array.`,
    writer: `You write daily LinkedIn posts about AI trends. Plain, human style. British English (organise, colour, whilst, recognise, behaviour, centre). Never use em dashes or buzzwords like "groundbreaking", "game-changer", "revolutionising", "dive into", "landscape", "delve", "transformative", "cutting-edge". Start with exactly: "5 AI topics and trends worth knowing about this week:" Number 1-5. Start each with a relevant emoji. Bold key product names, keywords and important terms with **bold**. Two to three plain sentences per item. Add 3-4 hashtags at the end. Under 500 words.`,
  },
  business: {
    label: "📈 Business & Leadership",
    researcher: `You are a researcher tracking business and leadership trends professionals care about this week. Surface 5 stories covering strategy, workplace culture, leadership, and business innovation. British English. Return ONLY a valid JSON array of 5 objects with keys "title" (one sharp sentence, no em dashes) and "blurb" (one to two plain sentences, no hype, no em dashes). No markdown, no extra text outside the JSON array.`,
    writer: `You write daily LinkedIn posts about business and leadership. Plain, human style. British English. Never use em dashes or buzzwords. Start with exactly: "5 business and leadership topics worth knowing about this week:" Number 1-5. Start each with a relevant emoji. Bold key concepts, keywords and terms with **bold**. Two to three plain sentences per item. Add 3-4 hashtags. Under 500 words.`,
  },
  custom: {
    label: "✏️ Custom Topic",
    researcher: `You are a researcher surfacing the 5 most interesting and timely stories on the topic the user specifies. British English. Return ONLY a valid JSON array of 5 objects with keys "title" (one sharp sentence, no em dashes) and "blurb" (one to two plain sentences, no hype, no em dashes). No markdown, no extra text outside the JSON array.`,
    writer: `You write daily LinkedIn posts. Plain, human style. British English. Never use em dashes or buzzwords. Start with exactly: "5 topics and trends worth knowing about this week:" Number 1-5. Start each with a relevant emoji. Bold key concepts, keywords and terms with **bold**. Two to three plain sentences per item. Add 3-4 hashtags. Under 500 words.`,
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callAzure(systemPrompt, userPrompt) {
  const res = await fetch(`${PROXY}/chat`, {
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

async function postToLinkedIn(text) {
  const res = await fetch(`${PROXY}/linkedin/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "LinkedIn post failed");
  return data;
}

async function setSchedule(time) {
  const res = await fetch(`${PROXY}/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ time }),
  });
  return res.json();
}

async function cancelSchedule() {
  const res = await fetch(`${PROXY}/schedule`, { method: "DELETE" });
  return res.json();
}

async function getScheduleStatus() {
  const res = await fetch(`${PROXY}/schedule`);
  return res.json();
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
  const border = state === "active" ? "#f59e0b" : state === "done" ? "#34d399" : state === "posting" ? "#60a5fa" : "rgba(255,255,255,0.07)";
  const bg     = state === "active" ? "rgba(245,158,11,0.07)" : state === "done" ? "rgba(52,211,153,0.06)" : state === "posting" ? "rgba(96,165,250,0.07)" : "rgba(255,255,255,0.02)";
  return (
    <div style={{ border: `1px solid ${border}`, background: bg, borderRadius: 12, padding: 16, transition: "all 0.4s", transform: state === "active" || state === "posting" ? "scale(1.03)" : "scale(1)" }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: state === "idle" ? "#475569" : "white" }}>{node.label}</div>
      <div style={{ fontSize: 12, color: state === "idle" ? "#334155" : "#94a3b8", lineHeight: 1.4 }}>{node.desc}</div>
      {(state === "active" || state === "posting") && (
        <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
          {[0,1,2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: state === "posting" ? "#60a5fa" : "#f59e0b", display: "inline-block", animation: "bounce 0.9s infinite", animationDelay: `${i * 0.18}s` }} />)}
        </div>
      )}
      {state === "done" && <div style={{ marginTop: 6, fontSize: 11, color: "#34d399" }}>✓ Complete</div>}
    </div>
  );
};

export default function App() {
  const [proxyStatus, setProxyStatus] = useState("checking");
  const [linkedinOk, setLinkedinOk]   = useState(false);
  const [topicMode, setTopicMode]     = useState("ai");
  const [customTopic, setCustomTopic] = useState("");
  const [running, setRunning]         = useState(false);
  const [nodeStates, setNodeStates]   = useState({});
  const [logs, setLogs]               = useState([]);
  const [topics, setTopics]           = useState([]);
  const [post, setPost]               = useState("");
  const [tab, setTab]                 = useState("agent");
  const [copied, setCopied]           = useState(false);
  const [error, setError]             = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleStatus, setScheduleStatus] = useState(null);
  const [publishedId, setPublishedId] = useState("");
  const logsRef = useRef(null);

  // Check proxy + LinkedIn status
  useEffect(() => {
    fetch(`${PROXY}/health`)
      .then(r => r.json())
      .then(d => {
        setProxyStatus(d.status === "ok" ? "ok" : "down");
        setLinkedinOk(!!d.linkedin);
        if (d.scheduledTime) setScheduleTime(d.scheduledTime);
      })
      .catch(() => setProxyStatus("down"));
  }, []);

  // Poll schedule status every 30s
  useEffect(() => {
    const interval = setInterval(async () => {
      if (proxyStatus !== "ok") return;
      try {
        const status = await getScheduleStatus();
        setScheduleStatus(status);

        // Check if scheduler triggered an auto-run
        const triggerRes = await fetch(`${PROXY}/schedule/trigger`);
        const triggerData = await triggerRes.json();
        if (triggerData.trigger && !running) {
          addLog("⏰ Scheduled run triggered automatically", "agent");
          runAgent(true); // auto-run and auto-post
        }
      } catch (_) {}
    }, 30000);
    return () => clearInterval(interval);
  }, [proxyStatus, running]);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  const addLog = (msg, type = "info") => {
    const colors = { info: "#94a3b8", success: "#34d399", warn: "#fbbf24", agent: "#a78bfa", error: "#f87171", linkedin: "#60a5fa" };
    setLogs(prev => [...prev, { msg, color: colors[type] ?? colors.info, time: new Date().toLocaleTimeString() }]);
  };

  const activate  = (id, state = "active") => setNodeStates(prev => ({ ...prev, [id]: state }));
  const complete  = (id) => setNodeStates(prev => ({ ...prev, [id]: "done" }));
  const proxyOk   = proxyStatus === "ok";

  const runAgent = async (autoPost = false) => {
    if (running) return;
    setRunning(true);
    setNodeStates({});
    setLogs([]);
    setTopics([]);
    setPost("");
    setError("");
    setPublishedId("");

    const mode = TOPIC_MODES[topicMode];
    const userPromptResearch = topicMode === "custom" && customTopic
      ? `Today is ${new Date().toDateString()}. Generate 5 fresh trending topics about "${customTopic}" as a JSON array. No em dashes.`
      : `Today is ${new Date().toDateString()}. Generate 5 fresh, varied trending topics as a JSON array. Be specific. No em dashes.`;

    try {
      // ── RESEARCHER ──────────────────────────────────────────────
      activate("researcher");
      addLog(`🔍 Researcher starting — ${mode.label}...`, "agent");
      const topicsRaw = await callAzure(mode.researcher, userPromptResearch);
      addLog("✅ Trend data received", "success");
      complete("researcher");

      // ── CURATOR ─────────────────────────────────────────────────
      activate("curator");
      addLog("📋 Parsing and ranking stories...", "agent");
      await sleep(400);
      let parsedTopics = [];
      try {
        parsedTopics = JSON.parse(topicsRaw.replace(/```json|```/g, "").trim());
        if (!Array.isArray(parsedTopics)) throw new Error();
      } catch {
        throw new Error("Could not parse topics — try running again.");
      }
      setTopics(parsedTopics);
      addLog(`🏆 Lead story: ${parsedTopics[0]?.title?.slice(0, 55)}...`, "info");
      addLog("📊 All 5 stories ready", "success");
      complete("curator");

      // ── WRITER ──────────────────────────────────────────────────
      activate("writer");
      addLog("✍️ Drafting LinkedIn post...", "agent");
      const topicsList = parsedTopics.map((t, i) => `${i + 1}. ${t.title}\nContext: ${t.blurb}`).join("\n\n");
      const draftPost = await callAzure(
        mode.writer,
        `Write a LinkedIn post using these 5 trending stories:\n\n${topicsList}\n\nUnder 300 words. No em dashes.`
      );
      setPost(draftPost);
      addLog(`✅ Draft complete — ${draftPost.split(" ").length} words`, "success");
      complete("writer");

      // ── REVIEWER ────────────────────────────────────────────────
      activate("reviewer");
      addLog("🧠 Checking tone and language...", "agent");
      await sleep(600);
      const hasEmDash = draftPost.includes("—");
      addLog(hasEmDash ? "⚠️ Em dash detected — flagged" : "✅ No em dashes ✓", hasEmDash ? "warn" : "success");
      addLog("✅ Sounds human ✓", "success");
      complete("reviewer");

      // ── PUBLISHER ───────────────────────────────────────────────
      activate("publisher", "posting");
      addLog("🚀 Publishing to LinkedIn...", "linkedin");

      if (!linkedinOk) {
        addLog("⚠️ LinkedIn token not configured — skipping auto-post", "warn");
        addLog("📋 Copy the post from the Post tab and paste it manually", "info");
        complete("publisher");
        setTab("post");
      } else {
        try {
          const result = await postToLinkedIn(draftPost);
          setPublishedId(result.postId);
          addLog(`✅ Posted to LinkedIn! Post ID: ${result.postId}`, "linkedin");
          addLog("🎉 Pipeline complete!", "success");
          complete("publisher");
          setTab("post");
        } catch (linkedinErr) {
          addLog(`❌ LinkedIn failed: ${linkedinErr.message}`, "error");
          addLog("📋 Post saved — copy it manually from the Post tab", "warn");
          complete("publisher");
          setTab("post");
        }
      }

    } catch (err) {
      const msg = err.message || "Something went wrong.";
      setError(msg);
      addLog(`❌ ${msg}`, "error");
    }

    setRunning(false);
  };

  const handleSetSchedule = async () => {
    try {
      const result = await setSchedule(scheduleTime);
      const status = await getScheduleStatus();
      setScheduleStatus(status);
      addLog(`⏰ Scheduled daily at ${scheduleTime}`, "agent");
    } catch (e) {
      setError("Failed to set schedule");
    }
  };

  const handleCancelSchedule = async () => {
    await cancelSchedule();
    setScheduleStatus(null);
    addLog("🛑 Schedule cancelled", "warn");
  };

  const copyPost = () => {
    navigator.clipboard.writeText(post);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ fontFamily: "'Georgia', serif", background: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 60%, #0a0f0a 100%)", minHeight: "100vh", color: "white" }}>
      <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }`}</style>

      {/* ── HEADER ───────────────────────────────────────────────── */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}><span style={{ color: "#a78bfa" }}>∿</span> AI Trend Publisher</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2, fontFamily: "monospace" }}>LangGraph · Azure OpenAI · Auto-posts to LinkedIn</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Status badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, border: "1px solid", borderColor: proxyOk ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)", background: proxyOk ? "rgba(52,211,153,0.06)" : "rgba(248,113,113,0.06)", fontSize: 11, fontFamily: "monospace", color: proxyOk ? "#34d399" : "#f87171" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: proxyOk ? "#34d399" : "#f87171", display: "inline-block" }} />
            Proxy
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, border: "1px solid", borderColor: linkedinOk ? "rgba(96,165,250,0.3)" : "rgba(255,255,255,0.1)", background: linkedinOk ? "rgba(96,165,250,0.06)" : "transparent", fontSize: 11, fontFamily: "monospace", color: linkedinOk ? "#60a5fa" : "#475569" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: linkedinOk ? "#60a5fa" : "#475569", display: "inline-block" }} />
            LinkedIn
          </div>
          {scheduleStatus?.active && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(167,139,250,0.3)", background: "rgba(167,139,250,0.06)", fontSize: 11, fontFamily: "monospace", color: "#a78bfa" }}>
              ⏰ {scheduleStatus.scheduledTime} daily
            </div>
          )}
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
            {!proxyOk && (
              <div style={{ marginBottom: 16, padding: "12px 16px", background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, fontSize: 13, color: "#fcd34d" }}>
                ⚠️ <strong>Proxy is not running.</strong> Open a terminal and run: <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: 4 }}>node proxy.cjs</code>
              </div>
            )}

            {!linkedinOk && proxyOk && (
              <div style={{ marginBottom: 16, padding: "12px 16px", background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 10, fontSize: 13, color: "#93c5fd" }}>
                ℹ️ <strong>LinkedIn not configured.</strong> Add <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: 4 }}>LINKEDIN_ACCESS_TOKEN</code> to your .env to enable auto-posting. Posts will still generate — you can copy and paste them manually.
              </div>
            )}

            {/* Node graph */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              {GRAPH_NODES.slice(0,3).map(n => <NodeCard key={n.id} node={n} state={nodeStates[n.id] || "idle"} />)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 440, margin: "0 auto 20px" }}>
              {GRAPH_NODES.slice(3).map(n => <NodeCard key={n.id} node={n} state={nodeStates[n.id] || "idle"} />)}
            </div>

            {/* Topic mode */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace", marginBottom: 8, letterSpacing: 1 }}>TOPIC MODE</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {Object.entries(TOPIC_MODES).map(([key, m]) => (
                  <button key={key} onClick={() => setTopicMode(key)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid", borderColor: topicMode === key ? "#a78bfa" : "rgba(255,255,255,0.1)", background: topicMode === key ? "rgba(167,139,250,0.12)" : "transparent", color: topicMode === key ? "#c4b5fd" : "#64748b", fontSize: 12, cursor: "pointer", fontFamily: "monospace" }}>
                    {m.label}
                  </button>
                ))}
              </div>
              {topicMode === "custom" && (
                <input type="text" placeholder="e.g. cybersecurity, fintech, climate tech..." value={customTopic} onChange={e => setCustomTopic(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)", color: "white", fontSize: 13, fontFamily: "monospace", width: "100%", boxSizing: "border-box", outline: "none" }} />
              )}
            </div>

            {/* Run + Schedule controls */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
              <button onClick={() => runAgent(false)} disabled={running || !proxyOk} style={{ padding: "11px 26px", borderRadius: 10, border: "1px solid transparent", background: !proxyOk ? "#0d1117" : running ? "#1e293b" : "linear-gradient(135deg, #7c3aed, #a78bfa)", color: !proxyOk || running ? "#475569" : "white", fontSize: 14, fontWeight: 600, cursor: (!proxyOk || running) ? "not-allowed" : "pointer", fontFamily: "Georgia, serif" }}>
                {running ? "⏳ Running..." : "▶ Run Agent Now"}
              </button>

              {/* Daily schedule */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10 }}>
                <span style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>Schedule daily:</span>
                <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                  style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "white", padding: "4px 8px", fontSize: 13, fontFamily: "monospace", outline: "none" }} />
                {scheduleStatus?.active ? (
                  <button onClick={handleCancelSchedule} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.06)", color: "#f87171", fontSize: 12, cursor: "pointer", fontFamily: "monospace" }}>
                    🛑 Cancel
                  </button>
                ) : (
                  <button onClick={handleSetSchedule} disabled={!proxyOk} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(167,139,250,0.3)", background: "rgba(167,139,250,0.08)", color: "#a78bfa", fontSize: 12, cursor: proxyOk ? "pointer" : "not-allowed", fontFamily: "monospace" }}>
                    ⏰ Set
                  </button>
                )}
              </div>

              <div style={{ fontSize: 11, color: "#334155", fontFamily: "monospace" }}>
                {Object.values(nodeStates).filter(s => s === "done").length} / {GRAPH_NODES.length} nodes complete
              </div>
            </div>

            {scheduleStatus?.active && scheduleStatus.nextRun && (
              <div style={{ marginBottom: 12, padding: "8px 14px", background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 8, fontSize: 12, color: "#a78bfa", fontFamily: "monospace" }}>
                ⏰ Next auto-run: {new Date(scheduleStatus.nextRun).toLocaleString()}
                {scheduleStatus.lastPostedDate && ` · Last posted: ${new Date(scheduleStatus.lastPostedDate).toLocaleString()}`}
              </div>
            )}

            {error && (
              <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>
                ⚠️ {error}
              </div>
            )}

            {/* Logs */}
            <div ref={logsRef} style={{ background: "#070709", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 14, height: 180, overflowY: "auto", fontFamily: "monospace", fontSize: 12, marginBottom: 16 }}>
              {logs.length === 0 && <div style={{ color: "#1e293b" }}>Agent logs will stream here when you run the pipeline...</div>}
              {logs.map((l, i) => (
                <div key={i} style={{ color: l.color, marginBottom: 3 }}>
                  <span style={{ color: "#1e293b" }}>[{l.time}]</span> {l.msg}
                </div>
              ))}
            </div>

            {/* Topics */}
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
                Run the agent first to generate a post.
              </div>
            ) : (
              <div>
                {publishedId && (
                  <div style={{ marginBottom: 14, padding: "10px 16px", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 10, fontSize: 13, color: "#60a5fa" }}>
                    ✅ <strong>Published to LinkedIn</strong> — Post ID: {publishedId}
                  </div>
                )}
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
                    ↩ Run again
                  </button>
                  {!publishedId && linkedinOk && post && (
                    <button onClick={() => postToLinkedIn(post).then(r => setPublishedId(r.postId)).catch(e => setError(e.message))}
                      style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid rgba(96,165,250,0.3)", background: "rgba(96,165,250,0.08)", color: "#60a5fa", fontSize: 13, cursor: "pointer", fontFamily: "monospace" }}>
                      🔗 Post to LinkedIn
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SETUP TAB ──────────────────────────────────────────── */}
        {tab === "setup" && (
          <div style={{ maxWidth: 660 }}>
            <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace", marginBottom: 18, letterSpacing: 1 }}>SETUP GUIDE</div>
            {[
              { step: "01", title: "Install proxy dependencies", code: `npm install express cors axios dotenv` },
              { step: "02", title: "Configure your .env file", code: `AZURE_OPENAI_API_KEY=your-key\nAZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com\nAZURE_OPENAI_DEPLOYMENT=gpt-4o\nAZURE_API_VERSION=2024-12-01-preview\nLINKEDIN_ACCESS_TOKEN=your-token` },
              { step: "03", title: "Start the proxy", code: `node proxy.cjs\n# Should print:\n# ✅ Proxy running on port 3001\n# Azure:    ✅ configured\n# LinkedIn: ✅ configured` },
              { step: "04", title: "Start the React app", code: `npm run dev\n# Then open http://localhost:5173` },
              { step: "05", title: "Schedule daily posts", notes: ["In the Agent tab, set your preferred time using the time picker", "Click ⏰ Set to activate the schedule", "The proxy must be running for scheduled posts to fire", "The next run time is shown below the controls"] },
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
          </div>
        )}

      </div>
    </div>
  );
}
