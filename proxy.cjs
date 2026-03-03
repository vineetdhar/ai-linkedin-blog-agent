// proxy.js — run this locally with: node proxy.js
// It forwards requests from the React app to Azure OpenAI, bypassing CORS.

const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors()); // allow browser requests from any origin
app.use(express.json());

const AZURE_API_KEY    = process.env.AZURE_OPENAI_API_KEY;
const AZURE_ENDPOINT   = process.env.AZURE_OPENAI_ENDPOINT;   // e.g. https://YOUR-RESOURCE.openai.azure.com
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT; // e.g. gpt-4o
const AZURE_API_VER    = "2024-02-01";

app.post("/chat", async (req, res) => {
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

app.get("/health", (_, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Azure OpenAI proxy running on http://localhost:${PORT}`));
