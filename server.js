// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fetch = require('node-fetch'); // API çağırışları üçün

dotenv.config(); // .env faylındakı dəyişənləri yüklə (yalnız yerli inkişaf üçün)

const app = express();
// Render kimi platformalar avtomatik olaraq PORT dəyişənini təyin edir.
// Yerli inkişaf zamanı 3000-i istifadə edirik.
const PORT = process.env.PORT || 3000;

// TMDB API konfiqurasiyası
// API açarı environment variable-dan oxunur. Bu, təhlükəsizlik üçün vacibdir.
// Render-də TMDB_API_KEY-i əlavə etməyi unutmayın!
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// CORS-u aktivləşdirir
// Hələlik bütün domainlərdən müraciətə icazə verir.
// Təhlükəsizlik üçün deploy etdiyiniz frontend URL-ini (məsələn, 'https://username.github.io/cinewave-frontend')
// buraya əlavə etmək daha yaxşı olar:
// app.use(cors({ origin: 'SİZİN_FRONTEND_URLİNİZ_BURADA' }));
app.use(cors());

// Serverin ilkin yoxlanışı
app.get('/', (req, res) => {
    res.send('CineWave Backend API-nıza xoş gəlmisiniz! API açarı yükləndi: ' + (!!TMDB_API_KEY ? 'Bəli' : 'Xeyr'));
});

// TMDB-dən məlumat çəkən ümumi köməkçi funksiya
async function fetchFromTMDB(path, params = {}) {
    if (!TMDB_API_KEY) {
        console.error('TMDB_API_KEY environment variable-da təyin edilməyib. TMDB sorğuları işləməyəcək.');
        throw new Error('Server konfiqurasiya xətası: TMDB API Key yoxdur.');
    }

    const queryParams = new URLSearchParams({
        api_key: TMDB_API_KEY,
        language: 'az-AZ', // Və ya istədiyiniz digər dil
        ...params
    }).toString();

    const url = `${TMDB_BASE_URL}${path}?${queryParams}`;
    console.log(`TMDB-dən çəkilir: ${url}`); // Debugging üçün
    const response = await fetch(url);

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`TMDB API xətası: ${response.status} - ${response.statusText}. Cavab: ${errorText}`);
        throw new Error(`TMDB API xətası: ${response.status} - ${response.statusText}. Detay: ${errorText}`);
    }
    return await response.json();
}

// === API ROUTES ===
// Bütün API endpointləri /api prefiksi ilə başlayır.

// Filmlərlə bağlı endpointlər
app.get('/api/movies/popular', async (req, res) => {
    try {
        const data = await fetchFromTMDB('/movie/popular', { page: req.query.page || 1 });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/movies/now_playing', async (req, res) => {
    try {
        const data = await fetchFromTMDB('/movie/now_playing', { page: req.query.page || 1 });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/movies/top_rated', async (req, res) => {
    try {
        const data = await fetchFromTMDB('/movie/top_rated', { page: req.query.page || 1 });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/movie/:id', async (req, res) => {
    try {
        const movieDetails = await fetchFromTMDB(`/movie/${req.params.id}`);
        res.json(movieDetails);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/movie/:id/videos', async (req, res) => {
    try {
        const movieVideos = await fetchFromTMDB(`/movie/${req.params.id}/videos`);
        res.json(movieVideos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/movie/:id/credits', async (req, res) => {
    try {
        const movieCredits = await fetchFromTMDB(`/movie/${req.params.id}/credits`);
        res.json(movieCredits);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/movie/:id/similar', async (req, res) => {
    try {
        const similarMovies = await fetchFromTMDB(`/movie/${req.params.id}/similar`);
        res.json(similarMovies);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Seriallarla bağlı endpointlər
app.get('/api/tv/popular', async (req, res) => {
    try {
        const data = await fetchFromTMDB('/tv/popular', { page: req.query.page || 1 });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/tv/on_the_air', async (req, res) => {
    try {
        const data = await fetchFromTMDB('/tv/on_the_air', { page: req.query.page || 1 });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/tv/top_rated', async (req, res) => {
    try {
        const data = await fetchFromTMDB('/tv/top_rated', { page: req.query.page || 1 });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/tv/:id', async (req, res) => {
    try {
        const tvDetails = await fetchFromTMDB(`/tv/${req.params.id}`);
        res.json(tvDetails);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/tv/:id/videos', async (req, res) => {
    try {
        const tvVideos = await fetchFromTMDB(`/tv/${req.params.id}/videos`);
        res.json(tvVideos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/tv/:id/credits', async (req, res) => {
    try {
        const tvCredits = await fetchFromTMDB(`/tv/${req.params.id}/credits`);
        res.json(tvCredits);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/tv/:id/similar', async (req, res) => {
    try {
        const similarTv = await fetchFromTMDB(`/tv/${req.params.id}/similar`);
        res.json(similarTv);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Janrlarla bağlı endpointlər
app.get('/api/genres/movie', async (req, res) => {
    try {
        const data = await fetchFromTMDB('/genre/movie/list');
        res.json(data);
    } catch (error) { // <-- Düzəldilmiş sintaksis
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/genres/tv', async (req, res) => {
    try {
        const data = await fetchFromTMDB('/genre/tv/list');
        res.json(data);
    } catch (error) { // <-- Düzəldilmiş sintaksis
        res.status(500).json({ error: error.message });
    }
});

// Axtarışla bağlı endpoint
app.get('/api/search', async (req, res) => {
    try {
        const { query, page } = req.query; // Query parametrini alırıq
        if (!query) {
            return res.status(400).json({ error: 'Axtarış parametri (query) tələb olunur.' });
        }
        // /search/multi TMDB-də həm filmləri, həm serialları, həm də insanları axtarır
        const data = await fetchFromTMDB('/search/multi', { query: query, page: page || 1 });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Serveri işə salırıq
app.listen(PORT, () => {
    console.log(`CineWave Backend serveri ${PORT} portunda işləyir.`);
});
