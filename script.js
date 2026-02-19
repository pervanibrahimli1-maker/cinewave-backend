// script.js - CineWave ULTIMATE SEO & VERCEL VERSION
const CONFIG = {
    API: '/api', 
    IMG: 'https://image.tmdb.org/t/p/w500',
    HD: 'https://image.tmdb.org/t/p/original'
};

// Global States
let currentTVState = { id: null, season: null, episode: null, allEpisodes: [], timer: null, timeLeft: 0 };
let filterState = { genres: [], year: "", type: "movie" };
let debounceTimer;
let allActorCredits = []; // Aktyorun bütün filmlərini yadda saxlamaq üçün

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
        .replace(/^-+/, '')
        .replace(/-+$/, '');
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
        if (response.status === 204) return { success: true };
        const data = await response.json();
        if (!response.ok) {
            if (data.error || data.message) showNotification(data.error || data.message, "error");
            if (response.status === 401 && isAuth) { localStorage.clear(); window.location.href = '/login.html'; }
            return { success: false, ...data };
        }
        return data;
    } catch (e) { return { success: false }; }
}

// --- 3. RENDER VƏ PAGINATION ---
function renderItems(containerId, itemsData, typeField = 'movie') { 
    const box = document.getElementById(containerId); 
    if (!box) return;
    box.innerHTML = ''; 
    const list = Array.isArray(itemsData) ? itemsData : (itemsData?.results || []);
    if (list.length === 0) { box.innerHTML = '<p class="empty-message" style="grid-column: 1/-1; text-align:center; padding:50px;">Heç nə tapılmadı.</p>'; return; }
    
    box.innerHTML = list.map(m => { 
        const type = m.media_type || typeField;
        const name = m.title || m.name;
        const safeName = escapeHTML(name);
        const year = (m.release_date || m.first_air_date || '').split('-')[0] || '';
        const rating = (m.vote_average && m.vote_average > 0) ? m.vote_average.toFixed(1) : "Yeni";
        const cleanURL = `/movie/${type}/${m.id}/${slugify(name)}`;
        
        return `
            <div class="movie-item">
                <img src="${m.poster_path ? CONFIG.IMG + m.poster_path : 'https://via.placeholder.com/500x750'}" 
                     alt="${safeName}" title="${safeName}" loading="lazy"
                     onclick="location.href='${cleanURL}'">
                <button class="card-add-btn" onclick="window.addToWatchlist('${m.id}', '${safeName.replace(/'/g, "\\'")}', '${m.poster_path}', '${type}')">
                    <i class="fas fa-plus"></i>
                </button>
                <div class="movie-info-overlay" onclick="location.href='${cleanURL}'">
                    <h3>${safeName}</h3>
                    <div class="movie-meta">
                        <span class="imdb-tag">IMDb</span> ⭐ ${rating} 
                        <span class="year-span" style="color: #a0a0a0; font-size: 0.9em; margin-left: 5px;">(${year})</span>
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

// --- 4. NAVBAR VƏ İSTİFADƏÇİ STATUSU ---
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

// --- 5. TAYMER VƏ FİLTR LOGİKASI ---
function startNetflixTimer(runtimeMin) {
    if (currentTVState.timer) clearInterval(currentTVState.timer);
    const container = document.getElementById('player-container');
    if (!container) return;
    container.classList.remove('show-next');
    const nextEp = currentTVState.allEpisodes.find(ep => ep.episode_number === currentTVState.episode + 1);
    if (!nextEp) return;
    const titleEl = document.getElementById('next-ep-title');
    if(titleEl) titleEl.innerText = `${nextEp.episode_number}. Bölüm Hazırdır`;
    currentTVState.timeLeft = (runtimeMin * 60) - 30;
    currentTVState.timer = setInterval(() => {
        if (document.hidden) return;
        currentTVState.timeLeft--;
        if (currentTVState.timeLeft <= 0) { clearInterval(currentTVState.timer); container.classList.add('show-next'); }
    }, 1000);
}

window.loadFilteredResults = async (page = 1) => {
    if (filterState.genres.length === 0 && filterState.year === "") return showNotification("Zəhmət olmasa bir kateqoriya və ya il seçin!", "warning");
    const type = document.getElementById('filter-type').value;
    let resultsBox = document.getElementById('filter-results-container');
    if (!resultsBox) {
        const section = document.createElement('section');
        section.innerHTML = `<h2 style="margin-top:40px; border-left:5px solid var(--primary); padding-left:15px;">Axtarış Nəticələri</h2><div class="movie-row" id="filter-results-container"></div>`;
        document.querySelector('.container').appendChild(section);
        resultsBox = document.getElementById('filter-results-container');
    }
    resultsBox.innerHTML = '<div class="spinner" style="grid-column: 1/-1; margin: 40px auto;"></div>';
    const data = await apiCall(`discover/${type}?with_genres=${filterState.genres.join(',')}&year=${filterState.year}&page=${page}`);
    renderItems('filter-results-container', data.results, type);
    renderPagination('filter-results-container', page, data.total_pages, 'loadFilteredResults');
    resultsBox.scrollIntoView({ behavior: 'smooth' });
};
window.applyFilters = () => window.loadFilteredResults(1);

// --- 6. SƏHİFƏ YÜKLƏNMƏLƏRİ ---
async function loadHomeData() {
    const d = await apiCall('home');
    if (d?.featured) {
        const h = d.featured;
        const name = h.title || h.name;
        const safeName = escapeHTML(name);
        const rating = h.vote_average?.toFixed(1) || "N/A";
        const year = (h.release_date || '').split('-')[0];
        const views = h.viewCount || 0;

        document.getElementById('featured-section').style.backgroundImage = `linear-gradient(90deg, #0a0b10 0%, rgba(10,11,16,0.8) 45%, rgba(10,11,16,0.1) 100%), url(${CONFIG.HD + h.backdrop_path})`;
        document.getElementById('featured-title').innerText = safeName;
        
        document.getElementById('featured-desc').innerHTML = `
            <div style="margin-bottom: 15px; display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
                <span class="imdb-tag">IMDb</span> <span style="color: #ffc107; font-weight: bold;">⭐ ${rating}</span>
                <span style="color: #a0a0a0;">| ${year}</span>
                <span style="color: var(--primary); font-weight: bold;">
                    <i class="fas fa-eye"></i> ${views} baxış
                </span>
            </div>
            <p>${h.overview || "Təsvir yoxdur."}</p>
        `;
        const cleanURL = `/movie/movie/${h.id}/${slugify(name)}`;
        document.getElementById('hero-play-btn').onclick = () => location.href = cleanURL;
        document.getElementById('hero-add-btn').onclick = () => window.addToWatchlist(h.id, safeName, h.poster_path, 'movie');
    }
    if(d?.popularMovies) renderItems('popular-movies', d.popularMovies, 'movie');
    if(d?.popularTV) renderItems('new-releases', d.popularTV, 'tv');
}

window.loadMovies = async (p = 1) => {
    if(!document.getElementById('movies-popular-grid')) return;
    const d = await apiCall(`movies/popular?page=${p}`);
    renderItems('movies-popular-grid', d.results, 'movie');
    renderPagination('movies-popular-grid', p, d.total_pages, 'loadMovies');
};

window.loadSeries = async (p = 1) => {
    if(!document.getElementById('series-popular-grid')) return;
    const d = await apiCall(`tv/popular?page=${p}`);
    renderItems('series-popular-grid', d.results, 'tv');
    renderPagination('series-popular-grid', p, d.total_pages, 'loadSeries');
};

// --- 7. CANLI AXTARIŞ ---
function setupInstantSearch() {
    const input = document.getElementById('instant-search-input');
    const results = document.getElementById('instant-results');
    if (!input) return;
    
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(debounceTimer);
        
        if (query.length < 2) { 
            results.innerHTML = '<p style="text-align:center;color:gray;padding:20px;">Kəşf etmək üçün yazmağa başlayın...</p>'; 
            return; 
        }
        
        debounceTimer = setTimeout(async () => {
            results.innerHTML = '<div class="spinner" style="margin:20px auto; width:30px; height:30px;"></div>';
            const data = await apiCall(`search?query=${encodeURIComponent(query)}`);
            
            if (data?.results?.length > 0) {
                results.innerHTML = data.results.slice(0, 15).map(m => {
                    const name = m.title || m.name;
                    const type = m.media_type || (m.title ? 'movie' : 'tv');
                    const year = (m.release_date || m.first_air_date || '').split('-')[0] || 'N/A';
                    const rating = (m.vote_average && m.vote_average > 0) ? m.vote_average.toFixed(1) : "N/A";
                    const typeLabel = type === 'movie' ? 'Film' : 'Serial';
                    const cleanURL = `/movie/${type}/${m.id}/${slugify(name)}`;
                    
                    return `
                    <div class="search-item" onclick="location.href='${cleanURL}'">
                        <img src="${m.poster_path ? CONFIG.IMG + m.poster_path : 'https://via.placeholder.com/50x75'}" alt="${escapeHTML(name)}">
                        <div class="search-info">
                            <h4>${escapeHTML(name)}</h4>
                            <div class="search-meta">
                                <span class="search-type-tag" style="background: ${type === 'movie' ? '#ff4d00' : '#00d4ff'}">${typeLabel}</span>
                                <span class="search-year">${year}</span>
                                <span class="search-rating"><i class="fas fa-star"></i> ${rating}</span>
                            </div>
                        </div>
                    </div>`;
                }).join('');
            } else { 
                results.innerHTML = '<p style="text-align:center; color:gray; padding:20px;">Heç nə tapılmadı.</p>'; 
            }
        }, 400);
    });
}

