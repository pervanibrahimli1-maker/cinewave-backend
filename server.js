// server.js - CineWave Ultimate Secure Backend (Duplicate & Validation Fixed)
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

// 1. TƏHLÜKƏSİZLİK ZİREHİ (Helmet, NoSQL, XSS, HPP)
app.use(helmet({ 
    contentSecurityPolicy: false, 
    crossOriginEmbedderPolicy: false 
}));
app.use(mongoSanitize());
app.use(xssClean());
app.use(hpp());
app.use(express.json({ limit: '15kb' }));

// DoS və Brute-force Qoruması
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { error: "Həddindən artıq sorğu gönderildi. Bir az gözləyin." }
});
app.use('/api/', limiter);

// 2. CORS (Bütün domenlərə icazə verilir)
app.use(cors({
    origin: true,
    methods: 'GET,POST,DELETE',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// MongoDB Bağlantısı
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ CineWave Database Secured & Connected.'))
    .catch(error => console.error('❌ MongoDB Connection Error:', error));

// İstifadəçi Modeli
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    email: { type: String, unique: true, required: true, lowercase: true, trim: true },
    username: { type: String, unique: true, required: true, trim: true },
    password: { type: String, required: true },
    watchlist: [{ 
        id: Number, 
        title: String, 
        poster_path: String, 
        movie_type: String 
    }]
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// JWT Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Giriş tələb olunur." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token etibarsızdır." });
        req.user = user;
        next();
    });
};

// TMDB Fetcher
async function fetchFromTMDB(path, params = {}) {
    const qParams = new URLSearchParams({ api_key: TMDB_API_KEY, ...params, language: 'en-US' });
    try {
        const response = await fetch(`${TMDB_BASE_URL}${path}?${qParams}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) { return null; }
}

// ================= API ROUTELAR =================

// Auth: Qeydiyyat (Email və Username dublikat qoruması daxil)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        if (!fullName || !email || !username || !password || password.length < 6) {
            return res.status(400).json({ error: "Məlumatları düzgün daxil edin (Şifrə min. 6 simvol)." });
        }
        
        const emailExists = await User.findOne({ email: email.toLowerCase() });
        if (emailExists) return res.status(400).json({ error: "Bu email artıq qeydiyyatdan keçib." });

        const usernameExists = await User.findOne({ username });
        if (usernameExists) return res.status(400).json({ error: "Bu istifadəçi adı artıq götürülüb." });

        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = new User({ fullName, email, username, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ success: true, message: "Qeydiyyat uğurludur." });
    } catch (error) {
        res.status(500).json({ error: "Server xətası baş verdi." });
    }
});

// Auth: Giriş
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ error: "E-poçt və ya şifrə yanlışdır." });
        }
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ success: true, token, user: { fullName: user.fullName, username: user.username } });
    } catch (error) {
        res.status(500).json({ error: "Daxili server xətası." });
    }
});

// Watchlist: Əlavə etmə (DƏQİQ DÜBLİKAT QORUMASI)
app.post('/api/watchlist/add', authenticateToken, async (req, res) => {
    try {
        const { id, title, poster_path, movie_type } = req.body;
        const user = await User.findById(req.user.id);
        
        // Dublikat yoxlanışı (Number(id) istifadə edərək tipləri bərabərləşdiririk)
        const isDuplicate = user.watchlist.some(item => Number(item.id) === Number(id));
        
        if (isDuplicate) {
            return res.status(400).json({ error: "Bu film artıq siyahınızdadır." });
        }

        user.watchlist.push({ id: Number(id), title, poster_path, movie_type });
        await user.save();
        res.json({ success: true, message: "Siyahıya əlavə edildi." });
    } catch (error) {
        res.status(500).json({ error: "Xəta baş verdi." });
    }
});

// Discover: Kateqoriya və Səhifələmə
app.get('/api/discover/:type', async (req, res) => {
    const { type } = req.params;
    const data = await fetchFromTMDB(`/discover/${type}`, { 
        with_genres: req.query.with_genres, 
        page: req.query.page || 1,
        sort_by: 'popularity.desc'
    });
    res.json(data || { results: [], total_pages: 1 });
});

// Home: Ana Səhifə
app.get('/api/home', async (req, res) => {
    const [movies, series] = await Promise.all([fetchFromTMDB('/movie/popular'), fetchFromTMDB('/tv/popular')]);
    if (!movies) return res.status(500).json({ error: "Bağlantı xətası" });
    const featured = movies.results[0];
    res.json({
        featured: featured ? { 
            ...featured, 
            meta: featured.vote_average?.toFixed(1),
            year: (featured.release_date || '').split('-')[0]
        } : null,
        popularMovies: movies.results || [],
        popularTV: series?.results || []
    });
});

// Search
app.get('/api/search', async (req, res) => {
    const data = await fetchFromTMDB('/search/multi', { query: req.query.query, page: req.query.page || 1 });
    res.json(data || { results: [], total_pages: 1 });
});

// Watchlist: Çəkmə
app.get('/api/watchlist', authenticateToken, async (req, res) => {
    const user = await User.findById(req.user.id);
    res.json(user ? user.watchlist : []);
});

// Watchlist: Silmə
app.delete('/api/watchlist/remove/:id/:type', authenticateToken, async (req, res) => {
    const user = await User.findById(req.user.id);
    user.watchlist = user.watchlist.filter(i => !(Number(i.id) === Number(req.params.id) && i.movie_type === req.params.type));
    await user.save();
    res.json({ success: true });
});

// Digər API endpointləri
app.get('/api/details/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    const [det, cred, sim] = await Promise.all([fetchFromTMDB(`/${type}/${id}`), fetchFromTMDB(`/${type}/${id}/credits`), fetchFromTMDB(`/${type}/${id}/similar`)]);
    res.json({ ...det, cast: cred?.cast || [], similar: sim?.results || [] });
});

app.get('/api/details/tv/:id/season/:num', async (req, res) => {
    const data = await fetchFromTMDB(`/tv/${req.params.id}/season/${req.params.num}`);
    res.json(data || { episodes: [] });
});

app.get('/api/genres/:type/list', async (req, res) => {
    const data = await fetchFromTMDB(`/genre/${req.params.type}/list`);
    res.json(data ? data.genres : []);
});

app.get('/api/movies/popular', async (req, res) => { const d = await fetchFromTMDB('/movie/popular', { page: req.query.page || 1 }); res.json(d); });
app.get('/api/tv/popular', async (req, res) => { const d = await fetchFromTMDB('/tv/popular', { page: req.query.page || 1 }); res.json(d); });

app.listen(PORT, () => console.log(`🚀 CineWave Secure Backend running on port ${PORT}`));
