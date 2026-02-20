// script.js - CineWave ULTIMATE MASTER VERSION (BÜTÜN FUNKSİYALAR BİRLƏŞDİRİLDİ)
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
        if (response.status === 401 && isAuth) {
            localStorage.clear(); window.location.href = '/login.html';
            return { success: false };
        }
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
                        <span class="imdb-tag">IMDb</span> ⭐ ${rating} <span class="year-span">(${year})</span>
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
    const maxP = Math.min(totalPages, 500);
    pagDiv.innerHTML = `
        <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="window.${callbackName}(${currentPage - 1})">Geri</button>
        <span class="page-info">Səhifə ${currentPage} / ${maxP}</span>
        <button class="page-btn" ${currentPage >= maxP ? 'disabled' : ''} onclick="window.${callbackName}(${currentPage + 1})">İrəli</button>`;
    const target = document.getElementById(containerId); 
    if (target) target.parentElement.appendChild(pagDiv);
}

// --- 4. AUTH VƏ WATCHLIST ---
function updateNavbarStatus() {
    const user = JSON.parse(localStorage.getItem('cinewave_user') || 'null');
    const authBox = document.getElementById('auth-buttons');
    if (authBox && user) {
        const safeN = escapeHTML(user.fullName);
        authBox.innerHTML = `
            <div class="user-profile-container">
                <div class="user-profile" id="profile-trigger">${safeN[0].toUpperCase()}</div>
                <div class="profile-dropdown" id="profile-menu">
                    <div class="dropdown-header">${safeN}</div>
                    <a href="/watchlist.html"><i class="fas fa-list"></i> Siyahım</a>
                    <a href="#" id="logout-link"><i class="fas fa-sign-out-alt"></i> Çıxış</a>
                </div>
            </div>`;
    }
}

window.addToWatchlist = async (id, title, poster, type) => {
    if(!localStorage.getItem('cinewave_token')) return showNotification("Giriş edin!", "warning");
    const r = await apiCall('watchlist/add', true, 'POST', { id: Number(id), title, poster_path: poster, movie_type: type });
    if(r.success) showNotification(`"${title}" əlavə edildi`, 'success');
};

window.removeFromWatchlist = async (e, id, type) => {
    if (e) e.stopPropagation();
    if (!confirm("Siyahıdan silinsin?")) return;
    const r = await apiCall(`watchlist/remove/${id}/${type}`, true, 'DELETE');
    if (r?.success) { showNotification("Silindi", "success"); window.loadWatchlistPage(); }
};

window.loadWatchlistPage = async () => {
    const box = document.getElementById('watchlistContainer'); if (!box) return;
    box.innerHTML = '<div class="spinner" style="grid-column: 1/-1; margin: 40px auto;"></div>';
    const list = await apiCall('watchlist', true);
    if (!list || list.length === 0) { box.innerHTML = '<p class="empty-message">Siyahınız boşdur.</p>'; return; }
    box.className = "movie-row";
    box.innerHTML = list.map(i => {
        const cleanURL = `/movie/${i.movie_type}/${i.id}/${slugify(i.title)}`;
        return `<div class="movie-item"><img src="${CONFIG.IMG + i.poster_path}" onclick="location.href='${cleanURL}'"><div class="movie-info-overlay"><h3>${escapeHTML(i.title)}</h3><button class="remove-btn" onclick="window.removeFromWatchlist(event, '${i.id}', '${i.movie_type}')">Sil</button></div></div>`;
    }).join('');
};

