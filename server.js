const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose'); // MongoDB üçün
const bcrypt = require('bcryptjs'); // Şifrə şifrləmə
const jwt = require('jsonwebtoken'); // Giriş seansı üçün

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json()); // JSON formatlı body-ləri oxumaq üçün

// TMDB Məlumatları
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// === MONGODB BAĞLANTISI ===
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB-yə uğurla qoşuldu.'))
    .catch(err => console.error('Baza qoşulma xətası:', err));

// === İSTİFADƏÇİ MODELİ (User Schema) ===
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// === AUTH ROUTES (QEYDİYYAT VƏ GİRİŞ) ===

// 1. Qeydiyyat
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body;

        // Email və ya username varmı yoxla
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ error: 'Email və ya istifadəçi adı artıq istifadə olunur.' });
        }

        // Şifrəni heşlə (Təhlükəsizlik)
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            fullName,
            email,
            username,
            password: hashedPassword
        });

        await newUser.save();
        res.status(201).json({ success: true, message: 'İstifadəçi yaradıldı!' });
    } catch (error) {
        res.status(500).json({ error: 'Qeydiyyat zamanı xəta: ' + error.message });
    }
});

// 2. Giriş
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'İstifadəçi tapılmadı.' });
        }

        // Şifrə yoxlanışı
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Yanlış şifrə.' });
        }

        // JWT Token yarat (1 gün qüvvədə qalır)
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'gizli-acar-soz', { expiresIn: '24h' });

        res.json({
            success: true,
            token,
            user: { username: user.username, fullName: user.fullName }
        });
    } catch (error) {
        res.status(500).json({ error: 'Giriş zamanı xəta.' });
    }
});

// === TMDB ÜMUMİ FUNKSİYA ===
async function fetchFromTMDB(path, params = {}) {
    const queryParams = new URLSearchParams({
        api_key: TMDB_API_KEY,
        language: 'en-US',
        ...params
    }).toString();

    const response = await fetch(`${TMDB_BASE_URL}${path}?${queryParams}`);
    if (!response.ok) throw new Error(`TMDB Xətası: ${response.status}`);
    return await response.json();
}

// === DİGƏR ROUTES (Sizin mövcud TMDB kodlarınız) ===

app.get('/api/movies/popular', async (req, res) => {
    try {
        const data = await fetchFromTMDB('/movie/popular', { page: req.query.page || 1 });
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ... (Burada sizin digər bütün TMDB route-larınız qalır) ...
// Axtarış, Kateqoriya və s. olduğu kimi saxlayın.

app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda aktivdir.`);
});
