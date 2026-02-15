// server.js - CineWave Ultimate Secure Backend
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Təhlükəsizlik Paketləri (Pentester hücumlarına qarşı mütləqdir)
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

// 1. Təhlükəsizlik Başlıqları (Helmet)
app.use(helmet({ 
    contentSecurityPolicy: false, 
    crossOriginEmbedderPolicy: false 
}));

// 2. NoSQL Injection Qoruması (MongoSanitize)
app.use(mongoSanitize());

// 3. XSS Qoruması (Mətn daxilində kod işlədilməsini bloklayır)
app.use(xssClean());

// 4. HTTP Parameter Pollution qoruması
app.use(hpp());

// 5. Body Limit (DoS hücumlarının qarşısını alır)
app.use(express.json({ limit: '15kb' }));

// 6. Rate Limiting (Hər IP üçün 15 dəqiqədə 200 sorğu)
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: "Çox sayda sorğu gönderildi. Bir az gözləyin." }
});
app.use('/api/', generalLimiter);

// 7. CORS Konfiqurasiyası
app.use(cors({
    origin: true,
    methods: 'GET,POST,DELETE',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// MongoDB Bağlantısı
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ CineWave Secure Database Connected.'))
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

// JWT Middleware (Avtorizasiya üçün)
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

// TMDB Yardımçı Funksiyası
async function fetchFromTMDB(path, params = {}) {
    const queryParameters = new URLSearchParams({ 
        api_key: TMDB_API_KEY, 
        ...params, 
        language: 'en-US' 
    });
    try {
        const response = await fetch(`${TMDB_BASE_URL}${path}?${queryParameters}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        return null;
    }
}

// ================= API ROUTELAR =================

// Qeydiyyat
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        if (!fullName || !email || !username || !password || password.length < 6) {
            return res.status(400).json({ error: "Məlumatları düzgün daxil edin (Şifrə min. 6 simvol)." });
        }
        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = new User({ fullName, email, username, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ success: true, message: "Qeydiyyat uğurludur." });
    } catch (error) {
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
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ 
            success: true, 
            token, 
            user: { fullName: user.fullName, username: user.username } 
        });
    } catch (error) {
        res.status(500).json({ error: "Daxili server xətası." });
    }
});

// Kateqoriya üzrə kəşf (Discover)
app.get('/api/discover/:type', async (req, res) => {
    const { type } = req.params;
    const { with_genres } = req.query;
    const data = await fetchFromTMDB(`/discover/${type}`, { 
        with_genres: with_genres,
        sort_by: 'popularity.desc',
        include_adult: false,
        page: 1
    });
    res.json(data ? data.results : []);
});

// Ana səhifə datası
app.get('/api/home', async (req, res) => {
    const [movies, series] = await Promise.all([
        fetchFromTMDB('/movie/popular'),
        fetchFromTMDB('/tv/popular')
    ]);
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

// Axtarış
app.get('/api/search', async (req, res) => {
    const data = await fetchFromTMDB('/search/multi', { query: req.query.query });
    res.json(data ? data.results : []);
});

// Janr siyahıları
app.get('/api/genres/:type/list', async (req, res) => {
    const data = await fetchFromTMDB(`/genre/${req.params.type}/list`);
    res.json(data ? data.genres : []);
});

// Detallar
app.get('/api/details/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    const [details, credits, similar] = await Promise.all([
        fetchFromTMDB(`/${type}/${id}`),
        fetchFromTMDB(`/${type}/${id}/credits`),
        fetchFromTMDB(`/${type}/${id}/similar`)
    ]);
    if (!details) return res.status(404).json({ error: "Tapılmadı." });
    res.json({ ...details, cast: credits?.cast || [], similar: similar?.results || [] });
});

// Serial Sezon/Bölüm Detalları
app.get('/api/details/tv/:id/season/:season_number', async (req, res) => {
    const { id, season_number } = req.params;
    const data = await fetchFromTMDB(`/tv/${id}/season/${season_number}`);
    if (!data) return res.status(404).json({ error: "Sezon tapılmadı." });
    res.json(data);
});

// Watchlist
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
    user.watchlist = user.watchlist.filter(i => !(i.id === Number(req.params.id) && i.movie_type === req.params.type));
    await user.save();
    res.json({ success: true });
});

// Digər Populyar listlər
app.get('/api/movies/popular', async (req, res) => { const data = await fetchFromTMDB('/movie/popular'); res.json(data ? data.results : []); });
app.get('/api/movies/top_rated', async (req, res) => { const data = await fetchFromTMDB('/movie/top_rated'); res.json(data ? data.results : []); });
app.get('/api/tv/popular', async (req, res) => { const data = await fetchFromTMDB('/tv/popular'); res.json(data ? data.results : []); });
app.get('/api/tv/on_the_air', async (req, res) => { const data = await fetchFromTMDB('/tv/on_the_air'); res.json(data ? data.results : []); });

app.listen(PORT, () => console.log(`🚀 Secure Server is running on port ${PORT}`));
