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

// TMDB Fetcher Funksiyası
async function fetchTMDB(path, params = {}) {
    const queryParams = new URLSearchParams({
        api_key: TMDB_API_KEY,
        ...params
    });
    const url = `${TMDB_BASE_URL}${path}?${queryParams}`;
    try {
        const response = await fetch(url);
        return await response.json();
    } catch (e) { return {}; }
}

// === AUTH (GİRİŞ/QEYDİYYAT) ===
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        const existing = await User.findOne({ $or: [{ email }, { username }] });
        if (existing) return res.status(400).json({ success: false, error: "Email və ya istifadəçi adı artıq mövcuddur!" });
        
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ fullName, email, username, password: hashed });
        await user.save();
        res.status(201).json({ success: true, message: "Uğurla qeydiyyatdan keçdiniz!" });
    } catch (err) { res.status(500).json({ success: false, error: "Server xətası baş verdi." }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !await bcrypt.compare(password, user.password)) 
            return res.status(400).json({ success: false, error: "Email və ya şifrə yanlışdır!" });
        
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret');
        res.json({ success: true, token, user: { username: user.username, fullName: user.fullName } });
    } catch (err) { res.status(500).json({ success: false, error: "Server xətası baş verdi." }); }
});

// === MƏZMUN YOLLARI ===

// Filmlər
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

// Seriallar
app.get('/api/tv/popular', async (req, res) => {
    const data = await fetchTMDB('/tv/popular', { language: 'az-AZ' });
    res.json(data.results || []);
});

app.get('/api/tv/on_the_air', async (req, res) => {
    const data = await fetchTMDB('/tv/on_the_air', { language: 'az-AZ' });
    res.json(data.results || []);
});

// Janrlar
app.get('/api/genres/:type/list', async (req, res) => {
    const { type } = req.params;
    const data = await fetchTMDB(`/genre/${type}/list`, { language: 'az-AZ' });
    res.json(data.genres || []);
});

// Axtarış
app.get('/api/search', async (req, res) => {
    const data = await fetchTMDB('/search/multi', { query: req.query.query, language: 'az-AZ' });
    res.json(data.results || []);
});

// Detallar (Və Tərcümə)
app.get('/api/details/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    try {
        let [details, credits, similar] = await Promise.all([
            fetchTMDB(`/${type}/${id}`, { language: 'az-AZ' }),
            fetchTMDB(`/${type}/${id}/credits`, { language: 'az-AZ' }),
            fetchTMDB(`/${type}/${id}/similar`, { language: 'az-AZ' })
        ]);

        if (!details.overview || details.overview.length < 5) {
            const enData = await fetchTMDB(`/${type}/${id}`, { language: 'en-US' });
            try {
                const tr = await translate(enData.overview, { to: 'az' });
                details.overview = tr.text;
            } catch (e) { details.overview = enData.overview; }
        }

        res.json({
            ...details,
            cast: credits.cast ? credits.cast.slice(0, 10) : [],
            similar: similar.results ? similar.results.slice(0, 8) : []
        });
    } catch (err) { res.status(404).json({ error: "Məlumat tapılmadı" }); }
});

app.listen(PORT, () => console.log(`🚀 CineWave Backend ${PORT} portunda aktivdir.`));
