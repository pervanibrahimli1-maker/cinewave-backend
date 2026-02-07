const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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

// TMDB-dən məlumat çəkmək üçün köməkçi funksiya
async function fetchTMDB(path, params = {}) {
    const url = `${TMDB_BASE_URL}${path}?api_key=${TMDB_API_KEY}&language=az-AZ&${new URLSearchParams(params)}`;
    try {
        const response = await fetch(url);
        return await response.json();
    } catch (e) {
        return {};
    }
}

// === AUTH (QEYDİYYAT VƏ GİRİŞ) ===
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        const existing = await User.findOne({ $or: [{ email }, { username }] });
        if (existing) return res.status(400).json({ success: false, error: "Email və ya istifadəçi adı artıq mövcuddur" });
        
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ fullName, email, username, password: hashed });
        await user.save();
        res.status(201).json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: "Server xətası" }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !await bcrypt.compare(password, user.password)) 
            return res.status(400).json({ success: false, error: "Email və ya şifrə səhvdir" });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret');
        res.json({ success: true, token, user: { username: user.username, fullName: user.fullName } });
    } catch (err) { res.status(500).json({ success: false, error: "Giriş xətası" }); }
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

app.get('/api/movies/top_rated', async (req, res) => {
    const data = await fetchTMDB('/movie/top_rated');
    res.json(data.results || []);
});

app.get('/api/tv/popular', async (req, res) => {
    const data = await fetchTMDB('/tv/popular');
    res.json(data.results || []);
});

app.get('/api/tv/on_the_air', async (req, res) => {
    const data = await fetchTMDB('/tv/on_the_air');
    res.json(data.results || []);
});

app.get('/api/genres/movie/list', async (req, res) => {
    const data = await fetchTMDB('/genre/movie/list');
    res.json(data.genres || []);
});

app.get('/api/genres/tv/list', async (req, res) => {
    const data = await fetchTMDB('/genre/tv/list');
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

// DETALLAR (ƏN SONDA OLMALIDIR)
app.get('/api/details/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    try {
        const [details, credits, similar, videos] = await Promise.all([
            fetchTMDB(`/${type}/${id}`),
            fetchTMDB(`/${type}/${id}/credits`),
            fetchTMDB(`/${type}/${id}/similar`),
            fetchTMDB(`/${type}/${id}/videos`)
        ]);
        res.json({
            ...details,
            cast: credits.cast ? credits.cast.slice(0, 12) : [],
            similar: similar.results ? similar.results.slice(0, 8) : [],
            video: videos.results ? (videos.results.find(v => v.type === 'Trailer') || videos.results[0]) : null
        });
    } catch (e) {
        res.status(404).json({ error: "Məlumat tapılmadı" });
    }
});

app.listen(PORT, () => console.log(`🚀 Server ${PORT} portunda aktivdir`));
