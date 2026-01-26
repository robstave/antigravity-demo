require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { ChromaClient } = require('chromadb');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

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

// Initialize Chroma - only populate if empty
async function initChroma() {
  try {
    // Sync logic: Ensure DB is seeded from JSON if empty
    const count = await prisma.restaurant.count();
    if (count === 0) {
      console.log("SQL Database is empty. Seeding from JSON...");
      const jsonRestaurants = JSON.parse(fs.readFileSync(path.join(__dirname, 'restaurants.json'), 'utf8'));

      for (const r of jsonRestaurants) {
        await prisma.restaurant.create({
          data: {
            name: r.metadata.name,
            cuisine: r.metadata.cuisine,
            stars: r.metadata.stars,
            cost: r.metadata.cost,
            description: r.pageContent,
            isIndexed: false
          }
        });
      }
      console.log("Seeding complete.");
    }

    // Check Chroma
    try {
      collection = await client.getCollection({ name: "restaurants" });
    } catch (e) {
      collection = await client.createCollection({
        name: "restaurants",
        metadata: { "hnsw:space": "cosine" }
      });
    }

    // Auto-sync any unindexed rows
    await syncToChroma();

  } catch (error) {
    console.error("Error initializing system:", error);
  }
}

// Sync function: Finds unindexed rows -> Embeds -> Pushes to Chroma -> Marks indexed
async function syncToChroma() {
  const unindexed = await prisma.restaurant.findMany({ where: { isIndexed: false } });

  if (unindexed.length === 0) {
    console.log("All restaurants allow synced.");
    return;
  }

  console.log(`Syncing ${unindexed.length} restaurants to Chroma...`);

  const documents = unindexed.map(r => r.description);
  const metadatas = unindexed.map(r => ({
    name: r.name,
    cuisine: r.cuisine,
    stars: r.stars,
    cost: r.cost,
    sqlId: r.id
  }));
  const ids = unindexed.map(r => `sql_${r.id}`);

  const embeddingValues = await embeddings.embedDocuments(documents);

  await collection.add({
    ids,
    embeddings: embeddingValues,
    metadatas,
    documents
  });

  // Mark as indexed
  await prisma.restaurant.updateMany({
    where: { id: { in: unindexed.map(r => r.id) } },
    data: { isIndexed: true, chromaId: `sql_` } // simple marker, ideally we store the full ID map
  });

  console.log("Sync complete.");
}

// Routes
app.get('/api/restaurants', async (req, res) => {
  const restaurants = await prisma.restaurant.findMany({ orderBy: { id: 'asc' } });
  // Map back to expected frontend format if needed, or update frontend
  const mapped = restaurants.map(r => ({
    pageContent: r.description,
    metadata: {
      name: r.name,
      cuisine: r.cuisine,
      stars: r.stars,
      cost: r.cost
    }
  }));
  res.json(mapped);
});

// Admin: Clear SQL & Vector
app.post('/api/admin/clear', async (req, res) => {
  try {
    await client.deleteCollection({ name: "restaurants" });
    await client.createCollection({ name: "restaurants", metadata: { "hnsw:space": "cosine" } });

    // Reset SQL index status
    await prisma.restaurant.updateMany({ data: { isIndexed: false } });

    res.json({ message: "Vector DB cleared. SQL marked as unindexed." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to clear" });
  }
});

// Admin: Repopulate (Sync)
app.post('/api/admin/repopulate', async (req, res) => {
  try {
    await syncToChroma();
    res.json({ message: "Sync triggered." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Sync failed" });
  }
});

// Admin: Status
app.get('/api/admin/status', async (req, res) => {
  try {
    const vectorCount = await collection.count();
    const sqlCount = await prisma.restaurant.count();
    const unindexedCount = await prisma.restaurant.count({ where: { isIndexed: false } });

    res.json({
      documentCount: vectorCount,
      restaurantsInJson: sqlCount,
      needsRepopulate: unindexedCount > 0
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
