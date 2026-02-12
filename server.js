// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

dotenv.config(); // .env faylını yükləyir (lokal istifadə üçün)

const app = express();

// --- Başlanğıc Konfiqurasiyaları ---
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET; // Render-də təyin olunmalıdır
const TMDB_API_KEY = process.env.TMDB_API_KEY; // Render-də təyin olunmalıdır
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// CORS siyasəti: Frontend-in origin-i Render-də FRONTEND_URL olaraq təyin edilməlidir
const corsOptions = {
    origin: process.env.FRONTEND_URL, // Məsələn: 'https://watchmovie.ct.ws'
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204 // Preflight sorğuları üçün 204 statusu
};
app.use(cors(corsOptions));
app.use(express.json()); // JSON formatında gələn body-ləri parse etmək üçün

// --- MongoDB Bağlantısı ---
mongoose.connect(process.env.MONGODB_URI) // Render-də təyin olunmalıdır
    .then(() => console.log('✅ MongoDB Hazırdır.'))
    .catch(err => {
        console.error('❌ MongoDB bağlantı xətası:', err.message);
        process.exit(1); // Bağlantı xətası olarsa serveri dayandırın
    });

// --- MongoDB İstifadəçi Modeli ---
const User = mongoose.model('User', new mongoose.Schema({
    fullName: String,
    email: { type: String, unique: true, required: true },
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    watchlist: [{ id: Number, title: String, poster_path: String, movie_type: String }]
}, { timestamps: true }));