// --- 5. AXTARIŞ VƏ FİLTR ---
function setupInstantSearch() {
    const input = document.getElementById('instant-search-input');
    const results = document.getElementById('instant-results');
    if (!input) return;
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(debounceTimer);
        if (query.length < 2) return;
        debounceTimer = setTimeout(async () => {
            results.innerHTML = '<div class="spinner" style="margin:20px auto; width:30px;"></div>';
            const data = await apiCall(`search?query=${encodeURIComponent(query)}`);
            if (data?.results) {
                results.innerHTML = data.results.slice(0, 15).map(m => {
                    const type = m.media_type || (m.title ? 'movie' : 'tv');
                    const name = m.title || m.name;
                    const year = (m.release_date || m.first_air_date || '').split('-')[0] || 'N/A';
                    const rating = m.vote_average ? m.vote_average.toFixed(1) : 'N/A';
                    const cleanURL = `/movie/${type}/${m.id}/${slugify(name)}`;
                    return `<div class="search-item" onclick="location.href='${cleanURL}'">
                        <img src="${m.poster_path ? CONFIG.IMG+m.poster_path : 'https://via.placeholder.com/50x75'}">
                        <div class="search-info"><h4>${escapeHTML(name)}</h4>
                        <div class="search-meta"><span class="search-type-tag" style="background:${type==='movie'?'#ff4d00':'#00d4ff'}">${type==='movie'?'Film':'Serial'}</span>
                        <span class="search-year">${year}</span> <span style="color:#ffc107">⭐ ${rating}</span></div></div>
                    </div>`;
                }).join('');
            }
        }, 400);
    });
}

// --- 6. AKTYOR SƏHİFƏSİ ---
window.loadActorPage = (p) => {
    const start = (p - 1) * 18, end = start + 18;
    renderItems('actor-movies-grid', allActorCredits.slice(start, end));
    renderPagination('actor-movies-grid', p, Math.ceil(allActorCredits.length / 18), 'loadActorPage');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// --- 7. AI CHAT (3-4 SANİYƏLİK BALON İLƏ) ---
function initAIChat() {
    const trigger = document.getElementById('chat-trigger'), win = document.getElementById('chat-window'), hint = document.getElementById('chat-hint');
    const input = document.getElementById('chat-input'), msgBox = document.getElementById('chat-messages');
    if (!trigger) return;

    // Sayta girəndə 3 saniyə sonra çıxsın, 4 saniyə qalsın və itsin
    setTimeout(() => { 
        if (win.style.display !== 'flex' && hint) {
            hint.classList.add('show'); 
            setTimeout(() => { hint.classList.remove('show'); }, 4000); // 4 saniyə sonra itsin
        }
    }, 3000);

    trigger.onclick = () => { 
        win.style.display = win.style.display === 'flex' ? 'none' : 'flex'; 
        hint?.classList.remove('show');
        if(win.style.display === 'flex') input.focus();
    };

    document.getElementById('close-chat').onclick = () => win.style.display = 'none';

    document.getElementById('send-chat').onclick = async () => {
        const msg = input.value.trim(); if (!msg) return;
        const uDiv = document.createElement('div'); uDiv.className = 'user-msg'; uDiv.innerText = msg; msgBox.appendChild(uDiv); input.value = '';
        const lDiv = document.createElement('div'); lDiv.className = 'ai-msg'; lDiv.innerText = '... 🤔'; msgBox.appendChild(lDiv); msgBox.scrollTop = msgBox.scrollHeight;
        const userId = localStorage.getItem('ai_user_id') || "guest_" + Math.random().toString(36).substring(7);
        localStorage.setItem("ai_user_id", userId);
        const res = await fetch('/api/ai/chat', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ message: msg, userId: userId }) });
        const data = await res.json(); lDiv.innerText = data.reply; msgBox.scrollTop = msgBox.scrollHeight;
    };
    if (input) input.onkeypress = (e) => { if (e.key === 'Enter') document.getElementById('send-chat').click(); };
}

// --- 8. SƏHİFƏ YÜKLƏNMƏLƏRİ ---
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

