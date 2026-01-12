# Vector Restaurant Search App

This project is a full-stack application that demonstrates **Vector Search** using Google's Gemini Embeddings and Chroma DB.

## Features
- **Semantic Search**: Find restaurants by describing what you want (e.g., "cheap burgers").
- **Gemini Embeddings**: Uses `text-embedding-004` to convert text to vectors.
- **Chroma DB**: High-performance vector database for similarity search.
- **Dynamic Filtering**: Adjust similarity thresholds and result sizes.
- **Full List**: View all restaurants in a clean table format.

---

## Getting Started

### 1. Get a Gemini API Key
To use the vector search, you need a Google Gemini API Key:
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Click on **"Get API key"**.
3. Create a new API key in a new project.
4. Copy the key.

### 2. Setup Environment Variables
Create a `.env` file in the root directory (or copy `.env.example`):
```bash
cp .env.example .env
```
Open `.env` and paste your Gemini API key:
```
GEMINI_API_KEY=your_actual_key_here
```

### 3. Run with Docker
The easiest way to run the project is using Docker Compose:
```bash
docker compose up --build
```
This will start three services:
- **Chroma**: Port 8000
- **Backend (Express)**: Port 5000
- **Frontend (Vite/React)**: Port 3000

Access the app at: [http://localhost:3000](http://localhost:3000)

## Data Persistence & Initialization

- **Persistence**: Chroma is configured with a Docker volume (`chroma_data`) and `IS_PERSISTENT=TRUE`, so its internal database persists even if you stop the containers.
- **Initialization**: Every time the **backend** service starts, it is programmed to:
  1.  Delete the existing `restaurants` collection.
  2.  Re-generate embeddings for all items in `restaurants.json`.
  3.  Re-populate Chroma.
  
This ensures the database always matches your local JSON file during development. If you have a very large dataset and want to avoid re-generating embeddings on every restart, you can modify the `initChroma` function in `backend/index.js`.

---

## How it works
On startup, the backend:
1. Loads restaurant data from `restaurants.json`.
2. Generates embeddings for each restaurant description using Gemini.
3. Populates the Chroma DB collection.

When you search:
1. Your query is converted into a vector (embedding).
2. Chroma performs a cosine similarity search against the restaurant vectors.
3. Results are filtered by your chosen threshold and displayed in the frontend.
