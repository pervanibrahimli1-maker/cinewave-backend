// server.js - CineWave Ultimate Secure Backend (FINAL - NO SHORTCUTS)
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Təhlükəsizlik Paketləri
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xssClean = require('xss-clean');
const hpp = require('hpp');

dotenv.config();
const app = express();

// RENDER XƏTASINI DÜZƏLDƏN SƏTİR (MÜTLƏQDİR)
app.set('trust proxy', 1); 

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
app.use(cors({ origin: true, methods: 'GET,POST,DELETE', credentials: true }));

// DoS qoruması
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { error: "Limit keçildi. Bir az gözləyin." }
});
app.use('/api/', limiter);

// 2. MONGODB BAĞLANTISI
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ CineWave Database Secured & Connected.'))
    .catch(error => console.error('❌ MongoDB Connection Error:', error));

// 3. İSTİFADƏÇİ MODELİ
const User = mongoose.model('User', new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    email: { type: String, unique: true, required: true, lowercase: true },
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    watchlist: [{ id: Number, title: String, poster_path: String, movie_type: String }]
}, { timestamps: true }));

// 4. JWT AUTH MIDDLEWARE
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Giriş tələb olunur." });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token etibarsızdır." });
        req.user = user;
        next();
    });
};

// 5. TMDB API YARDIMÇISI
async function fetchTMDB(path, params = {}) {
    const query = new URLSearchParams({ api_key: TMDB_API_KEY, ...params, language: 'en-US' });
    try {
        const response = await fetch(`${TMDB_BASE_URL}${path}?${query}`);
        return response.ok ? await response.json() : null;
    } catch (e) { return null; }
}

// ================= API ROUTELARI =================

// --- AUTHENTICATION ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        const exists = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
        if (exists) return res.status(400).json({ error: "Email və ya istifadəçi adı artıq götürülüb." });
        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = new User({ fullName, email: email.toLowerCase(), username, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ success: true });
    } catch (e) { res.status(500).json({ error: "Xəta." }); }
});

app.post('/api/auth/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email.toLowerCase() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(400).json({ error: "Email və ya şifrə yanlışdır." });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ success: true, token, user: { fullName: user.fullName, username: user.username } });
});

// --- HOME PAGE (TRUE NEW RELEASES FIX) ---
app.get('/api/home', async (req, res) => {
    const currentYear = new Date().getFullYear();
    const startDate = `${currentYear - 1}-01-01`; // Son 1-2 ilin serialları üçün
    const [popularMovies, trulyNewTV] = await Promise.all([
        fetchTMDB('/movie/popular'),
        fetchTMDB('/discover/tv', { 'first_air_date.gte': startDate, 'sort_by': 'popularity.desc' })
    ]);
    const featured = popularMovies?.results[0];
    res.json({
        featured: featured ? { ...featured, meta: featured.vote_average?.toFixed(1), year: (featured.release_date || '').split('-')[0] } : null,
        popularMovies: popularMovies?.results || [],
        popularTV: trulyNewTV?.results || []
    });
});

// --- CONTENT LISTS & PAGINATION ---
app.get('/api/discover/:type', async (req, res) => {
    const { type } = req.params;
    const { with_genres, year, page } = req.query;
    let params = { with_genres, page: page || 1, sort_by: 'popularity.desc' };
    if (year) {
        if (type === 'movie') params.primary_release_year = year;
        else params.first_air_date_year = year;
    }
    const data = await fetchTMDB(`/discover/${type}`, params);
    res.json(data || { results: [], total_pages: 1 });
});

app.get('/api/movies/popular', async (req, res) => { res.json(await fetchTMDB('/movie/popular', { page: req.query.page || 1 })); });
app.get('/api/tv/popular', async (req, res) => { res.json(await fetchTMDB('/tv/popular', { page: req.query.page || 1 })); });

app.get('/api/search', async (req, res) => {
    const data = await fetchTMDB('/search/multi', { query: req.query.query, page: req.query.page || 1 });
    res.json(data || { results: [], total_pages: 1 });
});

app.get('/api/details/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    const [d, c, s] = await Promise.all([fetchTMDB(`/${type}/${id}`), fetchTMDB(`/${type}/${id}/credits`), fetchTMDB(`/${type}/${id}/similar`)]);
    if (!d) return res.status(404).json({ error: "Tapılmadı" });
    res.json({ ...d, cast: c?.cast || [], similar: s?.results || [] });
});

app.get('/api/details/tv/:id/season/:num', async (req, res) => {
    res.json(await fetchTMDB(`/tv/${req.params.id}/season/${req.params.num}`));
});

app.get('/api/genres/:type/list', async (req, res) => {
    const d = await fetchTMDB(`/genre/${req.params.type}/list`);
    res.json(d?.genres || []);
});

// --- WATCHLIST (SILME VE TEMIZLEME) ---
app.get('/api/watchlist', authMiddleware, async (req, res) => {
    const user = await User.findById(req.user.id);
    res.json(user ? user.watchlist : []);
});

app.post('/api/watchlist/add', authMiddleware, async (req, res) => {
    const user = await User.findById(req.user.id);
    const exists = user.watchlist.some(m => Number(m.id) === Number(req.body.id));
    if (exists) return res.status(400).json({ error: "Bu artıq siyahınızdadır!" });
    user.watchlist.push(req.body);
    await user.save();
    res.json({ success: true });
});

app.delete('/api/watchlist/remove/:id/:type', authMiddleware, async (req, res) => {
    const user = await User.findById(req.user.id);
    user.watchlist = user.watchlist.filter(i => !(Number(i.id) === Number(req.params.id) && i.movie_type === req.params.type));
    await user.save();
    res.json({ success: true });
});

app.delete('/api/watchlist/clear', authMiddleware, async (req, res) => {
    const user = await User.findById(req.user.id);
    user.watchlist = [];
    await user.save();
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`🚀 Secure CineWave Server Running on ${PORT}`));
