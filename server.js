const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// TMDB Ayarları
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// === MONGODB BAĞLANTISI ===
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB-yə uğurla qoşuldu.'))
    .catch(err => console.error('Baza qoşulma xətası:', err));

// === İSTİFADƏÇİ MODELİ ===
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// === AUTH ROUTES (QEYDİYYAT VƏ GİRİŞ) ===

app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) return res.status(400).json({ error: 'Email və ya istifadəçi adı artıq istifadə olunur.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ fullName, email, username, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ success: true, message: 'Qeydiyyat uğurlu!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'İstifadəçi tapılmadı.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Yanlış şifrə.' });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '24h' });
        res.json({ success: true, token, user: { username: user.username, fullName: user.fullName } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// === TMDB KÖMƏKÇİ FUNKSİYASI ===
async function fetchFromTMDB(path, params = {}) {
    if (!TMDB_API_KEY) throw new Error("TMDB_API_KEY tapılmadı!");
    
    const queryParams = new URLSearchParams({
        api_key: TMDB_API_KEY,
        language: 'az-AZ', // Məlumatları Azərbaycan dilində istəyirik (dəstəklənməyəndə İngilis gələcək)
        ...params
    }).toString();

    const response = await fetch(`${TMDB_BASE_URL}${path}?${queryParams}`);
    if (!response.ok) throw new Error(`TMDB Xətası: ${response.status}`);
    return await response.json();
}

// === FİLM ROUTES ===

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

// Tək film detalları
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

// === SERİAL (TV) ROUTES ===

app.get('/api/tv/popular', async (req, res) => {
    try {
        const data = await fetchFromTMDB('/tv/popular', { page: req.query.page || 1 });
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/tv/on_the_air', async (req, res) => {
    try {
        const data = await fetchFromTMDB('/tv/on_the_air', { page: req.query.page || 1 });
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

// === KATEQORİYA VƏ AXTARIŞ ===

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

app.get('/api/discover/:type', async (req, res) => {
    try {
        const { with_genres, page } = req.query;
        const data = await fetchFromTMDB(`/discover/${req.params.type}`, { 
            with_genres, 
            page: page || 1,
            sort_by: 'popularity.desc'
        });
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/search', async (req, res) => {
    try {
        const { query, page } = req.query;
        if (!query) return res.status(400).json({ error: 'Query tələb olunur' });
        const data = await fetchFromTMDB('/search/multi', { query, page: page || 1 });
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Serveri başlat
app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda aktivdir.`);
});
