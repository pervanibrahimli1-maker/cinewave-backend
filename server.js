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

// MongoDB Bağlantısı
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Hazırdır.'))
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
    const lang = params.language || 'az-AZ';
    const queryParams = new URLSearchParams({
        api_key: TMDB_API_KEY,
        language: lang,
        ...params
    });
    const url = `${TMDB_BASE_URL}${path}?${queryParams}`;
    try {
        const response = await fetch(url);
        return await response.json();
    } catch (e) { return {}; }
}

// === AUTH MARŞRUTLARI ===

app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        const existing = await User.findOne({ $or: [{ email }, { username }] });
        if (existing) return res.status(400).json({ success: false, error: "Bu məlumatlar artıq istifadə olunur!" });
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ fullName, email, username, password: hashed });
        await user.save();
        res.status(201).json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !await bcrypt.compare(password, user.password)) 
            return res.status(400).json({ success: false, error: "Email və ya şifrə səhvdir" });
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret');
        res.json({ success: true, token, user: { username: user.username, fullName: user.fullName } });
    } catch (err) { res.status(500).json({ success: false }); }
});

// === WATCHLIST MARŞRUTLARI ===

app.post('/api/watchlist/add', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: "Giriş edilməyib" });
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        const user = await User.findById(decoded.id);
        if (user.watchlist.some(m => m.id === req.body.id)) return res.status(400).json({ error: "Artıq siyahıdadır" });
        user.watchlist.push(req.body);
        await user.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Xəta" }); }
});

// === MƏZMUN MARŞRUTLARI ===

app.get('/api/movies/popular', async (req, res) => {
    const data = await fetchTMDB('/movie/popular');
    res.json(data.results || []);
});

app.get('/api/movies/now_playing', async (req, res) => {
    const data = await fetchTMDB('/movie/now_playing');
    res.json(data.results || []);
});

app.get('/api/genres/:type/list', async (req, res) => {
    const { type } = req.params;
    let data = await fetchTMDB(`/genre/${type}/list`, { language: 'az-AZ' });
    if (!data.genres || data.genres.some(g => !g.name)) {
        data = await fetchTMDB(`/genre/${type}/list`, { language: 'en-US' });
    }
    res.json(data.genres || []);
});

app.get('/api/search', async (req, res) => {
    const data = await fetchTMDB('/search/multi', { query: req.query.query });
    res.json(data.results || []);
});

app.get('/api/discover/genre', async (req, res) => {
    const { genreId, type } = req.query;
    const data = await fetchTMDB(`/discover/${type || 'movie'}`, { with_genres: genreId });
    res.json(data.results || []);
});

// === DETALLAR (AVTO-TƏRCÜMƏ İLƏ) ===

app.get('/api/details/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    try {
        let [details, credits, similar, videos] = await Promise.all([
            fetchTMDB(`/${type}/${id}`, { language: 'az-AZ' }),
            fetchTMDB(`/${type}/${id}/credits`, { language: 'az-AZ' }),
            fetchTMDB(`/${type}/${id}/similar`, { language: 'az-AZ' }),
            fetchTMDB(`/${type}/${id}/videos`, { language: 'az-AZ' })
        ]);

        // Açıqlama yoxdursa İngilis dilindən tərcümə et
        if (!details.overview || details.overview.length < 10) {
            const enData = await fetchTMDB(`/${type}/${id}`, { language: 'en-US' });
            if (enData.overview) {
                try {
                    const tr = await translate(enData.overview, { to: 'az' });
                    details.overview = tr.text;
                } catch (e) { details.overview = enData.overview; }
            }
        }

        // Treyler yoxdursa İngilis dilində axtar
        let video = videos.results?.find(v => v.type === 'Trailer') || videos.results?.[0];
        if (!video) {
            const enV = await fetchTMDB(`/${type}/${id}/videos`, { language: 'en-US' });
            video = enV.results?.find(v => v.type === 'Trailer') || enV.results?.[0];
        }

        res.json({
            ...details,
            cast: credits.cast ? credits.cast.slice(0, 12) : [],
            similar: similar.results ? similar.results.slice(0, 8) : [],
            video: video || null
        });
    } catch (err) { res.status(404).json({ error: "Məlumat tapılmadı" }); }
});

app.listen(PORT, () => console.log(`🚀 Server ${PORT} portunda aktivdir.`));
