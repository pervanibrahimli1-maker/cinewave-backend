// server.js - CineWave Secure Backend (Full Version)
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Təhlükəsizlik Modulları
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

// 1. HTTP Başlıqlarını Qoru (Helmet)
app.use(helmet({ 
    contentSecurityPolicy: false, // Player iframe-lərinin işləməsi üçün
    crossOriginEmbedderPolicy: false 
}));

// 2. NoSQL Injection Qoruması ($operator hücumlarını bloklayır)
app.use(mongoSanitize());

// 3. XSS Qoruması (Inputlardan HTML teqlərini təmizləyir)
app.use(xss());

// 4. HTTP Parameter Pollution qoruması
app.use(hpp());

// 5. Body Limit (Böyük JSON-larla DoS hücumunun qarşısını alır)
app.use(express.json({ limit: '10kb' }));

// 6. Rate Limiting (DoS və Brute-force qoruması)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 dəqiqə
    max: 100, // Hər IP üçün max 100 sorğu
    message: { error: "Həddindən artıq sorğu. Bir az gözləyin." }
});
app.use('/api/', limiter);

// Login üçün xüsusi sərt limit (Hackerlərin şifrə sınaqlarını bloklayır)
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 15,
    message: { error: "Çox sayda uğursuz cəhd. 1 saatdan sonra yoxlayın." }
});
app.use('/api/auth/', authLimiter);

// 7. CORS
const corsOptions = {
    origin: true, // İstehsalatda bura öz domenini yazmağın tövsiyə olunur
    methods: 'GET,POST,DELETE',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Database Bağlantısı
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Zirehli MongoDB-yə qoşuldu.'))
    .catch(err => console.error('❌ DB Xətası:', err.message));

// İstifadəçi Modeli
const User = mongoose.model('User', new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    email: { type: String, unique: true, required: true, lowercase: true, trim: true },
    username: { type: String, unique: true, required: true, trim: true },
    password: { type: String, required: true },
    watchlist: [{ id: Number, title: String, poster_path: String, movie_type: String }]
}, { timestamps: true }));

// JWT Doğrulama Middleware
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

// TMDB API Yardımçı Funksiyası
async function fetchTMDB(path, params = {}) {
    const query = new URLSearchParams({ api_key: TMDB_API_KEY, ...params, language: 'en-US' });
    try {
        const response = await fetch(`${TMDB_BASE_URL}${path}?${query}`);
        return response.ok ? await response.json() : null;
    } catch (e) { return null; }
}

// ================= API ROUTELAR =================

// Qeydiyyat
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        if (!fullName || !email || !username || password.length < 6) {
            return res.status(400).json({ error: "Məlumatları düzgün daxil edin (Şifrə min. 6 simvol)." });
        }
        const hashedPassword = await bcrypt.hash(password, 12);
        const user = new User({ fullName, email, username, password: hashedPassword });
        await user.save();
        res.status(201).json({ success: true, message: "Qeydiyyat uğurludur." });
    } catch (err) {
        res.status(400).json({ error: "Bu email və ya istifadəçi adı artıq istifadə olunub." });
    }
});

// Giriş
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ error: "E-poçt və ya şifrə yanlışdır." });
        }
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '6h' });
        res.json({ success: true, token, user: { fullName: user.fullName, username: user.username } });
    } catch (e) { res.status(500).json({ error: "Daxili server xətası." }); }
});

// Ana Səhifə Data
app.get('/api/home', async (req, res) => {
    const [popM, popT] = await Promise.all([fetchTMDB('/movie/popular'), fetchTMDB('/tv/popular')]);
    if (!popM || !popT) return res.status(500).json({ error: "TMDB bağlantı xətası." });
    const featured = popM.results[0];
    res.json({
        featured: { ...featured, meta: `IMDb ${featured.vote_average?.toFixed(1)} | ${(featured.release_date || '').split('-')[0]}` },
        popularMovies: popM.results || [],
        popularTV: popT.results || []
    });
});

// Janrlar
app.get('/api/genres/:type/list', async (req, res) => {
    const data = await fetchTMDB(`/genre/${req.params.type}/list`);
    res.json(data ? data.genres : []);
});

// Axtarış
app.get('/api/search', async (req, res) => {
    const data = await fetchTMDB('/search/multi', { query: req.query.query });
    res.json(data ? data.results : []);
});

// Discover (Janr üzrə)
app.get('/api/discover/:type', async (req, res) => {
    const data = await fetchTMDB(`/${req.params.type}/popular`, { with_genres: req.query.with_genres });
    res.json(data ? data.results : []);
});

// Detallar, Aktyorlar və Oxşarlar
app.get('/api/details/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    const [details, credits, similar] = await Promise.all([
        fetchTMDB(`/${type}/${id}`),
        fetchTMDB(`/${type}/${id}/credits`),
        fetchTMDB(`/${type}/${id}/similar`)
    ]);
    if (!details) return res.status(404).json({ error: "Tapılmadı." });
    res.json({ ...details, cast: credits?.cast || [], similar: similar?.results || [] });
});

// TV Sezon Detalları (Bölümlər)
app.get('/api/details/tv/:id/season/:season_number', async (req, res) => {
    const data = await fetchTMDB(`/tv/${req.params.id}/season/${req.params.season_number}`);
    data ? res.json(data) : res.status(404).json({ error: "Sezon tapılmadı." });
});

// Watchlist Əməliyyatları
app.get('/api/watchlist', authenticateToken, async (req, res) => {
    const user = await User.findById(req.user.id);
    res.json(user ? user.watchlist : []);
});

app.post('/api/watchlist/add', authenticateToken, async (req, res) => {
    const { id, title, poster_path, movie_type } = req.body;
    const user = await User.findById(req.user.id);
    if (user.watchlist.some(m => m.id === Number(id) && m.movie_type === movie_type)) {
        return res.status(400).json({ error: "Artıq siyahınızdadır." });
    }
    user.watchlist.push({ id: Number(id), title, poster_path, movie_type });
    await user.save();
    res.json({ success: true });
});

app.delete('/api/watchlist/remove/:id/:type', authenticateToken, async (req, res) => {
    const user = await User.findById(req.user.id);
    user.watchlist = user.watchlist.filter(item => !(item.id === Number(req.params.id) && item.movie_type === req.params.type));
    await user.save();
    res.json({ success: true });
});

// Digər Populyar Listlər
app.get('/api/movies/popular', async (req, res) => {
    const data = await fetchTMDB('/movie/popular');
    res.json(data ? data.results : []);
});
app.get('/api/movies/top_rated', async (req, res) => {
    const data = await fetchTMDB('/movie/top_rated');
    res.json(data ? data.results : []);
});
app.get('/api/tv/popular', async (req, res) => {
    const data = await fetchTMDB('/tv/popular');
    res.json(data ? data.results : []);
});
app.get('/api/tv/on_the_air', async (req, res) => {
    const data = await fetchTMDB('/tv/on_the_air');
    res.json(data ? data.results : []);
});

app.listen(PORT, () => console.log(`🚀 CineWave Secure Server ${PORT} portunda aktivdir.`));