// --- 9. DOM CONTENT LOADED ---
document.addEventListener('DOMContentLoaded', async () => {
    updateNavbarStatus();
    setupInstantSearch();
    initAIChat();

    if (document.getElementById('featured-section')) loadHomeData();
    if (document.getElementById('watchlistContainer')) window.loadWatchlistPage();

    const actorGrid = document.getElementById('actor-movies-grid');
    if (actorGrid) {
        const actorId = window.location.pathname.split('/').filter(Boolean).slice(-2, -1)[0];
        const data = await apiCall(`person/${actorId}/credits`);
        if (data?.cast) { allActorCredits = data.cast; window.loadActorPage(1); }
    }

    // DETALLAR SƏHİFƏSİ
    const detBox = document.getElementById('details-content');
    if (detBox) {
        const path = window.location.pathname.split('/');
        const mType = path.includes('movie') ? path[path.indexOf('movie') + 1] : 'movie';
        const mId = path.includes('movie') ? path[path.indexOf('movie') + 2] : null;
        if(mId) {
            const m = await apiCall(`details/${mType}/${mId}`);
            if(m && m.success) {
                const name = m.title || m.name;
                document.title = `CineWave | ${name}`;
                
                // HTML-i qururuq (Oxşar məzmunlar bloku ilə birlikdə)
                detBox.innerHTML = `
                    <section class="detail-hero">
                        <div class="detail-poster"><img src="${CONFIG.IMG+m.poster_path}"></div>
                        <div class="detail-info">
                            <h1>${name}</h1>
                            <div class="movie-meta">⭐ ${m.vote_average?.toFixed(1)}</div>
                            <p>${m.overview}</p>
                            <div class="featured-actions"><button class="btn primary-btn" id="play-btn">İzlə</button></div>
                            <h3 style="margin-top:20px;">Heyət</h3>
                            <div class="cast-row" style="display:flex; overflow-x:auto; gap:15px; padding-bottom:10px; margin-top:10px;">
                                ${m.cast?.slice(0,12).map(c => `
                                    <div onclick="location.href='/actor/${c.id}/${slugify(c.name)}'" style="cursor:pointer; text-align:center; flex:0 0 70px;">
                                        <img src="${CONFIG.IMG+c.profile_path}" style="width:60px; height:60px; border-radius:50%; object-fit:cover; border:2px solid var(--primary);">
                                        <p style="font-size:10px; color:white; margin-top:5px;">${c.name}</p>
                                    </div>`).join('')}
                            </div>
                        </div>
                    </section>
                    
                    <div id="player-container" style="display:none; margin-top:30px;">
                        <iframe id="video-iframe" src="" allowfullscreen style="width:100%; height:500px; border:2px solid var(--primary); border-radius:15px;"></iframe>
                    </div>

                    <!-- OXŞAR MƏZMUNLAR BÖLMƏSİ -->
                    <h2 style="margin:40px 0 20px; border-left:5px solid var(--primary); padding-left:15px;">Oxşar Məzmunlar</h2>
                    <div class="movie-row" id="similar-grid"></div>`;

                // Oxşar filmləri render edirik
                if (m.similar && m.similar.length > 0) {
                    renderItems('similar-grid', m.similar, mType);
                } else {
                    document.getElementById('similar-grid').innerHTML = '<p style="color:gray;">Bənzər məzmun tapılmadı.</p>';
                }

                // İzlə düyməsi logikası
                document.getElementById('play-btn').onclick = () => {
                    document.getElementById('video-iframe').src = `https://vidsrc.me/embed/${mType}/${mId}`;
                    document.getElementById('player-container').style.display = 'block';
                    document.getElementById('player-container').scrollIntoView({ behavior: 'smooth' });
                };
            }
        }
    }

    // MENU CLICK HANDLERS
    document.addEventListener('click', (e) => {
        if(e.target.id === 'hamburger-menu' || e.target.closest('#hamburger-menu')) document.getElementById('mobile-nav').classList.toggle('active');
        if(e.target.id === 'profile-trigger') document.getElementById('profile-menu').classList.toggle('show');
        if(e.target.id === 'logout-link') { localStorage.clear(); location.href = '/index.html'; }
        if(e.target.id === 'close-search' || e.target.classList.contains('search-modal')) document.getElementById('search-modal').style.display = 'none';
        if(e.target.closest('.search-box') || e.target.classList.contains('fa-search')) { 
            document.getElementById('search-modal').style.display = 'flex'; 
            document.getElementById('instant-search-input').focus(); 
        }
    });
});
