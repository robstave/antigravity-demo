require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
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

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

// Initialize Chroma
const client = new ChromaClient({ path: process.env.CHROMA_URL || "http://chroma:8000" });
let collection;

const restaurants = JSON.parse(fs.readFileSync(path.join(__dirname, 'restaurants.json'), 'utf8'));

async function initChroma() {
  try {
    // Delete existing collection to start fresh
    try {
      await client.deleteCollection({ name: "restaurants" });
    } catch (e) {
      // Ignore if it doesn't exist
    }

    collection = await client.createCollection({
      name: "restaurants",
      metadata: { "hnsw:space": "cosine" }
    });

    console.log("Generating embeddings and populating Chroma...");

    const documents = restaurants.map(r => r.pageContent);
    const metadatas = restaurants.map(r => r.metadata);
    const ids = restaurants.map((_, i) => `id${i}`);

    // Generate embeddings for all documents
    const embeddings = await Promise.all(
      documents.map(async (doc) => {
        const result = await embeddingModel.embedContent(doc);
        return result.embedding.values;
      })
    );

    await collection.add({
      ids,
      embeddings,
      metadatas,
      documents
    });

    console.log("Chroma populated successfully.");
  } catch (error) {
    console.error("Error initializing Chroma:", error);
  }
}

// Routes
app.get('/api/restaurants', (req, res) => {
  res.json(restaurants);
});

app.post('/api/search', async (req, res) => {
  const { query, threshold = 0.5, size = 5 } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    // Generate embedding for the query
    const result = await embeddingModel.embedContent(query);
    const queryEmbedding = result.embedding.values;

    // Search Chroma
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: parseInt(size),
      include: ["documents", "metadatas", "distances"]
    });

    // Format results and apply threshold
    // Distances in Chroma with cosine space are (1 - cosine_similarity)
    // So similarity = 1 - distance
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

    res.json(formattedResults);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend listening at http://0.0.0.0:${port}`);
  initChroma();
});