// --- 8. DOM BAŞLADIŞ ---
document.addEventListener('DOMContentLoaded', async () => {
    updateNavbarStatus();
    setupInstantSearch();

    if (document.getElementById('featured-section')) loadHomeData();
    if (document.getElementById('movies-popular-grid')) window.loadMovies(1);
    if (document.getElementById('series-popular-grid')) window.loadSeries(1);
    if (document.getElementById('watchlistContainer')) window.loadWatchlistPage();
    if (document.getElementById('movie-genres')) {
        const mg = await apiCall('genres/movie/list'), tg = await apiCall('genres/tv/list');
        if(mg) document.getElementById('movie-genres').innerHTML = mg.map(g => `<span class="genre-tag" onclick="window.toggleGenre(${g.id}, this)">${g.name}</span>`).join('');
        if(tg) document.getElementById('tv-genres').innerHTML = tg.map(g => `<span class="genre-tag" onclick="window.toggleGenre(${g.id}, this)">${g.name}</span>`).join('');
        const yr = document.querySelector('.years-row');
        if(yr) { let yH=""; for(let y=2026; y>=1960; y--) yH += `<span class="year-tag" onclick="window.toggleYear('${y}', this)">${y}</span>`; yr.innerHTML = yH; }
    }

    document.addEventListener('click', (e) => {
        const sTrigger = e.target.closest('.search-box') || e.target.closest('.fa-search');
        const sM = document.getElementById('search-modal');
        if (sTrigger) { e.preventDefault(); if(sM) { sM.style.display = 'flex'; setTimeout(() => document.getElementById('instant-search-input').focus(), 100); } return; }
        if (e.target.closest('#close-search') || e.target === sM) { if(sM) sM.style.display = 'none'; return; }
        if (document.getElementById('profile-trigger')?.contains(e.target)) { document.getElementById('profile-menu').classList.toggle('show'); return; }
        if (document.getElementById('hamburger-menu')?.contains(e.target) || e.target.closest('#hamburger-menu')) { document.getElementById('mobile-nav').classList.toggle('active'); return; }
        if (e.target.id === 'logout-link') { localStorage.clear(); location.href = '/index.html'; }
    });

    // Aktyor səhifəsi yüklənəndə
    const actorGrid = document.getElementById('actor-movies-grid');
    if (actorGrid) {
        const pathParts = window.location.pathname.split('/');
        // URL-dən ID-ni götürürük: /actor/123/slug -> 123
        const actorId = pathParts[pathParts.indexOf('actor') + 1];
        
        if (actorId) {
            actorGrid.innerHTML = '<div class="spinner" style="grid-column: 1/-1; margin: 40px auto;"></div>';
            apiCall(`person/${actorId}/credits`).then(data => {
                if (data && data.cast) {
                    allActorCredits = data.cast; // Bütün filmləri dəyişənə yığırıq
                    window.loadActorPage(1); // İlk 18 filmi göstəririk
                } else {
                    actorGrid.innerHTML = '<p style="grid-column: 1/-1; text-align:center;">Məlumat tapılmadı.</p>';
                }
            });
        }
    }

    const detBox = document.getElementById('details-content');
    if (detBox) {
        // CLEAN URL OXUMA MƏNTİQİ
        const pathParts = window.location.pathname.split('/');
        let mType, mId;
        if (pathParts.includes('movie')) {
            mType = pathParts[pathParts.indexOf('movie') + 1];
            mId = pathParts[pathParts.indexOf('movie') + 2];
        } else {
            const p = new URLSearchParams(window.location.search);
            mType = p.get('type');
            mId = p.get('id');
        }

        
        
        if(mType && mId) {
            const m = await apiCall(`details/${mType}/${mId}`);
            if(m && m.success !== false) {
                apiCall(`views/increment/${mId}`, false, 'POST');
                const run = m.runtime || (m.episode_run_time ? m.episode_run_time[0] : 45);
                const name = escapeHTML(m.title || m.name);
                
                // SEO ÜÇÜN DİNAMİK META TEQLƏR
                document.title = `CineWave | ${name}`;
                let metaDesc = document.querySelector('meta[name="description"]');
                if (!metaDesc) { metaDesc = document.createElement('meta'); metaDesc.name = "description"; document.head.appendChild(metaDesc); }
                metaDesc.content = `${name} filmini CineWave-də HD keyfiyyətdə izləyin. ${m.overview ? m.overview.substring(0, 150) : ''}`;

                detBox.innerHTML = `
                    <section class="detail-hero">
                        <div class="detail-poster"><img src="${m.poster_path ? CONFIG.IMG+m.poster_path : ''}" alt="poster"></div>
                        <div class="detail-info">
                            <h1>${name}</h1>
                            <div style="margin-bottom:15px; display:flex; align-items:center; gap:15px; flex-wrap:wrap;">
                                <span class="imdb-tag">IMDb</span> ⭐ ${m.vote_average?.toFixed(1)} 
                                <span style="color:var(--gray);">| <i class="fas fa-clock"></i> ${formatRuntime(run)}</span>
                                <span style="color:var(--primary); font-weight:bold; background:rgba(255,77,0,0.1); padding:4px 10px; border-radius:10px;"><i class="fas fa-eye"></i> ${m.viewCount || 0} baxış</span>
                            </div>
                            <p>${escapeHTML(m.overview) || "Təsvir yoxdur."}</p>
                            <div class="featured-actions">
                                <button class="btn primary-btn" id="play-btn"><i class="fas fa-play"></i> İzlə</button>
                                <button class="btn secondary-btn" id="add-watchlist-btn"><i class="fas fa-plus"></i> Siyahıya əlavə et</button>
                            </div>
                            <h3 style="margin-top:20px;">Heyət</h3>
                            <div class="cast-row" style="display:flex; overflow-x:auto; gap:15px; padding:10px 0;">
                                ${m.cast?.slice(0,12).map(c => `
    <div onclick="location.href='/actor/${c.id}/${slugify(c.name)}'" 
         style="flex:0 0 80px; text-align:center; cursor:pointer;">
        <img src="${c.profile_path ? CONFIG.IMG+c.profile_path : 'https://via.placeholder.com/80'}" 
             style="width:70px; height:70px; border-radius:50%; object-fit:cover; border: 2px solid var(--primary);">
        <p style="font-size:10px; margin-top:5px; color:white;">${c.name}</p>
    </div>`).join('')}
                            </div>
                        </div>
                    </section>
                    <div id="player-container" class="player-container" style="display:none; margin-top:30px;">
                        <div class="iframe-wrapper"><iframe id="video-iframe" src="" allowfullscreen></iframe></div>
                        <div class="netflix-panel"><h3>Növbəti Bölüm</h3><h2 id="next-ep-title">Gözləyin...</h2><button class="next-btn" id="next-ep-go">İNDİ İZLƏ</button></div>
                    </div>
                    <div id="tv-controls" class="seasons-wrapper" style="display: ${mType === 'tv' ? 'block' : 'none'}"><div id="season-tabs" class="season-tabs"></div><div id="episode-grid" class="episode-grid"></div></div>
                    <h2 style="margin:30px 0 20px;">Oxşar Məzmunlar</h2><div class="movie-row" id="similar-grid"></div>`;

                renderItems('similar-grid', m.similar, mType);
                if (mType === 'tv') {
                    const loadEp = async (s) => {
                        const d = await apiCall(`details/tv/${mId}/season/${s}`);
                        if(d?.episodes) document.getElementById('episode-grid').innerHTML = d.episodes.map(e => `<div class="episode-card" onclick="window.playNow(${s}, ${e.episode_number}, ${run})"><h4>${e.episode_number}. Bölüm</h4></div>`).join('');
                    };
                    window.playNow = (s, e, r) => {
                        currentTVState.season = s; currentTVState.episode = e;
                        document.getElementById('video-iframe').src = `https://vidsrc.me/embed/tv/${mId}/${s}/${e}`;
                        document.getElementById('player-container').style.display = 'flex'; startNetflixTimer(r);
                    };
                    if(m.seasons) document.getElementById('season-tabs').innerHTML = m.seasons.filter(s => s.season_number > 0).map((s, idx) => `<button class="season-btn ${idx===0?'active':''}" onclick="window.changeSeason(this, ${s.season_number})">Sezon ${s.season_number}</button>`).join('');
                    window.changeSeason = (btn, n) => { document.querySelectorAll('.season-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); loadEp(n); };
                    loadEp(1);
                }
                document.getElementById('play-btn').onclick = () => { if(mType === 'movie') { document.getElementById('video-iframe').src = `https://vidsrc.me/embed/movie/${mId}`; document.getElementById('player-container').style.display = 'flex'; } else window.scrollTo({ top: document.getElementById('tv-controls').offsetTop - 100, behavior: 'smooth' }); };
                document.getElementById('add-watchlist-btn').onclick = () => window.addToWatchlist(m.id, name, m.poster_path, mType);
                document.getElementById('next-ep-go').onclick = () => window.playNow(currentTVState.season, currentTVState.episode + 1, run);
            }
        }
    }

    const lF = document.getElementById('login-form'), rF = document.getElementById('register-form');
    if(lF) lF.addEventListener('submit', async (e) => { e.preventDefault(); const res = await apiCall('auth/login', false, 'POST', { email: e.target.email.value, password: e.target.password.value }); if(res.success) { localStorage.setItem('cinewave_token', res.token); localStorage.setItem('cinewave_user', JSON.stringify(res.user)); location.href = '/index.html'; } });
    if(rF) rF.addEventListener('submit', async (e) => { e.preventDefault(); if(e.target.password.value !== e.target.confirmPassword.value) return showNotification("Şifrələr eyni deyil!", "error"); const res = await apiCall('auth/register', false, 'POST', { fullName: e.target.fullName.value, email: e.target.email.value, username: e.target.username.value, password: e.target.password.value }); if(res.success) { showNotification("Qeydiyyat uğurlu!", "success"); setTimeout(() => location.href = '/login.html', 1500); } });
});

// --- 9. WATCHLIST LOGİKASI ---
window.addToWatchlist = async (id, title, poster, type) => {
    const token = localStorage.getItem('cinewave_token');
    if(!token) return showNotification("Giriş edin!", "warning");
    const r = await apiCall('watchlist/add', true, 'POST', { id: Number(id), title, poster_path: poster, movie_type: type });
    if(r.success) showNotification(`"${title}" siyahıya əlavə edildi`, 'success');
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
    const cl = document.getElementById('clearAllBtn');
    if (cl) cl.onclick = async () => { if(confirm("Hamısı silinsin?")) { await apiCall('watchlist/clear', true, 'DELETE'); window.loadWatchlistPage(); } };
    if (!list || list.length === 0) { box.innerHTML = '<div class="empty-watchlist" style="grid-column:1/-1;"><p class="empty-message">Siyahınız boşdur.</p></div>'; return; }
    box.className = "movie-row";
    box.innerHTML = list.map(i => {
        const cleanURL = `/movie/${i.movie_type}/${i.id}/${slugify(i.title)}`;
        return `<div class="movie-item"><img src="${CONFIG.IMG + i.poster_path}" alt="${escapeHTML(i.title)}" onclick="location.href='${cleanURL}'"><div class="movie-info-overlay"><h3>${escapeHTML(i.title)}</h3><button class="remove-btn" onclick="window.removeFromWatchlist(event, '${i.id}', '${i.movie_type}')"><i class="fas fa-trash"></i> Sil</button></div></div>`;
    }).join('');
};

// Aktyor filmlərini 18-18 səhifələyən funksiya
window.loadActorPage = (page) => {
    const itemsPerPage = 18;
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    
    // Yaddaşdakı 100+ filmdən yalnız lazımi 18-ni kəsirik
    const pageItems = allActorCredits.slice(startIndex, endIndex);
    const totalPages = Math.ceil(allActorCredits.length / itemsPerPage);
    
    // Mövcud render funksiyalarını istifadə edirik
    renderItems('actor-movies-grid', pageItems);
    renderPagination('actor-movies-grid', page, totalPages, 'loadActorPage');
    
    // Səhifə dəyişəndə yuxarı sürüşdür (istifadəçi rahatlığı üçün)
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// --- 10. FILTR VƏ JANR LOGİKASI ---
window.toggleGenre = (id, el) => { const idx = filterState.genres.indexOf(id); if (idx > -1) { filterState.genres.splice(idx, 1); el.classList.remove('active'); } else { filterState.genres.push(id); el.classList.add('active'); } };
window.toggleYear = (y, el) => { document.querySelectorAll('.year-tag').forEach(t => t.classList.remove('active')); if(filterState.year === y) { filterState.year = ""; } else { filterState.year = y; el.classList.add('active'); } };
