import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom'
import { Search, List, Star, Info, RefreshCw, Trash2, Database } from 'lucide-react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const Navbar = () => (
    <nav>
        <NavLink to="/" end>Landing Page</NavLink>
        <NavLink to="/list">Restaurant List</NavLink>
    </nav>
)

const LandingPage = () => {
    const [query, setQuery] = useState('')
    const [threshold, setThreshold] = useState(0.5)
    const [size, setSize] = useState(5)
    const [minStars, setMinStars] = useState(0)
    const [results, setResults] = useState([])
    const [summary, setSummary] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSearch = async (e) => {
        e.preventDefault()
        if (!query) return
        setLoading(true)
        setSummary('')
        try {
            const response = await fetch(`${API_URL}/api/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, threshold, size, minStars })
            })
            const data = await response.json()
            setResults(data.results)
            setSummary(data.summary)
        } catch (error) {
            console.error('Search error:', error)
            alert('Search failed. Is the backend running?')
        } finally {
            setLoading(false)
        }
    }

    const thresholds = Array.from({ length: 11 }, (_, i) => (i / 10).toFixed(1))
    const sizes = [1, 3, 5, 8, 10]
    const starOptions = [0, 1, 2, 3, 4, 5]

    return (
        <div className="search-page">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1rem' }}>
                <img src="/assets/duck.jpg" alt="Duck mascot" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--primary)' }} />
                <h1 style={{ margin: 0 }}>Vector Restaurant Search</h1>
            </div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                Search for restaurants using natural language. Powered by Gemini Embeddings.
            </p>

            <div className="search-container">
                <form className="search-form" onSubmit={handleSearch}>
                    <div className="input-group">
                        <label>What are you looking for?</label>
                        <input
                            type="text"
                            placeholder="e.g. cheap burgers or spicy mexican food"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </div>

                    <div className="controls-row">
                        <div className="input-group">
                            <label>Similarity Threshold</label>
                            <select value={threshold} onChange={(e) => setThreshold(e.target.value)}>
                                {thresholds.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="input-group">
                            <label>Result Size</label>
                            <select value={size} onChange={(e) => setSize(e.target.value)}>
                                {sizes.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="controls-row">
                        <div className="input-group">
                            <label>Minimum Stars</label>
                            <select value={minStars} onChange={(e) => setMinStars(e.target.value)}>
                                {starOptions.map(s => <option key={s} value={s}>{s === 0 ? 'Any' : s + '+'}</option>)}
                            </select>
                        </div>
                    </div>

                    <button type="submit" disabled={loading}>
                        {loading ? 'Searching...' : 'Find Restaurants'}
                    </button>
                </form>
            </div>

            {summary && (
                <div className="ai-summary" style={{
                    marginTop: '2rem',
                    padding: '1.5rem',
                    background: 'rgba(99, 102, 241, 0.1)',
                    borderLeft: '4px solid var(--primary)',
                    borderRadius: '0.5rem',
                    fontStyle: 'italic',
                    color: 'var(--text)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                        <Info size={18} /> Critic's Take
                    </div>
                    {summary}
                </div>
            )}

            <div className="results-list">
                {results.length > 0 ? (
                    results.map((r, i) => (
                        <div key={i} className="result-card">
                            <div className="result-header">
                                <h3>{r.metadata.name}</h3>
                                <span className="score-badge">{(r.score * 100).toFixed(1)}% Match</span>
                            </div>
                            <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>{r.content}</p>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                <span>{r.metadata.cuisine}</span>
                                <span className="stars">{'★'.repeat(r.metadata.stars)}</span>
                                <span style={{ color: 'var(--accent)' }}>{'$'.repeat(r.metadata.cost)}</span>
                            </div>
                        </div>
                    ))
                ) : query && !loading && (
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No results found matching your criteria.</p>
                )}
            </div>
        </div>
    )
}

const RestaurantListPage = () => {
    const [restaurants, setRestaurants] = useState([])
    const [loading, setLoading] = useState(true)
    const [dbStatus, setDbStatus] = useState(null)
    const [adminLoading, setAdminLoading] = useState(false)

    const fetchRestaurants = () => {
        fetch(`${API_URL}/api/restaurants`)
            .then(res => res.json())
            .then(data => {
                setRestaurants(data)
                setLoading(false)
            })
            .catch(err => {
                console.error(err)
                setLoading(false)
            })
    }

    const fetchStatus = async () => {
        try {
            const res = await fetch(`${API_URL}/api/admin/status`)
            const data = await res.json()
            setDbStatus(data)
        } catch (e) {
            console.error('Failed to get status', e)
        }
    }

    useEffect(() => {
        fetchRestaurants()
        fetchStatus()
    }, [])

    const handleClear = async () => {
        if (!confirm('Are you sure you want to clear the vector database?')) return
        setAdminLoading(true)
        try {
            await fetch(`${API_URL}/api/admin/clear`, { method: 'POST' })
            await fetchStatus()
            alert('Vector database cleared!')
        } catch (e) {
            alert('Failed to clear database')
        }
        setAdminLoading(false)
    }

    const handleRepopulate = async () => {
        if (!confirm('This will regenerate embeddings (uses API quota). Continue?')) return
        setAdminLoading(true)
        try {
            await fetch(`${API_URL}/api/admin/repopulate`, { method: 'POST' })
            await fetchStatus()
            alert('Vector database repopulated!')
        } catch (e) {
            alert('Failed to repopulate database')
        }
        setAdminLoading(false)
    }

    if (loading) return <div>Loading...</div>

    return (
        <div>
            <h1>All Restaurants</h1>

            {/* Admin Controls */}
            <div style={{
                background: 'var(--card-bg)',
                padding: '1rem 1.5rem',
                borderRadius: '0.75rem',
                marginBottom: '1.5rem',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Database size={18} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontWeight: '600' }}>Vector Database:</span>
                    {dbStatus ? (
                        <span style={{ color: dbStatus.needsRepopulate ? '#ef4444' : 'var(--accent)' }}>
                            {dbStatus.documentCount} / {dbStatus.restaurantsInJson} documents
                            {dbStatus.needsRepopulate && ' (out of sync)'}
                        </span>
                    ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Loading...</span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        onClick={handleClear}
                        disabled={adminLoading}
                        style={{ background: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <Trash2 size={16} /> Clear DB
                    </button>
                    <button
                        onClick={handleRepopulate}
                        disabled={adminLoading}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <RefreshCw size={16} className={adminLoading ? 'spin' : ''} /> Repopulate
                    </button>
                </div>
            </div>

            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Cuisine</th>
                            <th>Stars</th>
                            <th>Cost</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        {restaurants.map((r, i) => (
                            <tr key={i}>
                                <td style={{ fontWeight: '600', color: 'var(--primary)' }}>{r.metadata.name}</td>
                                <td>{r.metadata.cuisine}</td>
                                <td className="stars">{'★'.repeat(r.metadata.stars)}</td>
                                <td style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{'$'.repeat(r.metadata.cost)}</td>
                                <td style={{ fontSize: '0.85rem' }}>{r.pageContent}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function App() {
    return (
        <BrowserRouter>
            <div className="app-container">
                <Navbar />
                <main>
                    <Routes>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/list" element={<RestaurantListPage />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    )
}

export default App
