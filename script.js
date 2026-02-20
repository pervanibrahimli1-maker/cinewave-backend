// script.js - CineWave ULTIMATE MASTER VERSION (CLEANED)
const CONFIG = {
    API: '/api', 
    IMG: 'https://image.tmdb.org/t/p/w500',
    HD: 'https://image.tmdb.org/t/p/original'
};

// Global States
let currentTVState = { id: null, season: null, episode: null, allEpisodes: [], timer: null, timeLeft: 0 };
let filterState = { genres: [], year: "", type: "movie" };
let debounceTimer;
let allActorCredits = [];

// --- 1. KÖMƏKÇİ FUNKSİYALAR ---
function escapeHTML(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function slugify(text) {
    if(!text) return "video";
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '').replace(/-+$/, '');
}

function formatRuntime(min) {
    if (!min) return "N/A";
    return min >= 60 ? `${Math.floor(min/60)}s ${min%60}d` : `${min}d`;
}

function showNotification(message, type = 'info') {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    const n = document.createElement('div');
    n.className = `notification ${type} show`;
    n.innerHTML = `<div class="notification-content"><span>${escapeHTML(message)}</span></div>`;
    document.body.appendChild(n);
    setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 500); }, 3000);
}

// --- 2. API MƏNTİQİ ---
async function apiCall(end, isAuth = false, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (isAuth) {
        const token = localStorage.getItem('cinewave_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    try {
        const response = await fetch(`${CONFIG.API}/${end}`, options);
        return await response.json();
    } catch (e) { return { success: false }; }
}

// --- 3. RENDER FUNKSİYALARI ---
function renderItems(containerId, itemsData, typeField = 'movie') { 
    const box = document.getElementById(containerId); 
    if (!box) return;
    box.innerHTML = ''; 
    const list = Array.isArray(itemsData) ? itemsData : (itemsData?.results || []);
    if (list.length === 0) { box.innerHTML = '<p class="empty-message" style="grid-column: 1/-1; text-align:center; padding:50px;">Heç nə tapılmadı.</p>'; return; }
    
    box.innerHTML = list.map(m => { 
        const type = m.media_type || typeField;
        const name = m.title || m.name;
        const year = (m.release_date || m.first_air_date || '').split('-')[0] || '';
        const rating = (m.vote_average && m.vote_average > 0) ? m.vote_average.toFixed(1) : "Yeni";
        const cleanURL = `/movie/${type}/${m.id}/${slugify(name)}`;
        
        return `
            <div class="movie-item">
                <img src="${m.poster_path ? CONFIG.IMG + m.poster_path : 'https://via.placeholder.com/50x750'}" 
                     alt="${escapeHTML(name)}" loading="lazy" onclick="location.href='${cleanURL}'">
                <button class="card-add-btn" onclick="window.addToWatchlist('${m.id}', '${escapeHTML(name).replace(/'/g, "\\'")}', '${m.poster_path}', '${type}')">
                    <i class="fas fa-plus"></i>
                </button>
                <div class="movie-info-overlay" onclick="location.href='${cleanURL}'">
                    <h3>${escapeHTML(name)}</h3>
                    <div class="movie-meta">
                        <span class="imdb-tag">IMDb</span> ⭐ ${rating} 
                        <span class="year-span">(${year})</span>
                    </div>
                </div>
            </div>`;
    }).join('');
}

function renderPagination(containerId, currentPage, totalPages, callbackName) {
    const existing = document.getElementById(containerId + '-pagination');
    if (existing) existing.remove();
    if (totalPages <= 1) return;
    const pagDiv = document.createElement('div');
    pagDiv.id = containerId + '-pagination';
    pagDiv.className = 'pagination-container';
    pagDiv.innerHTML = `
        <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="window.${callbackName}(${currentPage - 1})">Geri</button>
        <span class="page-info">Səhifə ${currentPage} / ${totalPages}</span>
        <button class="page-btn" ${currentPage >= totalPages ? 'disabled' : ''} onclick="window.${callbackName}(${currentPage + 1})">İrəli</button>`;
    const target = document.getElementById(containerId); 
    if (target) target.parentElement.appendChild(pagDiv);
}

// --- 4. AXTARIŞ ---
function setupInstantSearch() {
    const input = document.getElementById('instant-search-input');
    const results = document.getElementById('instant-results');
    if (!input) return;
    
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(debounceTimer);
        if (query.length < 2) { results.innerHTML = '<p style="text-align:center;color:gray;padding:20px;">Kəşf etmək üçün yazın...</p>'; return; }
        
        debounceTimer = setTimeout(async () => {
            results.innerHTML = '<div class="spinner" style="margin:20px auto; width:30px;"></div>';
            const data = await apiCall(`search?query=${encodeURIComponent(query)}`);
            if (data?.results?.length > 0) {
                results.innerHTML = data.results.slice(0, 15).map(m => {
                    const name = m.title || m.name;
                    const type = m.media_type || (m.title ? 'movie' : 'tv');
                    const cleanURL = `/movie/${type}/${m.id}/${slugify(name)}`;
                    return `
                    <div class="search-item" onclick="location.href='${cleanURL}'">
                        <img src="${m.poster_path ? CONFIG.IMG + m.poster_path : 'https://via.placeholder.com/50x75'}">
                        <div class="search-info">
                            <h4>${escapeHTML(name)}</h4>
                            <div class="search-meta">
                                <span class="search-type-tag" style="background:${type==='movie'?'#ff4d00':'#00d4ff'}">${type==='movie'?'Film':'Serial'}</span>
                            </div>
                        </div>
                    </div>`;
                }).join('');
            } else { results.innerHTML = '<p style="text-align:center; color:gray; padding:20px;">Tapılmadı.</p>'; }
        }, 400);
    });
}

