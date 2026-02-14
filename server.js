// server.js - CineWave Secure Backend (Full)
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

dotenv.config();
const app = express();

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// --- TƏHLÜKƏSİZLİK ZİREHİ ---
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());
app.use(express.json({ limit: '15kb' }));

// DoS qoruması
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: "Limit keçildi." } });
app.use('/api/', limiter);

app.use(cors({ origin: true, methods: 'GET,POST,DELETE', credentials: true }));

// MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Secure DB Connected'))
    .catch(err => console.error('❌ DB Error:', err));

const User = mongoose.model('User', new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    email: { type: String, unique: true, required: true, lowercase: true },
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    watchlist: [{ id: Number, title: String, poster_path: String, movie_type: String }]
}));

// TMDB Fetcher
async function fetchTMDB(path, params = {}) {
    const q = new URLSearchParams({ api_key: TMDB_API_KEY, ...params, language: 'en-US' });
    try {
        const response = await fetch(`${TMDB_BASE_URL}${path}?${q}`);
        return response.ok ? await response.json() : null;
    } catch (e) { return null; }
}

// JWT Middleware
const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Giriş lazımdır" });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token xətası" });
        req.user = user;
        next();
    });
};

// ================= API ROUTELAR =================

// Auth
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        const hashed = await bcrypt.hash(password, 12);
        const user = new User({ fullName, email, username, password: hashed });
        await user.save();
        res.status(201).json({ success: true });
    } catch (err) { res.status(400).json({ error: "Email və ya username artıq var." }); }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Səhv məlumat." });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ success: true, token, user: { fullName: user.fullName, username: user.username } });
});

// Kateqoriya/Discover (DÜZƏLDİLDİ - Çoxlu nəticə gətirir)
app.get('/api/discover/:type', async (req, res) => {
    const data = await fetchTMDB(`/discover/${req.params.type}`, { 
        with_genres: req.query.with_genres,
        sort_by: 'popularity.desc',
        page: 1
    });
    res.json(data ? data.results : []);
});

app.get('/api/home', async (req, res) => {
    const [popM, popT] = await Promise.all([fetchTMDB('/movie/popular'), fetchTMDB('/tv/popular')]);
    res.json({
        featured: popM?.results[0],
        popularMovies: popM?.results || [],
        popularTV: popT?.results || []
    });
});

app.get('/api/search', async (req, res) => {
    const data = await fetchTMDB('/search/multi', { query: req.query.query });
    res.json(data ? data.results : []);
});

app.get('/api/genres/:type/list', async (req, res) => {
    const data = await fetchTMDB(`/genre/${req.params.type}/list`);
    res.json(data ? data.genres : []);
});

app.get('/api/details/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    const [det, cred, sim] = await Promise.all([
        fetchTMDB(`/${type}/${id}`), fetchTMDB(`/${type}/${id}/credits`), fetchTMDB(`/${type}/${id}/similar`)
    ]);
    res.json({ ...det, cast: cred?.cast || [], similar: sim?.results || [] });
});

app.get('/api/details/tv/:id/season/:num', async (req, res) => {
    const data = await fetchTMDB(`/tv/${req.params.id}/season/${req.params.num}`);
    res.json(data || { episodes: [] });
});

// Watchlist
app.get('/api/watchlist', auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    res.json(user ? user.watchlist : []);
});

app.post('/api/watchlist/add', auth, async (req, res) => {
    const { id, title, poster_path, movie_type } = req.body;
    const user = await User.findById(req.user.id);
    if (!user.watchlist.some(m => m.id === Number(id))) {
        user.watchlist.push({ id: Number(id), title, poster_path, movie_type });
        await user.save();
    }
    res.json({ success: true });
});

app.delete('/api/watchlist/remove/:id/:type', auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    user.watchlist = user.watchlist.filter(i => !(i.id === Number(req.params.id) && i.movie_type === req.params.type));
    await user.save();
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`🚀 Secure Server on ${PORT}`));
