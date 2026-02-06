const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// === MONGODB BAĞLANTISI ===
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB-yə qoşuldu.'))
    .catch(err => console.error('Baza xətası:', err));

// === USER MODEL (Watchlist daxil) ===
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    watchlist: [{ type: Object }], // MongoDB-də saxlanılan izləmə siyahısı
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// === AUTH ROUTES ===

app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        const exist = await User.findOne({ $or: [{ email }, { username }] });
        if (exist) return res.status(400).json({ error: 'Email və ya istifadəçi adı artıq var.' });

        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ fullName, email, username, password: hashed, watchlist: [] });
        await user.save();
        res.status(201).json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'İstifadəçi tapılmadı.' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: 'Yanlış şifrə.' });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });
        res.json({ 
            success: true, 
            token, 
            user: { id: user._id, fullName: user.fullName, username: user.username } 
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// === WATCHLIST ROUTES (MongoDB Persistency) ===

app.get('/api/watchlist/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        res.json(user.watchlist || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/watchlist/add', async (req, res) => {
    try {
        const { userId, movie } = req.body;
        const user = await User.findById(userId);
        
        // MONGODB YOXLANILMASI: Film siyahıda varmı?
        const isExist = user.watchlist.find(m => m.id === movie.id);
        if (isExist) return res.status(400).json({ error: "Bu artıq siyahınızdadır." });

        user.watchlist.push(movie);
        await user.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/watchlist/remove', async (req, res) => {
    try {
        const { userId, movieId } = req.body;
        const user = await User.findById(userId);
        user.watchlist = user.watchlist.filter(m => m.id != movieId);
        await user.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// === TMDB API ROUTES ===

async function fetchTMDB(path, params = {}) {
    const q = new URLSearchParams({ api_key: TMDB_API_KEY, language: 'az-AZ', ...params }).toString();
    const res = await fetch(`${TMDB_BASE_URL}${path}?${q}`);
    return await res.json();
}

app.get('/api/movies/popular', async (req, res) => res.json(await fetchTMDB('/movie/popular')));
app.get('/api/movies/now_playing', async (req, res) => res.json(await fetchTMDB('/movie/now_playing')));
app.get('/api/movies/top_rated', async (req, res) => res.json(await fetchTMDB('/movie/top_rated')));
app.get('/api/movie/:id', async (req, res) => res.json(await fetchTMDB(`/movie/${req.params.id}`)));
app.get('/api/movie/:id/credits', async (req, res) => res.json(await fetchTMDB(`/movie/${req.params.id}/credits`)));
app.get('/api/movie/:id/similar', async (req, res) => res.json(await fetchTMDB(`/movie/${req.params.id}/similar`)));
app.get('/api/tv/popular', async (req, res) => res.json(await fetchTMDB('/tv/popular')));
app.get('/api/tv/on_the_air', async (req, res) => res.json(await fetchTMDB('/tv/on_the_air')));
app.get('/api/tv/:id', async (req, res) => res.json(await fetchTMDB(`/tv/${req.params.id}`)));
app.get('/api/tv/:id/similar', async (req, res) => res.json(await fetchTMDB(`/tv/${req.params.id}/similar`)));
app.get('/api/genres/movie', async (req, res) => res.json(await fetchTMDB('/genre/movie/list')));
app.get('/api/genres/tv', async (req, res) => res.json(await fetchTMDB('/genre/tv/list')));
app.get('/api/discover/:type', async (req, res) => res.json(await fetchTMDB(`/discover/${req.params.type}`, req.query)));
app.get('/api/search', async (req, res) => res.json(await fetchTMDB('/search/multi', { query: req.query.query })));

app.listen(PORT, () => console.log(`Server ${PORT} portunda hazırdır.`));