// --- Köməkçi Funksiya: TMDB API zəngi ---
async function fetchTMDB(path, params = {}) {
    if (!TMDB_API_KEY) {
        console.error('TMDB_API_KEY ətraf mühit dəyişəni təyin edilməyib.');
        return null;
    }

    const queryParams = new URLSearchParams({ api_key: TMDB_API_KEY, ...params, language: 'az-AZ' });
    try {
        const response = await fetch(`${TMDB_BASE_URL}${path}?${queryParams}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`TMDB API xətası (${path}): Status ${response.status} - ${response.statusText}. Cavab: ${errorText}`);
            return null;
        }
        return await response.json();
    } catch (e) {
        console.error(`TMDB fetch zamanı xəta (${path}):`, e.message);
        return null;
    }
}

// --- Autentifikasiya Middleware-i ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.status(401).json({ error: "Giriş tələb olunur." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error("JWT doğrulama xətası:", err.message);
            return res.status(403).json({ error: "Yanlış və ya vaxtı keçmiş token." });
        }
        req.user = user; // İstifadəçi məlumatlarını req obyektinə əlavə edir
        next();
    });
};

// =============================================================
// --- API Routelar ---
// =============================================================

// --- AUTHENTIFICATION ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        if (!fullName || !email || !username || !password) {
            return res.status(400).json({ success: false, error: "Bütün sahələri doldurun." });
        }
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ fullName, email, username, password: hashed });
        await user.save();
        res.status(201).json({ success: true, message: "Uğurla qeydiyyatdan keçdiniz!" });
    } catch (err) {
        if (err.code === 11000) { // Duplicate key error
            return res.status(400).json({ success: false, error: "Email və ya istifadəçi adı artıq mövcuddur!" });
        }
        console.error("Qeydiyyat xətası:", err.message);
        res.status(500).json({ success: false, error: "Daxili server xətası." });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: "Email və şifrə boş ola bilməz." });
        }

        const user = await User.findOne({ email });
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(400).json({ success: false, error: "Email və ya şifrə yanlışdır!" });
        }

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1d' });
        res.json({
            success: true,
            token,
            user: { fullName: user.fullName, username: user.username, email: user.email }
        });
    } catch (err) {
        console.error("Giriş xətası:", err.message);
        res.status(500).json({ success: false, error: "Daxili server xətası." });
    }
});

// --- CONTENT (TMDB-dən Məlumat Çəkmə) ---
app.get('/api/home', async (req, res) => {
    const popularMovies = await fetchTMDB('/movie/popular');
    const popularTV = await fetchTMDB('/tv/popular');

    if (!popularMovies || !popularTV) {
        return res.status(500).json({ error: "TMDB-dən ana səhifə məlumatı alınarkən xəta baş verdi." });
    }

    const featured = popularMovies.results ? popularMovies.results[0] : null;
    res.json({
        featured: featured ? { ...featured, meta: `IMDb ${featured.vote_average?.toFixed(1) || '0.0'} | ${(featured.release_date || '').split('-')[0]}` } : null,
        popularMovies: popularMovies.results || [],
        popularTV: popularTV.results || []
    });
});

app.get('/api/genres/:type/list', async (req, res) => {
    const data = await fetchTMDB(`/genre/${req.params.type}/list`);
    if (!data) {
        return res.status(500).json({ error: "TMDB-dən kateqoriya məlumatı alınarkən xəta baş verdi." });
    }
    res.json(data.genres || []);
});

app.get('/api/search', async (req, res) => {
    const query = req.query.query;
    if (!query) {
        return res.status(400).json({ error: "Axtarış sorğusu tələb olunur." });
    }
    const data = await fetchTMDB('/search/multi', { query: query });
    if (!data) {
        return res.status(500).json({ error: "TMDB-dən axtarış nəticələri alınarkən xəta baş verdi." });
    }
    res.json(data.results || []);
});

// Janr id-yə görə kəşf (Discover by genre ID)
app.get('/api/discover/:type', async (req, res) => {
    const { type } = req.params;
    const { with_genres } = req.query;

    if (!type || !with_genres) {
        return res.status(400).json({ error: "Tip və janr ID tələb olunur." });
    }

    const data = await fetchTMDB(`/${type}/popular`, { with_genres: with_genres }); // TMDB discover API çağırılır
    if (!data) {
        return res.status(500).json({ error: `TMDB-dən janr (${with_genres}) üzrə məlumat alınarkən xəta baş verdi.` });
    }
    res.json(data.results || []);
});


app.get('/api/details/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    if (!type || !id) {
        return res.status(400).json({ error: "Tip və ID tələb olunur." });
    }
    try {
        const [details, credits, similar] = await Promise.all([
            fetchTMDB(`/${type}/${id}`),
            fetchTMDB(`/${type}/${id}/credits`),
            fetchTMDB(`/${type}/${id}/similar`)
        ]);

        if (!details) {
            return res.status(404).json({ error: "Detallar tapılmadı və ya xəta baş verdi." });
        }

        res.json({ ...details, cast: credits?.cast || [], similar: similar?.results || [] });
    } catch (e) {
        console.error("Detallar alınarkən xəta:", e.message);
        res.status(500).json({ error: "Daxili server xətası." });
    }
});

// Additional content routes for movies.html and series.html
app.get('/api/movies/popular', async (req, res) => {
    const data = await fetchTMDB('/movie/popular');
    if (!data) return res.status(500).json({ error: "Populyar filmlər yüklənə bilmədi." });
    res.json(data.results || []);
});

app.get('/api/movies/top_rated', async (req, res) => {
    const data = await fetchTMDB('/movie/top_rated');
    if (!data) return res.status(500).json({ error: "Ən reytinqli filmlər yüklənə bilmədi." });
    res.json(data.results || []);
});

app.get('/api/tv/popular', async (req, res) => {
    const data = await fetchTMDB('/tv/popular');
    if (!data) return res.status(500).json({ error: "Populyar seriallar yüklənə bilmədi." });
    res.json(data.results || []);
});

app.get('/api/tv/on_the_air', async (req, res) => {
    const data = await fetchTMDB('/tv/on_the_air'); // Yaxud /tv/airing_today
    if (!data) return res.status(500).json({ error: "İndi yayımlanan seriallar yüklənə bilmədi." });
    res.json(data.results || []);
});


// --- WATCHLIST ---
app.post('/api/watchlist/add', authenticateToken, async (req, res) => {
    try {
        const { id, title, poster_path, movie_type } = req.body;
        if (!id || !title || !movie_type) {
            return res.status(400).json({ error: "Bütün məlumatlar tələb olunur (id, title, movie_type)." });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: "İstifadəçi tapılmadı." });
        }

        if (user.watchlist.some(m => m.id === id && m.movie_type === movie_type)) {
            return res.status(400).json({ error: "Film/serial artıq izləmə siyahınızdadır." });
        }

        user.watchlist.push({ id, title, poster_path, movie_type });
        await user.save();
        res.json({ success: true, message: "İzləmə siyahısına əlavə edildi." });
    } catch (e) {
        console.error("İzləmə siyahısına əlavə edilərkən xəta:", e.message);
        res.status(500).json({ error: "Daxili server xətası." });
    }
});

app.get('/api/watchlist', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: "İstifadəçi tapılmadı." });
        }
        res.json(user.watchlist || []);
    } catch (e) {
        console.error("İzləmə siyahısı alınarkən xəta:", e.message);
        res.status(500).json({ error: "Daxili server xətası." });
    }
});

app.delete('/api/watchlist/remove/:id/:type', authenticateToken, async (req, res) => {
    try {
        const { id, type } = req.params;
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: "İstifadəçi tapılmadı." });
        }

        user.watchlist = user.watchlist.filter(item => !(item.id == id && item.movie_type == type));
        await user.save();
        res.json({ success: true, message: "İzləmə siyahısından silindi." });
    } catch (e) {
        console.error("İzləmə siyahısından silinərkən xəta:", e.message);
        res.status(500).json({ error: "Daxili server xətası." });
    }
});

// --- Serveri Başlat ---
app.listen(PORT, () => console.log(`🚀 Server ${PORT} portunda işləyir.`));
