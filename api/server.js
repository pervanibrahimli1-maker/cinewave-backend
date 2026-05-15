// api/server.js - CineWave ULTIMATE FULL VERSION (EVERYTHING INCLUDED)
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
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
const { v4: uuidv4 } = require('uuid');

// Global Ayarlar
app.set('trust proxy', 1); 
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'cinewave_secret_key_2024';
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// AI Yaddaşı və Limiti
const chatMemory = {};
const MAX_MESSAGES = 10;

// 1. TƏHLÜKƏSİZLİK VƏ MIDDLEWARE
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(mongoSanitize());
app.use(xssClean());
app.use(hpp());
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

// Rate Limiters
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, message: { error: "Çox sayda sorğu." } });
app.use('/api/', generalLimiter);

const authLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: { error: "Limit keçildi. Bir az gözləyin." } });
app.use('/api/auth/', authLimiter);

// 2. DATABASE MODELLƏRİ
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected.'))
    .catch(error => console.error('❌ DB Error:', error));

const User = mongoose.model('User', new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    watchlist: [{ id: Number, title: String, poster_path: String, movie_type: String }]
}, { timestamps: true }));

const View = mongoose.model('View', new mongoose.Schema({
    movieId: { type: String, required: true, unique: true },
    viewers: [String]
}));

