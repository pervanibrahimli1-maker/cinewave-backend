// server.js - CineWave Ultimate Full Fixed
const express = require('express');
const translate = require('google-translate-api-x');
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
const crypto = require('crypto');

dotenv.config();
const app = express();

// Render üçün proksi etibarı
app.set('trust proxy', 1); 

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'gizli_açar_123';
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// 1. TƏHLÜKƏSİZLİK
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(mongoSanitize());
app.use(xssClean());
app.use(hpp());
app.use(express.json({ limit: '15kb' }));
app.use(cors({ origin: true, credentials: true }));

const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, message: { error: "Limit keçildi." } });
app.use('/api/', generalLimiter);

// 2. DATABASE MODELLƏRİ
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected.'))
    .catch(error => console.error('❌ DB Error:', error));

const User = mongoose.model('User', new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    email: { type: String, unique: true, required: true, lowercase: true },
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    watchlist: [{ id: Number, title: String, poster_path: String, movie_type: String }]
}, { timestamps: true }));

const View = mongoose.model('View', new mongoose.Schema({
    movieId: { type: String, required: true, unique: true },
    viewers: [String]
}));

// 3. YARDIMÇI FUNKSİYA
async function fetchTMDB(path, params = {}) {
    const query = new URLSearchParams({ api_key: TMDB_API_KEY, ...params, language: 'en-US' });
    try {
        const response = await fetch(`${TMDB_BASE_URL}${path}?${query}`);
        return response.ok ? await response.json() : null;
    } catch (e) { return null; }
}

const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Giriş tələb olunur." });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token etibarsızdır." });
        req.user = user;
        next();
    });
};

// --- AUTH ROUTELARI ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        const exists = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
        if (exists) return res.status(400).json({ error: "Email və ya istifadəçi adı artıq götürülüb." });
        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = new User({ fullName, email: email.toLowerCase(), username, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ success: true });
    } catch (e) { res.status(500).json({ error: "Server xətası." }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Məlumatlar yanlışdır." });
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '12h' });
        res.json({ success: true, token, user: { fullName: user.fullName, username: user.username, email: user.email } });
    } catch (e) { res.status(500).json({ error: "Giriş zamanı xəta." }); }
});

// --- CONTENT ROUTELARI ---
// --- CONTENT ROUTELARI ---
// server.js - /api/home hissəsini bununla əvəz et
// server.js daxilində /api/home hissəsini bu şəkildə yenilə
app.get('/api/home', async (req, res) => {
    try {
        const [movies, tv] = await Promise.all([
            fetchTMDB('/movie/popular'), 
            fetchTMDB('/tv/popular')
        ]);

        let featured = movies?.results[0] || null;

        if (featured) {
            // Baxış sayını bazadan tapırıq
            const views = await View.findOne({ movieId: featured.id.toString() });
            featured.viewCount = views ? views.viewers.length : 0;

            if (featured.overview) {
                try {
                    const tr = await translate(featured.overview, { to: 'az' });
                    featured.overview = tr.text;
                } catch (te) { console.log("Translation failed"); }
            }
        }

        res.json({
            featured: featured,
            popularMovies: movies?.results || [],
            popularTV: tv?.results || []
        });
    } catch (e) { res.status(500).json({ error: "Home xətası" }); }
});

// server.js daxilində tap və bu hissəni dəyiş:
app.get('/api/details/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    try {
        const [mainData, credits, recommendations, views] = await Promise.all([
            fetchTMDB(`/${type}/${id}`),
            fetchTMDB(`/${type}/${id}/credits`),
            fetchTMDB(`/${type}/${id}/recommendations`), // <--- BURANI DƏYİŞDİK (similar idi)
            View.findOne({ movieId: id })
        ]);

        if (!mainData) return res.status(404).json({ error: "Tapılmadı" });

        if (mainData.overview) {
            try {
                const tr = await translate(mainData.overview, { to: 'az' });
                mainData.overview = tr.text;
            } catch (te) { console.log("Translation failed"); }
        }

        res.json({ 
            ...mainData, 
            cast: credits?.cast?.slice(0, 15) || [], 
            similar: recommendations?.results?.slice(0, 12) || [], // Frontend-də adı 'similar' qalsın deyə dəyişmirik
            viewCount: views ? views.viewers.length : 0, 
            success: true 
        });
    } catch (e) { res.status(500).json({ error: "Details xətası" }); }
});

app.get('/api/details/tv/:id/season/:num', async (req, res) => {
    const d = await fetchTMDB(`/tv/${req.params.id}/season/${req.params.num}`);
    res.json(d || { episodes: [] });
});


app.get('/api/discover/:type', async (req, res) => {
    const { type } = req.params;
    const { with_genres, year, page } = req.query;
    
    let params = { 
        with_genres: with_genres || '', 
        page: page || 1, 
        sort_by: 'popularity.desc' 
    };

    if (year) {
        if (type === 'movie') params.primary_release_year = year;
        else params.first_air_date_year = year;
    }

    const data = await fetchTMDB(`/discover/${type}`, params);
    res.json(data || { results: [], total_pages: 1 });
});


app.post('/api/views/increment/:id', async (req, res) => {
    try {
        const movieId = req.params.id;
        const viewerId = crypto.createHash('md5').update(req.ip).digest('hex');
        let movieView = await View.findOne({ movieId });
        if (!movieView) { movieView = new View({ movieId, viewers: [viewerId] }); await movieView.save(); }
        else if (!movieView.viewers.includes(viewerId)) { movieView.viewers.push(viewerId); await movieView.save(); }
        res.json({ success: true, count: movieView.viewers.length });
    } catch (e) { res.status(500).json({ error: "Sayğac xətası" }); }
});

app.get('/api/watchlist', authMiddleware, async (req, res) => {
    const user = await User.findById(req.user.id);
    res.json(user ? user.watchlist : []);
});

app.post('/api/watchlist/add', authMiddleware, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (user.watchlist.some(m => Number(m.id) === Number(req.body.id))) return res.status(400).json({ error: "Artıq siyahıdadır." });
    user.watchlist.push(req.body); await user.save(); res.json({ success: true });
});

// BÜTÜN SİYAHINI TƏMİZLƏMƏK (DELETE /api/watchlist/clear)
app.delete('/api/watchlist/clear', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        user.watchlist = [];
        await user.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Server xətası" });
    }
});

// TƏK FİLMİ SİLMƏK (DELETE /api/watchlist/remove/:id/:type)
app.delete('/api/watchlist/remove/:id/:type', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const { id, type } = req.params;
        user.watchlist = user.watchlist.filter(i => !(i.id == id && i.movie_type == type));
        await user.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Server xətası" });
    }
});

// Digər API-lar...
app.get('/api/search', async (req, res) => { res.json(await fetchTMDB('/search/multi', { query: req.query.query, page: req.query.page || 1 })); });
app.get('/api/movies/popular', async (req, res) => { res.json(await fetchTMDB('/movie/popular', { page: req.query.page || 1 })); });
app.get('/api/tv/popular', async (req, res) => { res.json(await fetchTMDB('/tv/popular', { page: req.query.page || 1 })); });
app.get('/api/genres/:type/list', async (req, res) => { const d = await fetchTMDB(`/genre/${req.params.type}/list`); res.json(d?.genres || []); });

app.listen(PORT, () => console.log(`🚀 Server Running on ${PORT}`));
