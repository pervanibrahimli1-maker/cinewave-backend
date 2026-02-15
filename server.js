// server.js - CineWave Secure Backend (Final Full Version)
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xssClean = require('xss-clean');
const hpp = require('hpp');

dotenv.config();
const app = express();

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// 1. TƏHLÜKƏSİZLİK (Pentester qoruması)
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(mongoSanitize());
app.use(xssClean());
app.use(hpp());
app.use(express.json({ limit: '15kb' }));
app.use(cors({ origin: true, methods: 'GET,POST,DELETE', credentials: true }));

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Secure Database Connected.'))
    .catch(error => console.error('❌ DB Error:', error));

// İstifadəçi Modeli
const User = mongoose.model('User', new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    watchlist: [{ id: Number, title: String, poster_path: String, movie_type: String }]
}, { timestamps: true }));

// TMDB Fetcher
async function fetchFromTMDB(path, params = {}) {
    const q = new URLSearchParams({ api_key: TMDB_API_KEY, ...params, language: 'en-US' });
    try {
        const response = await fetch(`${TMDB_BASE_URL}${path}?${q}`);
        return response.ok ? await response.json() : null;
    } catch (e) { return null; }
}

// JWT Auth Middleware
const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Giriş lazımdır." });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token səhvdir." });
        req.user = user;
        next();
    });
};

// ================= API ROUTELAR =================

// Auth
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        const exists = await User.findOne({ $or: [{ email }, { username }] });
        if (exists) return res.status(400).json({ error: "Email və ya istifadəçi adı artıq var." });
        
        const hashed = await bcrypt.hash(password, 12);
        const user = new User({ fullName, email, username, password: hashed });
        await user.save();
        res.status(201).json({ success: true });
    } catch (e) { res.status(500).json({ error: "Server xətası." }); }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Məlumatlar yanlışdır." });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ success: true, token, user: { fullName: user.fullName, username: user.username } });
});

// Watchlist: Əlavə etmə (DÜBLİKAT QORUMASI)
app.post('/api/watchlist/add', auth, async (req, res) => {
    try {
        const { id, title, poster_path, movie_type } = req.body;
        const user = await User.findById(req.user.id);
        
        // Eyni filmin siyahıda olub-olmadığını yoxla
        const isExist = user.watchlist.some(item => Number(item.id) === Number(id));
        if (isExist) {
            return res.status(400).json({ error: "Bu məzmun artıq izləmə siyahınızdadır!" });
        }

        user.watchlist.push({ id: Number(id), title, poster_path, movie_type });
        await user.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Xəta baş verdi." }); }
});

// Watchlist: Tək-tək Silmə
app.delete('/api/watchlist/remove/:id/:type', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        user.watchlist = user.watchlist.filter(i => !(Number(i.id) === Number(req.params.id) && i.movie_type === req.params.type));
        await user.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Silmə zamanı xəta." }); }
});

// Watchlist: Hamısını Silmə (NEW)
app.delete('/api/watchlist/clear', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        user.watchlist = [];
        await user.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Təmizləmə zamanı xəta." }); }
});

app.get('/api/watchlist', auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    res.json(user ? user.watchlist : []);
});

// Content
app.get('/api/home', async (req, res) => {
    const [m, t] = await Promise.all([fetchFromTMDB('/movie/popular'), fetchFromTMDB('/tv/popular')]);
    res.json({ featured: m?.results[0], popularMovies: m?.results, popularTV: t?.results });
});

app.get('/api/discover/:type', async (req, res) => {
    const d = await fetchFromTMDB(`/discover/${req.params.type}`, { with_genres: req.query.with_genres, page: req.query.page || 1, sort_by: 'popularity.desc' });
    res.json(d || { results: [], total_pages: 1 });
});

app.get('/api/search', async (req, res) => {
    const d = await fetchFromTMDB('/search/multi', { query: req.query.query, page: req.query.page || 1 });
    res.json(d || { results: [], total_pages: 1 });
});

app.get('/api/details/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    const [d, c, s] = await Promise.all([fetchFromTMDB(`/${type}/${id}`), fetchFromTMDB(`/${type}/${id}/credits`), fetchFromTMDB(`/${type}/${id}/similar`)]);
    res.json({ ...d, cast: c?.cast || [], similar: s?.results || [] });
});

app.get('/api/details/tv/:id/season/:num', async (req, res) => {
    const d = await fetchFromTMDB(`/tv/${req.params.id}/season/${req.params.num}`);
    res.json(d || { episodes: [] });
});

app.get('/api/genres/:type/list', async (req, res) => {
    const d = await fetchFromTMDB(`/genre/${req.params.type}/list`);
    res.json(d?.genres || []);
});

// Populyar listlər
app.get('/api/movies/popular', async (req, res) => { const d = await fetchFromTMDB('/movie/popular', { page: req.query.page || 1 }); res.json(d); });
app.get('/api/tv/popular', async (req, res) => { const d = await fetchFromTMDB('/tv/popular', { page: req.query.page || 1 }); res.json(d); });

app.listen(PORT, () => console.log(`🚀 CineWave Secure Backend on ${PORT}`));
