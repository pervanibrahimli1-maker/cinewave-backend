// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

app.use(cors());

// TMDB-dən məlumat çəkən ümumi funksiya
async function fetchFromTMDB(path, params = {}) {
    if (!TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY təyin edilməyib.');
    }

    const queryParams = new URLSearchParams({
        api_key: TMDB_API_KEY,
        language: 'en-US',
        ...params
    }).toString();

    const url = `${TMDB_BASE_URL}${path}?${queryParams}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`TMDB Xətası: ${response.status}`);
    }
    return await response.json();
}

// === ROUTES ===

app.get('/', (req, res) => {
    res.send('CineWave API işləyir...');
});

// Filmlər
app.get('/api/movies/popular', async (req, res) => {
    try {
        const data = await fetchFromTMDB('/movie/popular', { page: req.query.page || 1 });
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/movies/now_playing', async (req, res) => {
    try {
        const data = await fetchFromTMDB('/movie/now_playing', { page: req.query.page || 1 });
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/movies/top_rated', async (req, res) => {
    try {
        const data = await fetchFromTMDB('/movie/top_rated', { page: req.query.page || 1 });
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Kateqoriya üzrə kəşf (Discover) - KATEQORİYALAR ÜÇÜN BU VACİBDİR
app.get('/api/discover/:type', async (req, res) => {
    try {
        const { with_genres, page } = req.query;
        const type = req.params.type;
        const data = await fetchFromTMDB(`/discover/${type}`, { 
            with_genres, 
            page: page || 1,
            sort_by: 'popularity.desc'
        });
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Tək Film detalları
app.get('/api/movie/:id', async (req, res) => {
    try {
        const data = await fetchFromTMDB(`/movie/${req.params.id}`);
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/movie/:id/credits', async (req, res) => {
    try {
        const data = await fetchFromTMDB(`/movie/${req.params.id}/credits`);
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/movie/:id/similar', async (req, res) => {
    try {
        const data = await fetchFromTMDB(`/movie/${req.params.id}/similar`);
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Seriallar
app.get('/api/tv/popular', async (req, res) => {
    try {
        const data = await fetchFromTMDB('/tv/popular', { page: req.query.page || 1 });
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/tv/:id', async (req, res) => {
    try {
        const data = await fetchFromTMDB(`/tv/${req.params.id}`);
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/tv/:id/credits', async (req, res) => {
    try {
        const data = await fetchFromTMDB(`/tv/${req.params.id}/credits`);
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/tv/:id/similar', async (req, res) => {
    try {
        const data = await fetchFromTMDB(`/tv/${req.params.id}/similar`);
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Janr siyahıları
app.get('/api/genres/movie', async (req, res) => {
    try {
        const data = await fetchFromTMDB('/genre/movie/list');
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/genres/tv', async (req, res) => {
    try {
        const data = await fetchFromTMDB('/genre/tv/list');
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Axtarış
app.get('/api/search', async (req, res) => {
    try {
        const { query, page } = req.query;
        if (!query) return res.status(400).json({ error: 'Query lazımdır' });
        const data = await fetchFromTMDB('/search/multi', { query, page: page || 1 });
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda aktivdir.`);
});