// --- 5. AI CHAT ---
function initAIChat() {
    const trigger = document.getElementById('chat-trigger');
    const windowEl = document.getElementById('chat-window');
    const hint = document.getElementById('chat-hint');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-chat');
    const msgBox = document.getElementById('chat-messages');

    if (!trigger || !windowEl) return;

    setTimeout(() => { if (windowEl.style.display !== 'flex' && hint) hint.classList.add('show'); }, 3000);

    trigger.onclick = () => {
        const isShowing = windowEl.style.display === 'flex';
        windowEl.style.display = isShowing ? 'none' : 'flex';
        if (hint) hint.classList.remove('show');
        if (!isShowing) input.focus();
    };

    const addMsg = (text, type) => {
        const div = document.createElement('div');
        div.className = type === 'user' ? 'user-msg' : 'ai-msg';
        div.innerText = text;
        msgBox.appendChild(div);
        msgBox.scrollTop = msgBox.scrollHeight;
    };

    const handleSend = async () => {
        const msg = input.value.trim();
        if (!msg) return;

        addMsg(msg, 'user');
        input.value = '';

        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'ai-msg';
        loadingDiv.innerText = 'Düşünürəm... 🤔';
        msgBox.appendChild(loadingDiv);

        let userId = localStorage.getItem("ai_user_id") || "guest_" + Math.random().toString(36).substring(7);
        localStorage.setItem("ai_user_id", userId);

        try {
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, userId })
            });
            const data = await res.json();
            loadingDiv.remove();
            addMsg(data.reply || "Bağışlayın, cavab verə bilmədim.", 'ai');
        } catch (e) {
            loadingDiv.innerText = "Xəta baş verdi.";
        }
    };

    if (sendBtn) sendBtn.onclick = handleSend;
    if (input) input.onkeypress = (e) => { if (e.key === 'Enter') handleSend(); };
}

// --- 6. SƏHİFƏ YÜKLƏNMƏLƏRİ ---
async function loadHomeData() {
    const d = await apiCall('home');
    if (d?.featured) {
        const h = d.featured;
        document.getElementById('featured-section').style.backgroundImage = `linear-gradient(90deg, #0a0b10 0%, rgba(10,11,16,0.8) 45%, rgba(10,11,16,0.1) 100%), url(${CONFIG.HD + h.backdrop_path})`;
        document.getElementById('featured-title').innerText = h.title || h.name;
        document.getElementById('featured-desc').innerText = h.overview || "Təsvir yoxdur.";
        document.getElementById('hero-play-btn').onclick = () => location.href = `/movie/movie/${h.id}/${slugify(h.title || h.name)}`;
    }
    if(d?.popularMovies) renderItems('popular-movies', d.popularMovies, 'movie');
    if(d?.popularTV) renderItems('new-releases', d.popularTV, 'tv');
}

document.addEventListener('DOMContentLoaded', async () => {
    setupInstantSearch();
    initAIChat();
    if (document.getElementById('featured-section')) loadHomeData();

    // Mobil Menyu
    document.getElementById('hamburger-menu')?.addEventListener('click', () => {
        document.getElementById('mobile-nav').classList.toggle('active');
    });
});

window.loadActorPage = (page) => {
    const items = allActorCredits.slice((page-1)*18, page*18);
    renderItems('actor-movies-grid', items);
    renderPagination('actor-movies-grid', page, Math.ceil(allActorCredits.length/18), 'loadActorPage');
};
