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
const JWT_SECRET = process.env.JWT_SECRET || 'cinewave_secret_key_2026';

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Hazırdır.'))
    .catch(err => console.error('❌ MongoDB Xətası:', err));

// MODEL
const User = mongoose.model('User', new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    watchlist: [{ 
        id: { type: Number },
        title: { type: String },
        poster_path: { type: String },
        addedAt: { type: Date, default: Date.now }
    }] 
}));

// MIDDLEWARE - TOKEN YOXLAMAQ ÜÇÜN
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Giriş tələb olunur" });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token keçərsizdir" });
        req.userId = user.id;
        next();
    });
};

async function fetchTMDB(path, params = {}) {
    const queryParams = new URLSearchParams({ api_key: TMDB_API_KEY, ...params });
    try {
        const response = await fetch(`${TMDB_BASE_URL}${path}?${queryParams}`);
        return await response.json();
    } catch (e) { return {}; }
}

// --- AUTH ROUTES ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        // Email yoxlanışı artıq MongoDB unique sayəsində error atacaq
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ fullName, email, username, password: hashed });
        await user.save();
        res.status(201).json({ success: true });
    } catch (err) { 
        res.status(400).json({ success: false, error: "Bu email və ya istifadəçi adı artıq istifadə olunub!" }); 
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !await bcrypt.compare(password, user.password)) 
            return res.status(400).json({ success: false, error: "Məlumatlar yanlışdır" });
        
        const token = jwt.sign({ id: user._id }, JWT_SECRET);
        res.json({ success: true, token, user: { username: user.username, fullName: user.fullName } });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- WATCHLIST ROUTES (YENİ) ---

// 1. Siyahıya əlavə et (Təkrar yoxlanışı ilə)
app.post('/api/watchlist/add', authenticateToken, async (req, res) => {
    try {
        const { id, title, poster_path } = req.body;
        const user = await User.findById(req.userId);

        // TƏKRAR YOXLANIŞI
        const exists = user.watchlist.find(item => item.id === id);
        if (exists) {
            return res.status(400).json({ success: false, error: "Bu artıq siyahınızda var!" });
        }

        user.watchlist.push({ id, title, poster_path });
        await user.save();
        res.json({ success: true, message: "Siyahıya əlavə edildi" });
    } catch (err) {
        res.status(500).json({ error: "Xəta baş verdi" });
    }
});

// 2. Siyahını gətir
app.get('/api/watchlist', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        res.json(user.watchlist);
    } catch (err) { res.status(500).json({ error: "Xəta" }); }
});

// 3. Siyahıdan sil
app.delete('/api/watchlist/remove/:id', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        user.watchlist = user.watchlist.filter(item => item.id != req.params.id);
        await user.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Xəta" }); }
});

// --- TMDB CONTENT ROUTES ---
app.get('/api/movies/popular', async (req, res) => {
    const data = await fetchTMDB('/movie/popular', { language: 'az-AZ' });
    res.json(data.results || []);
});
app.get('/api/movies/top_rated', async (req, res) => {
    const data = await fetchTMDB('/movie/top_rated', { language: 'az-AZ' });
    res.json(data.results || []);
});
app.get('/api/tv/popular', async (req, res) => {
    const data = await fetchTMDB('/tv/popular', { language: 'az-AZ' });
    res.json(data.results || []);
});
app.get('/api/tv/on_the_air', async (req, res) => {
    const data = await fetchTMDB('/tv/on_the_air', { language: 'az-AZ' });
    res.json(data.results || []);
});
app.get('/api/genres/:type/list', async (req, res) => {
    const data = await fetchTMDB(`/genre/${req.params.type}/list`, { language: 'az-AZ' });
    res.json(data.genres || []);
});
app.get('/api/search', async (req, res) => {
    const data = await fetchTMDB('/search/multi', { query: req.query.query, language: 'az-AZ' });
    res.json(data.results || []);
});

app.get('/api/details/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    try {
        let [details, credits, similar] = await Promise.all([
            fetchTMDB(`/${type}/${id}`, { language: 'az-AZ' }),
            fetchTMDB(`/${type}/${id}/credits`, { language: 'az-AZ' }),
            fetchTMDB(`/${type}/${id}/similar`, { language: 'az-AZ' })
        ]);

        if (!details.overview || details.overview.length < 5) {
            const en = await fetchTMDB(`/${type}/${id}`, { language: 'en-US' });
            try {
                const tr = await translate(en.overview, { to: 'az' });
                details.overview = tr.text;
            } catch(e) { details.overview = en.overview; }
        }

        res.json({
            ...details,
            cast: credits.cast ? credits.cast.slice(0, 15) : [],
            similar: similar.results || []
        });
    } catch (err) { res.status(404).json({ error: "Tapılmadı" }); }
});

app.listen(PORT, () => console.log(`🚀 Server ${PORT} portunda aktivdir.`));
