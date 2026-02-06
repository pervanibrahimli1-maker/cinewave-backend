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

// === MONGODB BAĞLANTISI ===
mongoose.connect(process.env.MONGODB_URI).then(() => console.log('MongoDB Hazırdır.'));

// === USER MODEL ===
const User = mongoose.model('User', new mongoose.Schema({
    fullName: String,
    email: { type: String, unique: true },
    username: { type: String, unique: true },
    password: { type: String },
    watchlist: [{ type: Object }] 
}));

// === TƏHLÜKƏSİZLİK (MÖHÜR YOXLA) MIDDLEWARE ===
const verifyToken = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ error: "Giriş qadağandır!" });

    try {
        const verified = jwt.verify(token.split(" ")[1], process.env.JWT_SECRET || 'secret');
        req.user = verified; // Tokenin içindən istifadəçinin ID-sini çıxarırıq
        next();
    } catch (err) {
        res.status(400).json({ error: "Möhür keçərsizdir!" });
    }
};

// === AUTH ROUTES ===

app.post('/api/auth/register', async (req, res) => {
    const { fullName, email, username, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ fullName, email, username, password: hashed, watchlist: [] });
    await user.save();
    res.json({ success: true });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password)) 
        return res.status(400).json({ error: "Məlumatlar səhvdir!" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret');
    res.json({ success: true, token, user: { id: user._id, fullName: user.fullName, username: user.username } });
});

// === WATCHLIST ROUTES (İSTİFADƏÇİNİ YOXLA VƏ İŞLƏ) ===

// verifyToken sayəsində artıq kimin müraciət etdiyini server bilir
app.get('/api/watchlist', verifyToken, async (req, res) => {
    const user = await User.findById(req.user.id); // Token-dən gələn ID ilə axtarırıq
    res.json(user.watchlist);
});

app.post('/api/watchlist/add', verifyToken, async (req, res) => {
    const user = await User.findById(req.user.id);
    const isExist = user.watchlist.find(m => m.id === req.body.id);
    if (isExist) return res.status(400).json({ error: "Siyahıda var" });

    user.watchlist.push(req.body); // Filmi əlavə edirik
    await user.save();
    res.json({ success: true });
});

app.post('/api/watchlist/remove', verifyToken, async (req, res) => {
    const user = await User.findById(req.user.id);
    user.watchlist = user.watchlist.filter(m => m.id !== req.body.id);
    await user.save();
    res.json({ success: true });
});

// === TMDB ROUTES ===
async function fetchTMDB(p, pr = {}) {
    const res = await fetch(`${TMDB_BASE_URL}${p}?api_key=${TMDB_API_KEY}&${new URLSearchParams(pr)}`);
    return await res.json();
}
app.get('/api/movies/popular', async (req, res) => res.json(await fetchTMDB('/movie/popular')));
app.get('/api/movies/now_playing', async (req, res) => res.json(await fetchTMDB('/movie/now_playing')));
app.get('/api/movie/:id', async (req, res) => res.json(await fetchTMDB(`/movie/${req.params.id}`)));
app.get('/api/movie/:id/similar', async (req, res) => res.json(await fetchTMDB(`/movie/${req.params.id}/similar`)));
app.get('/api/search', async (req, res) => res.json(await fetchTMDB('/search/multi', { query: req.query.query })));

app.listen(PORT, () => console.log("Server Aktivdir"));