// 3. YARDIMÇI FUNKSİYALAR
async function fetchTMDB(path, params = {}) {
    const query = new URLSearchParams({ api_key: TMDB_API_KEY, ...params, language: 'en-US' });
    try {
        const response = await fetch(`${TMDB_BASE_URL}${path}?${query}`);
        return await response.json();
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

function slugify(text) {
    return text.toString().toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-').trim();
}

// --- 4. AUTH ROUTELARI (TURNSTILE İLƏ) ---
async function verifyTurnstile(token) {
    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${secretKey}&response=${token}`
    });
    const data = await res.json();
    return data.success;
}

app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;
        const isHuman = await verifyTurnstile(req.body['cf-turnstile-response']);
        if (!isHuman) return res.status(403).json({ error: "Robot yoxlanışı uğursuz oldu." });

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
        const isHuman = await verifyTurnstile(req.body['cf-turnstile-response']);
        if (!isHuman) return res.status(403).json({ error: "Robot yoxlanışı uğursuz oldu." });

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Məlumatlar yanlışdır." });

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, user: { fullName: user.fullName, username: user.username, email: user.email } });
    } catch (e) { res.status(500).json({ error: "Giriş xətası." }); }
});

// --- 5. CONTENT ROUTELARI (HOME, DETAILS, DISCOVER) ---
app.get('/api/home', async (req, res) => {
    try {
        const [movies, tv] = await Promise.all([fetchTMDB('/movie/popular'), fetchTMDB('/tv/popular')]);
        let featured = movies?.results[0] || null;
        if (featured) {
            const views = await View.findOne({ movieId: featured.id.toString() });
            featured.viewCount = views ? views.viewers.length : 0;
            if (featured.overview) {
                try { const tr = await translate(featured.overview, { to: 'az' }); featured.overview = tr.text; } catch (e) {}
            }
        }
        res.json({ featured, popularMovies: movies?.results || [], popularTV: tv?.results || [] });
    } catch (e) { res.status(500).json({ error: "Home xətası" }); }
});

// api/server.js - Mövcud 'Digər API-lar' hissəsindən əvvəl əlavə edin

// Popular Filmlər üçün endpoint (BU VACİBDİR!)
app.get('/api/movies/popular', async (req, res) => {
    try {
        const page = req.query.page || 1;
        const data = await fetchTMDB('/movie/popular', { page });
        res.json(data || { results: [], total_pages: 1 });
    } catch (e) {
        res.status(500).json({ error: "Filmlər yüklənərkən xəta baş verdi." });
    }
});

app.get('/api/movies/now-playing', async (req, res) => {
    try {
        const page = req.query.page || 1;
        const data = await fetchTMDB('/movie/now_playing', { page });
        res.json(data || { results: [], total_pages: 1 });
    } catch (e) {
        res.status(500).json({ error: "Yeni yayımlanan filmlər yüklənərkən xəta baş verdi." });
    }
});

// Popular TV Seriallar üçün endpoint (BU VACİBDİR!)
app.get('/api/tv/popular', async (req, res) => {
    try {
        const page = req.query.page || 1;
        const data = await fetchTMDB('/tv/popular', { page });
        res.json(data || { results: [], total_pages: 1 });
    } catch (e) {
        res.status(500).json({ error: "Seriallar yüklənərkən xəta baş verdi." });
    }
});

app.get('/api/tv/on-the-air', async (req, res) => {
    try {
        const page = req.query.page || 1;
        const data = await fetchTMDB('/tv/on_the_air', { page });
        res.json(data || { results: [], total_pages: 1 });
    } catch (e) {
        res.status(500).json({ error: "Yeni yayımlanan seriallar yüklənərkən xəta baş verdi." });
    }
});

// Janr siyahılarını gətirmək üçün endpoint (Əvvəlki problem üçün)
app.get('/api/genres/:type/list', async (req, res) => {
    const { type } = req.params;
    if (!['movie', 'tv'].includes(type)) {
        return res.status(400).json({ error: "Yanlış janr tipi. 'movie' və ya 'tv' olmalıdır." });
    }
    try {
        const data = await fetchTMDB(`/genre/${type}/list`);
        res.json(data?.genres || []);
    } catch (e) {
        res.status(500).json({ error: "Janr siyahısı yüklənərkən xəta baş verdi." });
    }
});

app.get('/api/details/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    try {
        const [mainData, credits, recs, views] = await Promise.all([
            fetchTMDB(`/${type}/${id}`), fetchTMDB(`/${type}/${id}/credits`),
            fetchTMDB(`/${type}/${id}/recommendations`), View.findOne({ movieId: id })
        ]);
        if (mainData && mainData.overview) {
            try { const tr = await translate(mainData.overview, { to: 'az' }); mainData.overview = tr.text; } catch (e) {}
        }
        res.json({ ...mainData, cast: credits?.cast?.slice(0, 15) || [], similar: recs?.results?.slice(0, 12) || [], viewCount: views ? views.viewers.length : 0, success: true });
    } catch (e) { res.status(500).json({ error: "Details xətası" }); }
});

app.get('/api/discover/:type', async (req, res) => {
    const { type } = req.params;
    const { with_genres, year, page } = req.query;
    let params = { with_genres: with_genres || '', page: page || 1, sort_by: 'popularity.desc' };
    if (year) {
        if (type === 'movie') params.primary_release_year = year;
        else params.first_air_date_year = year;
    }
    const data = await fetchTMDB(`/discover/${type}`, params);
    res.json(data || { results: [], total_pages: 1 });
});

app.get('/api/details/:type/:id/season/:season_number', async (req, res) => {
    const { type, id, season_number } = req.params;
    // Yalnız TV serialları üçün işləməli
    if (type !== 'tv') return res.status(400).json({ error: "Yalnız TV serialları üçün sezona müraciət edilə bilər." });
    try {
        // TMDB-dən müvafiq sezonun detallarını gətirir
        const data = await fetchTMDB(`/tv/${id}/season/${season_number}`);
        if (!data) return res.status(404).json({ error: "Sezon tapılmadı." });
        res.json(data);
    } catch (e) {
        // Xəta olarsa konsola yaz və uyğun cavab qaytar
        console.error(`Error fetching season ${season_number} for TV ID ${id}:`, e);
        res.status(500).json({ error: "Sezon bölümləri yüklənərkən xəta baş verdi." });
    }
});

// --- 6. WATCHLIST VƏ SƏHİFƏ SAYĞACI ---
app.get('/api/watchlist', authMiddleware, async (req, res) => {
    const user = await User.findById(req.user.id);
    res.json(user ? user.watchlist : []);
});

app.post('/api/watchlist/add', authMiddleware, async (req, res) => {
        try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: "İstifadəçi tapılmadı." });

        const MAX_WATCHLIST_ITEMS = 15; // Limit burada təyin olunur
        if (user.watchlist.length >= MAX_WATCHLIST_ITEMS) {
            return res.status(400).json({ error: `İzləmə siyahısı maksimum ${MAX_WATCHLIST_ITEMS} element ola bilər.` });
        }

        // Eyni məzmunun artıq siyahıda olub olmadığını yoxlayır (ID və TYPE görə)
        if (user.watchlist.some(m => Number(m.id) === Number(req.body.id) && m.movie_type === req.body.movie_type)) {
            return res.status(400).json({ error: "Bu məzmun artıq siyahıdadır." });
        }

        user.watchlist.push(req.body);
        await user.save();
        res.json({ success: true, message: "Siyahıya əlavə edildi." });
    } catch (e) {
        res.status(500).json({ error: "Server xətası, siyahıya əlavə edilmədi." });
    }
});

app.delete('/api/watchlist/remove/:id/:type', authMiddleware, async (req, res) => {
    const user = await User.findById(req.user.id);
    user.watchlist = user.watchlist.filter(i => !(i.id == req.params.id && i.movie_type == req.params.type));
    await user.save();
    res.json({ success: true });
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

// --- 7. AI CHAT (GROQ İLƏ) ---
app.post('/api/ai/chat', async (req, res) => {
    try {
        const { message } = req.body;
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (!chatMemory[userIp]) chatMemory[userIp] = [];
        if (chatMemory[userIp].length >= MAX_MESSAGES) {
            return res.json({ reply: "Sual limitiniz bitdi. Səhifəni yeniləyin.", limitReached: true });
        }
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "system", content: "Sən CineWave AI-san. Sən filmlər üzrə mütəxəssissən. İstifadəçilərin bəyəndiyi film tipinə, növnə, janrına görə onlara məsləhətlər verəcəksən." }, { role: "user", content: message }]
            })
        });
        const groqData = await groqRes.json();
        const aiReply = groqData.choices?.[0]?.message?.content || "Cavab yoxdur.";
        chatMemory[userIp].push({ role: "user", content: message });
        res.json({ reply: aiReply, limitReached: false });
    } catch (err) { res.status(500).json({ reply: "AI bağlantı xətası." }); }
});

// --- 8. SEO / GOOGLE BOTS (Dinamik HTML) ---
app.get('/movie/:type/:id/:slug?', async (req, res) => {
    const { type, id } = req.params;
    try {
        const movie = await fetchTMDB(`/${type}/${id}`, { language: 'az-AZ' });
        if (!movie || movie.status_code) return res.status(404).send("Tapılmadı");
        const title = movie.title || movie.name;
        const year = (movie.release_date || movie.first_air_date || "").split("-")[0];
        res.send(`<!DOCTYPE html><html lang="az"><head><meta charset="UTF-8"><title>${title} (${year}) - CineWave</title><meta name="description" content="${movie.overview?.substring(0,160)}"><meta property="og:image" content="https://image.tmdb.org/t/p/w500${movie.poster_path}"></head><body><h1>${title}</h1><p>${movie.overview}</p><script>window.location.replace("/movie-details.html?id=${id}&type=${type}");</script></body></html>`);
    } catch (e) { res.status(500).send("Xəta"); }
});

// --- 9. SOCKET.IO WATCH PARTY LOGIC ---
const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', ({ roomId, username, movieData, isPublic }) => {
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = {
                id: roomId,
                host: socket.id,
                movie: movieData,
                users: [],
                chat: [],
                isPublic: isPublic || false,
                createdAt: new Date()
            };
        }
        rooms[roomId].users.push({ id: socket.id, username });
        
        io.to(roomId).emit('user-joined', { 
            users: rooms[roomId].users, 
            chat: rooms[roomId].chat,
            movie: rooms[roomId].movie,
            isPublic: rooms[roomId].isPublic
        });
        
        console.log(`${username} joined room ${roomId}`);
    });

    socket.on('send-message', ({ roomId, username, message }) => {
        const msgData = { username, message, time: new Date().toLocaleTimeString() };
        if (rooms[roomId]) {
            rooms[roomId].chat.push(msgData);
            if (rooms[roomId].chat.length > 50) rooms[roomId].chat.shift();
            io.to(roomId).emit('new-message', msgData);
        }
    });

    socket.on('player-state-change', ({ roomId, state, time }) => {
        // Sync state to everyone except the sender
        socket.to(roomId).emit('sync-state', { state, time });
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
            if (rooms[roomId].users.length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('user-left', rooms[roomId].users);
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

// Create Room Endpoint
app.post('/api/rooms/create', authMiddleware, (req, res) => {
    const roomId = uuidv4().substring(0, 8);
    const { isPublic } = req.body;
    res.json({ roomId });
});

// List Public Rooms
app.get('/api/rooms/public', (req, res) => {
    const publicRooms = Object.values(rooms)
        .filter(r => r.isPublic)
        .map(r => ({
            roomId: r.id,
            movie: r.movie,
            userCount: r.users.length,
            createdAt: r.createdAt
        }));
    res.json(publicRooms);
});

// Digər API-lar
app.get('/api/search', async (req, res) => { res.json(await fetchTMDB('/search/multi', { query: req.query.query })); });
app.get('/api/person/:id/credits', async (req, res) => {
    const data = await fetchTMDB(`/person/${req.params.id}/combined_credits`);
    res.json({ cast: data?.cast || [] });
});

server.listen(PORT, () => console.log(`🚀 CineWave Server is flying on ${PORT}`));
module.exports = app;
