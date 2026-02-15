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

// PENTEST QORUMASI
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(mongoSanitize());
app.use(xssClean());
app.use(hpp());
app.use(express.json({ limit: '15kb' }));
app.use(cors({ origin: true, methods: 'GET,POST,DELETE', credentials: true }));

mongoose.connect(process.env.MONGODB_URI).then(() => console.log('✅ DB Connected'));

const User = mongoose.model('User', new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    watchlist: [{ id: Number, title: String, poster_path: String, movie_type: String }]
}));

async function fetchTMDB(path, params = {}) {
    const q = new URLSearchParams({ api_key: TMDB_API_KEY, ...params, language: 'en-US' });
    try {
        const r = await fetch(`${TMDB_BASE_URL}${path}?${q}`);
        return r.ok ? await r.json() : null;
    } catch (e) { return null; }
}

// ROUTELAR
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        const hashed = await bcrypt.hash(password, 12);
        const user = new User({ fullName, email, username, password: hashed });
        await user.save();
        res.status(201).json({ success: true });
    } catch (e) { res.status(400).json({ error: "Xəta: Email və ya username artıq istifadə olunur." }); }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Səhvdir." });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ success: true, token, user: { fullName: user.fullName, username: user.username } });
});

app.get('/api/home', async (req, res) => {
    const [m, t] = await Promise.all([fetchTMDB('/movie/popular'), fetchTMDB('/tv/popular')]);
    res.json({ featured: m?.results[0], popularMovies: m?.results, popularTV: t?.results });
});

app.get('/api/discover/:type', async (req, res) => {
    const data = await fetchTMDB(`/discover/${req.params.type}`, { with_genres: req.query.with_genres, page: req.query.page || 1 });
    res.json(data || { results: [], total_pages: 1 });
});

app.get('/api/search', async (req, res) => {
    const data = await fetchTMDB('/search/multi', { query: req.query.query, page: req.query.page || 1 });
    res.json(data || { results: [], total_pages: 1 });
});

app.get('/api/movies/popular', async (req, res) => { const d = await fetchTMDB('/movie/popular', { page: req.query.page || 1 }); res.json(d); });
app.get('/api/movies/top_rated', async (req, res) => { const d = await fetchTMDB('/movie/top_rated', { page: req.query.page || 1 }); res.json(d); });
app.get('/api/tv/popular', async (req, res) => { const d = await fetchTMDB('/tv/popular', { page: req.query.page || 1 }); res.json(d); });
app.get('/api/tv/on_the_air', async (req, res) => { const d = await fetchTMDB('/tv/on_the_air', { page: req.query.page || 1 }); res.json(d); });

app.get('/api/details/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    const [d, c, s] = await Promise.all([fetchTMDB(`/${type}/${id}`), fetchTMDB(`/${type}/${id}/credits`), fetchTMDB(`/${type}/${id}/similar`)]);
    res.json({ ...d, cast: c?.cast || [], similar: s?.results || [] });
});

app.get('/api/details/tv/:id/season/:num', async (req, res) => {
    const d = await fetchTMDB(`/tv/${req.params.id}/season/${req.params.num}`);
    res.json(d);
});

app.get('/api/genres/:type/list', async (req, res) => {
    const d = await fetchTMDB(`/genre/${req.params.type}/list`);
    res.json(d?.genres || []);
});

// Watchlist Auth Middleware
const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

app.get('/api/watchlist', auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    res.json(user.watchlist);
});

app.post('/api/watchlist/add', auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    user.watchlist.push(req.body);
    await user.save();
    res.json({ success: true });
});

app.delete('/api/watchlist/remove/:id/:type', auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    user.watchlist = user.watchlist.filter(i => !(i.id == req.params.id && i.movie_type == req.params.type));
    await user.save();
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
