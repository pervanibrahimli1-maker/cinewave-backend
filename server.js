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
const JWT_SECRET = process.env.JWT_SECRET || 'cinewave_secret_2026';

// MongoDB Bağlantısı
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Qoşuldu'))
    .catch(err => console.error('❌ MongoDB Xətası:', err));

// İstifadəçi Modeli
const User = mongoose.model('User', new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    watchlist: [{ type: Object }] 
}));

// TMDB Fetcher
async function fetchTMDB(path, params = {}) {
    const queryParams = new URLSearchParams({ api_key: TMDB_API_KEY, ...params });
    try {
        const response = await fetch(`${TMDB_BASE_URL}${path}?${queryParams}`);
        return await response.json();
    } catch (e) { return {}; }
}

// === AUTH SİSTEMİ ===
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ fullName, email, username, password: hashed });
        await user.save();
        res.status(201).json({ success: true });
    } catch (err) { res.status(400).json({ success: false, error: "Qeydiyyat xətası (Email və ya Username artıq mövcuddur)" }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !await bcrypt.compare(password, user.password)) 
            return res.status(400).json({ success: false, error: "Email və ya şifrə yanlışdır" });
        
        const token = jwt.sign({ id: user._id }, JWT_SECRET);
        res.json({ success: true, token, user: { username: user.username, fullName: user.fullName } });
    } catch (err) { res.status(500).json({ success: false }); }
});

// === WATCHLIST SİSTEMİ ===
app.post('/api/watchlist/add', async (req, res) => {
    try {
        const token = req.headers.authorization.split(" ")[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        
        const exists = user.watchlist.some(m => m.id === req.body.id);
        if (exists) return res.status(400).json({ message: "Artıq siyahıdadır" });

        user.watchlist.push(req.body);
        await user.save();
        res.json({ success: true });
    } catch (err) { res.status(401).json({ error: "Giriş edilməyib" }); }
});

app.get('/api/watchlist', async (req, res) => {
    try {
        const token = req.headers.authorization.split(" ")[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        res.json(user.watchlist || []);
    } catch (err) { res.status(401).json({ error: "Giriş edilməyib" }); }
});

// === MƏZMUN YOLLARI ===
app.get('/api/movies/popular', async (req, res) => {
    const data = await fetchTMDB('/movie/popular', { language: 'az-AZ' });
    res.json(data.results || []);
});
app.get('/api/movies/top_rated', async (req, res) => {
    const data = await fetchTMDB('/movie/top_rated', { language: 'az-AZ' });
    res.json(data.results || []);
});
app.get('/api/movies/now_playing', async (req, res) => {
    const data = await fetchTMDB('/movie/now_playing', { language: 'az-AZ' });
    res.json(data.results || []);
});
app.get('/api/tv/popular', async (req, res) => {
    const data = await fetchTMDB('/tv/popular', { language: 'az-AZ' });
    res.json(data.results || []);
});
app.get('/api/tv/on_the_air', async (req, res) => {
    const data = await fetchTMDB('/tv/on_the_air', { language: 'az-AZ' });
    res.json(data.results || []);
});
app.get('/api/genres/:type/list', async (req, res) => {
    const data = await fetchTMDB(`/genre/${req.params.type}/list`, { language: 'az-AZ' });
    res.json(data.genres || []);
});
app.get('/api/search', async (req, res) => {
    const data = await fetchTMDB('/search/multi', { query: req.query.query, language: 'az-AZ' });
    res.json(data.results || []);
});

app.get('/api/details/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    try {
        let [details, credits, similar] = await Promise.all([
            fetchTMDB(`/${type}/${id}`, { language: 'az-AZ' }),
            fetchTMDB(`/${type}/${id}/credits`, { language: 'az-AZ' }),
            fetchTMDB(`/${type}/${id}/similar`, { language: 'az-AZ' })
        ]);

        if (!details.overview || details.overview.length < 5) {
            const en = await fetchTMDB(`/${type}/${id}`, { language: 'en-US' });
            try {
                const tr = await translate(en.overview, { to: 'az' });
                details.overview = tr.text;
            } catch(e) { details.overview = en.overview; }
        }

        res.json({
            ...details,
            cast: credits.cast ? credits.cast.slice(0, 12) : [],
            similar: similar.results || []
        });
    } catch (err) { res.status(404).json({ error: "Tapılmadı" }); }
});

app.listen(PORT, () => console.log(`🚀 Server ${PORT} portunda aktivdir.`));
