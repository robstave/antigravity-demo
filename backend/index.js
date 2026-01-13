require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { ChromaClient } = require('chromadb');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Initialize LangChain Gemini
const apiKey = process.env.GEMINI_API_KEY;

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: apiKey,
  modelName: "text-embedding-004",
});

// Use raw SDK for LLM
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(apiKey);
const llmModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

// Initialize Chroma
const client = new ChromaClient({ path: process.env.CHROMA_URL || "http://chroma:8000" });
let collection;

console.log("Loading restaurants...");
const restaurants = JSON.parse(fs.readFileSync(path.join(__dirname, 'restaurants.json'), 'utf8'));

// Populate Chroma with embeddings (called manually or on first run)
async function populateChroma() {
  console.log("Generating embeddings and populating Chroma...");

  const documents = restaurants.map(r => r.pageContent);
  const metadatas = restaurants.map(r => r.metadata);
  const ids = restaurants.map((_, i) => `id${i}`);

  const embeddingValues = await embeddings.embedDocuments(documents);

  await collection.add({
    ids,
    embeddings: embeddingValues,
    metadatas,
    documents
  });

  console.log("Chroma populated successfully with", documents.length, "documents.");
}

// Initialize Chroma - only populate if empty
async function initChroma() {
  try {
    // Try to get existing collection
    console.log("initChroma: Checking for existing collection...");
    try {
      collection = await client.getCollection({ name: "restaurants" });
      const count = await collection.count();
      console.log(`Found existing collection with ${count} documents.`);

      if (count === 0) {
        console.log("Collection is empty, populating...");
        await populateChroma();
      } else {
        console.log("Using existing data. Use /api/admin/repopulate to refresh.");
      }
    } catch (e) {
      // Collection doesn't exist, create it
      console.log("No existing collection found, creating new one...");
      collection = await client.createCollection({
        name: "restaurants",
        metadata: { "hnsw:space": "cosine" }
      });
      await populateChroma();
    }
  } catch (error) {
    console.error("Error initializing Chroma:", error);
  }
}

// Routes
app.get('/api/restaurants', (req, res) => {
  res.json(restaurants);
});

// Admin: Clear the vector database
app.post('/api/admin/clear', async (req, res) => {
  try {
    await client.deleteCollection({ name: "restaurants" });
    collection = await client.createCollection({
      name: "restaurants",
      metadata: { "hnsw:space": "cosine" }
    });
    console.log("Collection cleared.");
    res.json({ message: "Vector database cleared successfully." });
  } catch (error) {
    console.error("Error clearing database:", error);
    res.status(500).json({ error: "Failed to clear database" });
  }
});

// Admin: Repopulate the vector database
app.post('/api/admin/repopulate', async (req, res) => {
  try {
    // Clear first
    try {
      await client.deleteCollection({ name: "restaurants" });
    } catch (e) { }

    collection = await client.createCollection({
      name: "restaurants",
      metadata: { "hnsw:space": "cosine" }
    });

    await populateChroma();
    res.json({ message: `Vector database repopulated with ${restaurants.length} documents.` });
  } catch (error) {
    console.error("Error repopulating database:", error);
    res.status(500).json({ error: "Failed to repopulate database" });
  }
});

// Admin: Get database status
app.get('/api/admin/status', async (req, res) => {
  try {
    const count = await collection.count();
    res.json({
      documentCount: count,
      restaurantsInJson: restaurants.length,
      needsRepopulate: count !== restaurants.length
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to get status" });
  }
});

app.post('/api/search', async (req, res) => {
  const { query, threshold = 0.5, size = 5, minStars = 0 } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    const queryEmbedding = await embeddings.embedQuery(query);

    let where = {};
    if (minStars > 0) {
      where = { "stars": { "$gte": parseInt(minStars) } };
    }

    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: parseInt(size),
      where: Object.keys(where).length > 0 ? where : undefined,
      include: ["documents", "metadatas", "distances"]
    });

    const formattedResults = results.ids[0].map((id, index) => {
      const distance = results.distances[0][index];
      const similarity = 1 - distance;

      return {
        id,
        content: results.documents[0][index],
        metadata: results.metadatas[0][index],
        score: similarity
      };
    }).filter(r => r.score >= parseFloat(threshold));

    let summary = "";
    if (formattedResults.length > 0) {
      const top3 = formattedResults.slice(0, 3);
      const itemsList = top3.map(r => `${r.metadata.name}: ${r.content}`).join('\n');

      const prompt = `You are a snarky, world-weary food critic. A user asked: "${query}". 
      Based on the following restaurant recommendations, write a single snarky paragraph summarizing their options. 
      Only mention these specific restaurants:
      ${itemsList}
      
      Keep it under 100 words and be appropriately judgmental.`;

      try {
        const response = await llmModel.generateContent(prompt);
        summary = response.response.text();
      } catch (llmError) {
        console.error("LLM error (possibly rate limited):", llmError.message);
        summary = "The critic is taking a break (rate limited). Try again in a minute!";
      }
    }

    res.json({
      results: formattedResults,
      summary: summary
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend listening at http://0.0.0.0:${port}`);
  initChroma();
});
