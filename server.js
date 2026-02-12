const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// .env faylını yükləyir (lokal istifadə üçün)
dotenv.config();

const app = express();

// CORS siyasəti: Frontend-in origin-i buraya əlavə edilməlidir
// InfinityFree domeninizin URL-ini aşağıdakı "origin" dəyəri ilə əvəz edin
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'htts://watchmovie.ct.ws', // Məsələn: 'https://sizin-infinityfree-domaininiz.com'
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
};
app.use(cors(corsOptions));

app.use(express.json());

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'cinewave_secret_2026'; // Render-də təyin olunmalıdır
const TMDB_API_KEY = process.env.TMDB_API_KEY; // Render-də təyin olunmalıdır
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// MongoDB bağlantısı
mongoose.connect(process.env.MONGODB_URI) // Render-də təyin olunmalıdır
    .then(() => console.log('✅ MongoDB Hazırdır.'))
    .catch(err => {
        console.error('❌ MongoDB bağlantı xətası:', err.message);
        process.exit(1); // Bağlantı xətası olarsa serveri dayandırın
    });

// İstifadəçi Modeli
const User = mongoose.model('User', new mongoose.Schema({
    fullName: String,
    email: { type: String, unique: true, required: true },
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    watchlist: [{ id: Number, title: String, poster_path: String, movie_type: String }]
}, { timestamps: true })); // Yaratma və yeniləmə vaxtlarını əlavə edir

// TMDB API zəng funksiyası (daha ətraflı xəta idarəçiliyi ilə)
async function fetchTMDB(path, params = {}) {
    // TMDB_API_KEY-in Render-də düzgün yüklənib-yüklənmədiyini yoxlamaq üçün:
    if (!TMDB_API_KEY) {
        console.error('TMDB_API_KEY ətraf mühit dəyişəni təyin edilməyib.');
        return null; // Açar yoxdursa null qaytar
    }

    const queryParams = new URLSearchParams({ api_key: TMDB_API_KEY, ...params, language: 'az-AZ' });
    try {
        const response = await fetch(`${TMDB_BASE_URL}${path}?${queryParams}`);
        
        if (!response.ok) { // HTTP status kodunun uğurlu olub-olmadığını yoxlayın (200-299 arası)
            const errorText = await response.text();
            console.error(`TMDB API xətası (${path}): Status ${response.status} - ${response.statusText}. Cavab: ${errorText}`);
            return null; // Uğursuz cavabda null qaytar
        }
        return await response.json();
    } catch (e) {
        console.error(`TMDB fetch zamanı xəta (${path}):`, e.message);
        return null; // Şəbəkə və ya digər fetch xətalarında null qaytar
    }
}

// Autentifikasiya Middleware-i (bütün token yoxlamaları üçün)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.status(401).json({ error: "Giriş tələb olunur." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error("JWT doğrulama xətası:", err.message);
            return res.status(403).json({ error: "Yanlış və ya vaxtı keçmiş token." });
        }
        req.user = user;
        next();
    });
};

// ======================= ROUTELAR =======================

// AUTH
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        // Bütün sahələrin dolu olduğunu yoxlayın
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
        if (!user) {
            return res.status(400).json({ success: false, error: "Email və ya şifrə yanlışdır!" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: "Email və ya şifrə yanlışdır!" });
        }

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1d' }); // Token-in vaxtını təyin edin
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

// CONTENT
app.get('/api/home', async (req, res) => {
    const popular = await fetchTMDB('/movie/popular');
    const trending = await fetchTMDB('/tv/popular');

    if (!popular || !trending) {
        return res.status(500).json({ error: "TMDB-dən məlumat alınarkən xəta baş verdi." });
    }

    const featured = popular.results ? popular.results[0] : null;
    res.json({
        featured: featured ? { ...featured, meta: `IMDb ${featured.vote_average?.toFixed(1) || '0.0'} | ${(featured.release_date || '').split('-')[0]}` } : null,
        popularMovies: popular.results || [],
        popularTV: trending.results || []
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

        if (!details) { // Əgər əsas detallar alınmazsa
            return res.status(404).json({ error: "Detallar tapılmadı və ya xəta baş verdi." });
        }

        res.json({ ...details, cast: credits?.cast || [], similar: similar?.results || [] });
    } catch (e) {
        console.error("Detallar alınarkən xəta:", e.message);
        res.status(500).json({ error: "Daxili server xətası." });
    }
});

// WATCHLIST
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

        if (user.watchlist.some(m => m.id === id)) {
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

app.listen(PORT, () => console.log(`🚀 Server ${PORT} portunda işləyir.`));
