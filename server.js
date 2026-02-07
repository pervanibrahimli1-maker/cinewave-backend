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

const PORT = process.env.PORT || 3000;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// === MONGODB CONNECTION ===
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB Hazırdır.'))
    .catch(err => console.error('MongoDB Bağlantı Xətası:', err));

// === USER MODEL ===
const User = mongoose.model('User', new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    watchlist: [{ type: Object }] 
}));

// === JWT AUTH MIDDLEWARE ===
const verifyToken = (req, res, next) => {
    const authHeader = req.header('Authorization');
    if (!authHeader) return res.status(401).json({ error: "Giriş qadağandır!" });

    try {
        const token = authHeader.split(" ")[1];
        const verified = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ error: "Möhür keçərsizdir!" });
    }
};

// === TMDB PROXY FUNCTION ===
async function fetchTMDB(path, params = {}) {
    const url = `${TMDB_BASE_URL}${path}?api_key=${TMDB_API_KEY}&language=az-AZ&${new URLSearchParams(params)}`;
    const response = await fetch(url);
    const data = await response.json();
    return data;
}

// === AUTH ROUTES === (Olduğu kimi qalır)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        const existing = await User.findOne({ $or: [{ email }, { username }] });
        if (existing) return res.status(400).json({ success: false, error: "Email və ya istifadəçi adı artıq istifadə olunur!" });
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ fullName, email, username, password: hashed, watchlist: [] });
        await user.save();
        res.status(201).json({ success: true, message: "Qeydiyyat uğurludur" });
    } catch (err) { res.status(500).json({ success: false, error: "Server xətası" }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !await bcrypt.compare(password, user.password)) return res.status(400).json({ success: false, error: "Email və ya şifrə səhvdir!" });
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret');
        res.json({ success: true, token, user: { id: user._id, fullName: user.fullName, username: user.username } });
    } catch (err) { res.status(500).json({ success: false, error: "Giriş xətası" }); }
});

// === MOVIE & TV ROUTES ===
app.get('/api/movies/popular', async (req, res) => {
    const data = await fetchTMDB('/movie/popular');
    res.json(data.results || []); // Burada .results mütləqdir!
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

app.get('/api/search', async (req, res) => {
    const data = await fetchTMDB('/search/multi', { query: req.query.query });
    res.json(data.results || []);
});

// Kateqoriyalar üçün bu endpointləri də server.js-ə əlavə etdiyindən əmin ol:
app.get('/api/genres/movie/list', async (req, res) => {
    const data = await fetchTMDB('/genre/movie/list');
    res.json(data.genres || []);
});

app.get('/api/genres/tv/list', async (req, res) => {
    const data = await fetchTMDB('/genre/tv/list');
    res.json(data.genres || []);
});

app.get('/api/discover/genre', async (req, res) => {
    const { genreId, type } = req.query;
    const data = await fetchTMDB(`/discover/${type || 'movie'}`, { with_genres: genreId });
    res.json(data.results || []);
});

// Detallı məlumat (Obyekt qaytarır)
app.get('/api/movie/:id', async (req, res) => res.json(await fetchTMDB(`/movie/${req.params.id}`)));
app.get('/api/tv/:id', async (req, res) => res.json(await fetchTMDB(`/tv/${req.params.id}`)));

// Axtarış
app.get('/api/search', async (req, res) => {
    const data = await fetchTMDB('/search/multi', { query: req.query.query });
    res.json(data.results);
});

// JANR SİYAHISI (Kateqoriyalar səhifəsi üçün)
app.get('/api/genres/movie/list', async (req, res) => {
    const data = await fetchTMDB('/genre/movie/list');
    res.json(data.genres);
});

app.get('/api/genres/tv/list', async (req, res) => {
    const data = await fetchTMDB('/genre/tv/list');
    res.json(data.genres);
});

// JANRA GÖRƏ FİLTRLƏMƏ
app.get('/api/discover/genre', async (req, res) => {
    const { genreId, type } = req.query; // type: 'movie' və ya 'tv'
    const data = await fetchTMDB(`/discover/${type || 'movie'}`, { with_genres: genreId });
    res.json(data.results);
});

app.listen(PORT, () => console.log(`Server ${PORT} portunda aktivdir`));
