// proxy.cjs
// Handles: Azure OpenAI chat, LinkedIn posting, and daily scheduling
// Works locally (reads from .env) and on Cloud Run (env vars set in console)

try { require("dotenv").config(); } catch (_) {}

const express = require("express");
const cors    = require("cors");
const axios   = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

const AZURE_API_KEY    = process.env.AZURE_OPENAI_API_KEY;
const AZURE_ENDPOINT   = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT;
const AZURE_API_VER    = process.env.AZURE_API_VERSION || "2024-12-01-preview";
const LINKEDIN_TOKEN   = process.env.LINKEDIN_ACCESS_TOKEN;

// ── Scheduler state ──────────────────────────────────────────────────────────
let scheduledTime  = null;
let schedulerTimer = null;
let lastPostedDate = null;
let triggerFlag    = false; // frontend polls this to know when to auto-run

function msUntilNextRun(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const now  = new Date();
  const next = new Date();
  next.setHours(hours, minutes, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

// ── Azure OpenAI ─────────────────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
  if (!AZURE_API_KEY || !AZURE_ENDPOINT || !AZURE_DEPLOYMENT) {
    return res.status(500).json({ error: "Azure credentials not configured." });
  }
  const { messages, max_tokens = 1000 } = req.body;
  const url = `${AZURE_ENDPOINT}/openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=${AZURE_API_VER}`;
  try {
    const response = await axios.post(url, { messages, max_tokens }, {
      headers: { "Content-Type": "application/json", "api-key": AZURE_API_KEY },
    });
    res.json(response.data);
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    res.status(500).json({ error: msg });
  }
});

// ── LinkedIn: post content ───────────────────────────────────────────────────
app.post("/linkedin/post", async (req, res) => {
  if (!LINKEDIN_TOKEN) return res.status(500).json({ error: "LINKEDIN_ACCESS_TOKEN not configured in .env" });
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "No post text provided." });
  try {
    const profileRes = await axios.get("https://api.linkedin.com/v2/userinfo", {
      headers: {
        "Authorization": `Bearer ${LINKEDIN_TOKEN}`,
      },
    });
    const authorUrn = `urn:li:person:${profileRes.data.sub}`;

    const payload = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };

    const postRes = await axios.post("https://api.linkedin.com/v2/ugcPosts", payload, {
      headers: {
        "Authorization": `Bearer ${LINKEDIN_TOKEN}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });

    const postId = postRes.headers["x-restli-id"] || "unknown";
    lastPostedDate = new Date().toISOString();
    console.log(`✅ LinkedIn post published — ID: ${postId}`);
    res.json({ success: true, postId, authorUrn });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error(`❌ LinkedIn post failed: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ── Scheduler: set a daily time ──────────────────────────────────────────────
app.post("/schedule", (req, res) => {
  const { time } = req.body;
  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ error: "Invalid time. Use HH:MM e.g. 09:00" });
  }
  if (schedulerTimer) clearTimeout(schedulerTimer);
  scheduledTime = time;

  const scheduleNext = () => {
    const ms = msUntilNextRun(scheduledTime);
    const nextRun = new Date(Date.now() + ms);
    console.log(`⏰ Next scheduled run: ${nextRun.toLocaleString()}`);
    schedulerTimer = setTimeout(() => {
      console.log(`\n⏰ Scheduled trigger firing at ${new Date().toLocaleTimeString()}`);
      triggerFlag = true; // frontend will pick this up via polling
      scheduleNext();
    }, ms);
  };

  scheduleNext();
  res.json({ success: true, scheduledTime, message: `Scheduled daily at ${time}` });
});

// ── Scheduler: poll for trigger ──────────────────────────────────────────────
app.get("/schedule/trigger", (req, res) => {
  if (triggerFlag) {
    triggerFlag = false; // reset after frontend picks it up
    res.json({ trigger: true });
  } else {
    res.json({ trigger: false });
  }
});

// ── Scheduler: status ────────────────────────────────────────────────────────
app.get("/schedule", (req, res) => {
  res.json({
    scheduledTime,
    active: !!schedulerTimer,
    lastPostedDate,
    nextRun: scheduledTime ? new Date(Date.now() + msUntilNextRun(scheduledTime)).toISOString() : null,
  });
});

// ── Scheduler: cancel ────────────────────────────────────────────────────────
app.delete("/schedule", (req, res) => {
  if (schedulerTimer) clearTimeout(schedulerTimer);
  schedulerTimer = null;
  scheduledTime  = null;
  triggerFlag    = false;
  res.json({ success: true, message: "Scheduler cancelled" });
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({
  status:        "ok",
  azure:         !!(AZURE_API_KEY && AZURE_ENDPOINT && AZURE_DEPLOYMENT),
  linkedin:      !!LINKEDIN_TOKEN,
  scheduledTime,
  lastPostedDate,
}));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Proxy running on port ${PORT}`);
  console.log(`   Azure:    ${AZURE_API_KEY ? "✅ configured" : "❌ missing"}`);
  console.log(`   LinkedIn: ${LINKEDIN_TOKEN ? "✅ configured" : "❌ missing"}`);
});
