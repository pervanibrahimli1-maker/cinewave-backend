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

// === AUTH ROUTES ===

app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;

        // Eyni email və ya username yoxlanışı
        const existing = await User.findOne({ $or: [{ email }, { username }] });
        if (existing) {
            return res.status(400).json({ success: false, error: "Bu email və ya istifadəçi adı artıq istifadə olunur!" });
        }

        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ fullName, email, username, password: hashed, watchlist: [] });
        await user.save();
        
        res.status(201).json({ success: true, message: "Qeydiyyat uğurludur" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: "Serverdə xəta baş verdi" });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !await bcrypt.compare(password, user.password)) 
            return res.status(400).json({ success: false, error: "Email və ya şifrə səhvdir!" });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret');
        res.json({ 
            success: true, 
            token, 
            user: { id: user._id, fullName: user.fullName, username: user.username } 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: "Giriş zamanı xəta" });
    }
});

// === WATCHLIST ROUTES ===
app.get('/api/watchlist', verifyToken, async (req, res) => {
    const user = await User.findById(req.user.id);
    res.json(user.watchlist || []);
});

app.post('/api/watchlist/add', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.watchlist.some(m => m.id === req.body.id)) {
            return res.status(400).json({ error: "Siyahıda artıq var" });
        }
        user.watchlist.push(req.body);
        await user.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Əlavə edilmədi" });
    }
});

app.post('/api/watchlist/remove', verifyToken, async (req, res) => {
    const user = await User.findById(req.user.id);
    user.watchlist = user.watchlist.filter(m => m.id !== req.body.id);
    await user.save();
    res.json({ success: true });
});

// === TMDB PROXY ===
async function fetchTMDB(path, params = {}) {
    const url = `${TMDB_BASE_URL}${path}?api_key=${TMDB_API_KEY}&${new URLSearchParams(params)}`;
    const response = await fetch(url);
    return await response.json();
}

app.get('/api/movies/popular', async (req, res) => res.json(await fetchTMDB('/movie/popular')));
app.get('/api/movies/now_playing', async (req, res) => res.json(await fetchTMDB('/movie/now_playing')));
app.get('/api/movie/:id', async (req, res) => res.json(await fetchTMDB(`/movie/${req.params.id}`)));
app.get('/api/movie/:id/similar', async (req, res) => res.json(await fetchTMDB(`/movie/${req.params.id}/similar`)));
app.get('/api/tv/popular', async (req, res) => res.json(await fetchTMDB('/tv/popular')));
app.get('/api/tv/on_the_air', async (req, res) => res.json(await fetchTMDB('/tv/on_the_air')));
app.get('/api/tv/:id', async (req, res) => res.json(await fetchTMDB(`/tv/${req.params.id}`)));
app.get('/api/search', async (req, res) => res.json(await fetchTMDB('/search/multi', { query: req.query.query })));

app.listen(PORT, () => console.log(`Server ${PORT} portunda aktivdir`));
