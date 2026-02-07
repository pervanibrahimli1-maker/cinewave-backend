/* ============================================= */
/* CINEWAVE - TAM SERVER KODU (QƏTİ VERSİYA)      */
/* ============================================= */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Ayarlar
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// 1. MONGODB BAĞLANTISI
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB-yə uğurla bağlanıldı.'))
    .catch(err => console.error('❌ MongoDB Bağlantı Xətası:', err));

// 2. İSTİFADƏÇİ MODELİ
const User = mongoose.model('User', new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    watchlist: [{ type: Object }] 
}));

// 3. TMDB ÜÇÜN KÖMƏKÇİ FUNKSİYA
async function fetchTMDB(path, params = {}) {
    const url = `${TMDB_BASE_URL}${path}?api_key=${TMDB_API_KEY}&language=az-AZ&${new URLSearchParams(params)}`;
    try {
        const response = await fetch(url);
        return await response.json();
    } catch (e) {
        console.error("TMDB Fetch Error:", e);
        return {};
    }
}

// =============================================
// 4. AUTH ROUTES (QEYDİYYAT VƏ GİRİŞ)
// =============================================

app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ success: false, error: "Email və ya istifadəçi adı artıq mövcuddur!" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ fullName, email, username, password: hashedPassword });
        await user.save();
        
        res.status(201).json({ success: true, message: "Qeydiyyat uğurludur" });
    } catch (err) {
        res.status(500).json({ success: false, error: "Serverdə xəta baş verdi" });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(400).json({ success: false, error: "Email və ya şifrə yanlışdır!" });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '7d' });
        res.json({ 
            success: true, 
            token, 
            user: { id: user._id, fullName: user.fullName, username: user.username } 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: "Giriş zamanı xəta baş verdi" });
    }
});

// =============================================
// 5. MƏZMUN ROUTES (FİLM VƏ SERİALLAR)
// =============================================

// ÖNƏMLİ: Parametrli yollar (:type/:id) ən aşağıda olmalıdır!

// Populyar filmlər
app.get('/api/movies/popular', async (req, res) => {
    const data = await fetchTMDB('/movie/popular');
    res.json(data.results || []);
});

// Yeni çıxan filmlər
app.get('/api/movies/now_playing', async (req, res) => {
    const data = await fetchTMDB('/movie/now_playing');
    res.json(data.results || []);
});

// Ən reytinqli filmlər
app.get('/api/movies/top_rated', async (req, res) => {
    const data = await fetchTMDB('/movie/top_rated');
    res.json(data.results || []);
});

// Populyar seriallar
app.get('/api/tv/popular', async (req, res) => {
    const data = await fetchTMDB('/tv/popular');
    res.json(data.results || []);
});

// İndi yayımlanan seriallar
app.get('/api/tv/on_the_air', async (req, res) => {
    const data = await fetchTMDB('/tv/on_the_air');
    res.json(data.results || []);
});

// Film janrları siyahısı
app.get('/api/genres/movie/list', async (req, res) => {
    const data = await fetchTMDB('/genre/movie/list');
    res.json(data.genres || []);
});

// Serial janrları siyahısı
app.get('/api/genres/tv/list', async (req, res) => {
    const data = await fetchTMDB('/genre/tv/list');
    res.json(data.genres || []);
});

// Janr üzrə kəşf et (Discover)
app.get('/api/discover/genre', async (req, res) => {
    const { genreId, type } = req.query;
    const data = await fetchTMDB(`/discover/${type || 'movie'}`, { with_genres: genreId });
    res.json(data.results || []);
});

// Axtarış (Multi Search)
app.get('/api/search', async (req, res) => {
    const data = await fetchTMDB('/search/multi', { query: req.query.query });
    res.json(data.results || []);
});

// =============================================
// 6. DETALLAR (ÖZƏL MARŞRUT - ƏN SONDA OLMALIDIR)
// =============================================

// Bu marşrut /api/details ilə başlayır ki, digər /api/... yolları ilə toqquşmasın
app.get('/api/details/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    
    try {
        // Paralel olaraq bütün məlumatları çəkirik (Daha sürətli)
        const [details, credits, similar, videos] = await Promise.all([
            fetchTMDB(`/${type}/${id}`),
            fetchTMDB(`/${type}/${id}/credits`),
            fetchTMDB(`/${type}/${id}/similar`),
            fetchTMDB(`/${type}/${id}/videos`)
        ]);

        if (!details.id) {
            return res.status(404).json({ success: false, error: "Məzmun tapılmadı" });
        }

        // Məlumatları birləşdirib tək obyekt olaraq göndəririk
        res.json({
            ...details,
            cast: credits.cast ? credits.cast.slice(0, 12) : [], // İlk 12 aktyor
            similar: similar.results ? similar.results.slice(0, 8) : [], // İlk 8 bənzər film
            video: videos.results ? (videos.results.find(v => v.type === 'Trailer') || videos.results[0]) : null
        });

    } catch (err) {
        console.error("Detail Route Error:", err);
        res.status(500).json({ success: false, error: "Məlumatlar gətirilərkən xəta baş verdi" });
    }
});

// Serveri başlat
app.listen(PORT, () => {
    console.log(`🚀 CineWave Serveri ${PORT} portunda aktivdir.`);
});
