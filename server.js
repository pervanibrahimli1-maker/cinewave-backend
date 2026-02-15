// server.js - CineWave Ultimate Secure Backend (Validation Fixed)
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

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// 1. Təhlükəsizlik Başlıqları
app.use(helmet({ 
    contentSecurityPolicy: false, 
    crossOriginEmbedderPolicy: false 
}));

// 2. NoSQL Injection Qoruması
app.use(mongoSanitize());

// 3. XSS Qoruması
app.use(xssClean());

// 4. Parameter Pollution Qoruması
app.use(hpp());

// 5. Body Limit (DoS Qoruması)
app.use(express.json({ limit: '15kb' }));

// 6. Rate Limiting
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { error: "Çox sayda sorğu gönderildi. Bir az gözləyin." }
});
app.use('/api/', generalLimiter);

// 7. CORS
app.use(cors({
    origin: true,
    methods: 'GET,POST,DELETE',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// MongoDB Bağlantısı
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ CineWave DB Connected & Secured.'))
    .catch(error => console.error('❌ DB Error:', error));

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
    const queryParameters = new URLSearchParams({ api_key: TMDB_API_KEY, ...params, language: 'en-US' });
    try {
        const response = await fetch(`${TMDB_BASE_URL}${path}?${queryParameters}`);
        return response.ok ? await response.json() : null;
    } catch (e) { return null; }
}

// ================= API ROUTELAR =================

// Auth: Qeydiyyat (TƏKRARLANMA QORUMASI ƏLAVƏ EDİLDİ)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        
        if (!fullName || !email || !username || !password || password.length < 6) {
            return res.status(400).json({ error: "Məlumatları düzgün daxil edin (Şifrə min. 6 simvol)." });
        }

        // Email yoxlanışı
        const existingEmail = await User.findOne({ email: email.toLowerCase() });
        if (existingEmail) {
            return res.status(400).json({ error: "Bu e-poçt ünvanı artıq qeydiyyatdan keçib." });
        }

        // Username yoxlanışı
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: "Bu istifadəçi adı artıq götürülüb." });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = new User({ fullName, email, username, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ success: true, message: "Uğurla qeydiyyatdan keçdiniz!" });
    } catch (error) {
        res.status(500).json({ error: "Qeydiyyat zamanı xəta baş verdi." });
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
        res.json({ 
            success: true, 
            token, 
            user: { fullName: user.fullName, username: user.username, email: user.email } 
        });
    } catch (error) {
        res.status(500).json({ error: "Daxili server xətası." });
    }
});

// Watchlist: Əlavə etmə (TƏKRARLANMA QORUMASI ƏLAVƏ EDİLDİ)
app.post('/api/watchlist/add', authenticateToken, async (req, res) => {
    try {
        const { id, title, poster_path, movie_type } = req.body;
        const user = await User.findById(req.user.id);
        
        // Siyahıda olub-olmadığını yoxlayırıq
        const alreadyInWatchlist = user.watchlist.find(item => item.id === Number(id) && item.movie_type === movie_type);
        
        if (alreadyInWatchlist) {
            return res.status(400).json({ error: "Bu məzmun artıq siyahınızdadır." });
        }

        user.watchlist.push({ id: Number(id), title, poster_path, movie_type });
        await user.save();
        res.json({ success: true, message: "Siyahıya əlavə edildi." });
    } catch (error) {
        res.status(500).json({ error: "Siyahıya əlavə edilərkən xəta baş verdi." });
    }
});

// Discover
app.get('/api/discover/:type', async (req, res) => {
    const { type } = req.params;
    const data = await fetchFromTMDB(`/discover/${type}`, { 
        with_genres: req.query.with_genres, 
        sort_by: 'popularity.desc',
        page: req.query.page || 1 
    });
    res.json(data || { results: [], total_pages: 1 });
});

// Home Page
app.get('/api/home', async (req, res) => {
    const [movies, series] = await Promise.all([fetchFromTMDB('/movie/popular'), fetchFromTMDB('/tv/popular')]);
    const featured = movies?.results[0];
    res.json({
        featured: featured ? { ...featured, meta: featured.vote_average?.toFixed(1), year: (featured.release_date || '').split('-')[0] } : null,
        popularMovies: movies?.results || [],
        popularTV: series?.results || []
    });
});

// Axtarış
app.get('/api/search', async (req, res) => {
    const data = await fetchFromTMDB('/search/multi', { query: req.query.query, page: req.query.page || 1 });
    res.json(data || { results: [], total_pages: 1 });
});

// Details
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

// Sezon Detalları
app.get('/api/details/tv/:id/season/:num', async (req, res) => {
    const data = await fetchFromTMDB(`/tv/${req.params.id}/season/${req.params.num}`);
    res.json(data || { episodes: [] });
});

// Watchlist: Silmə
app.delete('/api/watchlist/remove/:id/:type', authenticateToken, async (req, res) => {
    const user = await User.findById(req.user.id);
    user.watchlist = user.watchlist.filter(i => !(i.id === Number(req.params.id) && i.movie_type === req.params.type));
    await user.save();
    res.json({ success: true });
});

// Janrlar
app.get('/api/genres/:type/list', async (req, res) => {
    const data = await fetchFromTMDB(`/genre/${req.params.type}/list`);
    res.json(data ? data.genres : []);
});

// Digər Populyar listlər
app.get('/api/movies/popular', async (req, res) => { const d = await fetchFromTMDB('/movie/popular', { page: req.query.page || 1 }); res.json(d || { results: [], total_pages: 1 }); });
app.get('/api/movies/top_rated', async (req, res) => { const d = await fetchFromTMDB('/movie/top_rated', { page: req.query.page || 1 }); res.json(d || { results: [], total_pages: 1 }); });
app.get('/api/tv/popular', async (req, res) => { const d = await fetchFromTMDB('/tv/popular', { page: req.query.page || 1 }); res.json(d || { results: [], total_pages: 1 }); });
app.get('/api/tv/on_the_air', async (req, res) => { const d = await fetchFromTMDB('/tv/on_the_air', { page: req.query.page || 1 }); res.json(d || { results: [], total_pages: 1 }); });

app.listen(PORT, () => console.log(`🚀 CineWave Secure Backend on port ${PORT}`));
