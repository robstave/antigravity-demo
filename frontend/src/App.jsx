import { useState } from 'react'
import './App.css'

function App() {
    const [number, setNumber] = useState(null)
    const [loading, setLoading] = useState(false)

    const fetchRandomNumber = async () => {
        setLoading(true)
        try {
            const response = await fetch('http://localhost:5000/api/random')
            const data = await response.json()
            setNumber(data.number)
        } catch (error) {
            console.error('Error fetching random number:', error)
            alert('Failed to fetch number from backend')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="container">
            <h1>Hello World!</h1>
            <p>Click the button below to get a random number from the backend.</p>
            <div className="card">
                <button onClick={fetchRandomNumber} disabled={loading}>
                    {loading ? 'Fetching...' : 'Get Random Number'}
                </button>
                {number !== null && (
                    <div className="result">
                        <p>Your random number is: <strong>{number}</strong></p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default App
