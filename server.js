const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { translate } = require('@vitalets/google-translate-api');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const JWT_SECRET = process.env.JWT_SECRET || 'cinewave_2026_key';

mongoose.connect(process.env.MONGODB_URI).then(() => console.log('✅ MongoDB OK.'));

const User = mongoose.model('User', new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    watchlist: [{ id: Number, title: String, poster_path: String, movie_type: String }]
}));

async function fetchTMDB(path, params = {}) {
    const queryParams = new URLSearchParams({ api_key: TMDB_API_KEY, ...params, language: 'az-AZ' });
    try {
        const response = await fetch(`${TMDB_BASE_URL}${path}?${queryParams}`);
        return await response.json();
    } catch (e) { return {}; }
}

// AUTH
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ fullName, email, username, password: hashed });
        await user.save();
        res.status(201).json({ success: true });
    } catch (err) { res.status(400).json({ success: false, error: "Email və ya istifadəçi adı artıq var" }); }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password)) return res.status(400).json({ success: false });
    const token = jwt.sign({ id: user._id }, JWT_SECRET);
    res.json({ success: true, token, user: { username: user.username, fullName: user.fullName } });
});

// CONTENT
app.get('/api/home', async (req, res) => {
    const pop = await fetchTMDB('/movie/popular');
    const featured = pop.results ? pop.results[0] : null;
    res.json({
        featured: featured ? { ...featured, custom_meta: `IMDb ${featured.vote_average.toFixed(1)} | ${(featured.release_date || '').split('-')[0]}` } : null,
        popularMovies: pop.results || []
    });
});

app.get('/api/genres/:type/list', async (req, res) => {
    const data = await fetchTMDB(`/genre/${req.params.type}/list`);
    res.json(data.genres || []);
});

app.get('/api/search', async (req, res) => {
    const data = await fetchTMDB('/search/multi', { query: req.query.query });
    res.json(data.results || []);
});

app.get('/api/details/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    const [details, credits, similar] = await Promise.all([
        fetchTMDB(`/${type}/${id}`),
        fetchTMDB(`/${type}/${id}/credits`),
        fetchTMDB(`/${type}/${id}/similar`)
    ]);
    res.json({ ...details, cast: credits.cast ? credits.cast.slice(0, 15) : [], similar: similar.results || [] });
});

// WATCHLIST ADD (SERVER FIX)
app.post('/api/watchlist/add', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Giriş yoxdur" });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { id, title, poster_path, movie_type } = req.body;
        const user = await User.findById(decoded.id);
        if (!user.watchlist.some(m => m.id === id)) {
            user.watchlist.push({ id, title, poster_path, movie_type });
            await user.save();
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Xəta" }); }
});

app.get('/api/watchlist', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    res.json(user.watchlist || []);
});

app.listen(PORT, () => console.log(`🚀 OK.`));
