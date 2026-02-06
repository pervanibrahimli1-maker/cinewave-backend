/**
 * CINEWAVE - FULL COMPATIBLE SCRIPT
 */

const CONFIG = {
    API_URL: 'https://cinewave-backend-hfrd.onrender.com/api',
    IMG_URL: 'https://image.tmdb.org/t/p/w500',
    ORIGINAL_IMG: 'https://image.tmdb.org/t/p/original',
    NO_POSTER: 'https://via.placeholder.com/500x750/0a0b10/ffffff?text=Poster+Tapılmadı',
    NO_USER: 'https://via.placeholder.com/150x150/16181f/ffffff?text=Şəkil+Yoxdur'
};

// ==================== 1. KOMMUNA FUNKSİYALAR ====================

async function fetchAPI(endpoint) {
    try {
        const response = await fetch(`${CONFIG.API_URL}/${endpoint}`);
        if (!response.ok) throw new Error('Server xətası');
        return await response.json();
    } catch (err) {
        console.error("Fetch Error:", err);
        return null;
    }
}

// Detallar səhifəsinə yönləndirmə
function goToDetails(id, type) {
    // Serverdə detallar /api/movie/:id və /api/tv/:id şəklindədir
    window.location.href = `movie-details.html?id=${id}&type=${type}`;
}

// Film/Serial kartı yaratmaq
function createMovieCard(item, type) {
    // Multi-search zamanı tip media_type-dan gəlir
    const finalType = type || item.media_type || (item.title ? 'movie' : 'tv');
    if (finalType === 'person') return ''; // Aktyorları kart kimi göstərmə

    const title = item.title || item.name;
    const date = item.release_date || item.first_air_date || '';
    const year = date ? date.substring(0, 4) : '';
    const rating = item.vote_average ? item.vote_average.toFixed(1) : '0.0';
    const poster = item.poster_path ? CONFIG.IMG_URL + item.poster_path : CONFIG.NO_POSTER;

    return `
        <div class="movie-item" onclick="goToDetails(${item.id}, '${finalType}')">
            <img src="${poster}" alt="${title}" loading="lazy">
            <div class="movie-info-overlay">
                <h3>${title}</h3>
                <div class="movie-meta">
                    <span class="imdb-tag">IMDb</span>
                    <span>⭐ ${rating}</span>
                    <span style="margin-left:auto">${year}</span>
                </div>
            </div>
        </div>
    `;
}

function renderGrid(containerId, data, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (data && data.results && data.results.length > 0) {
        container.innerHTML = data.results.map(item => createMovieCard(item, type)).join('');
    } else {
        container.innerHTML = `<p style="grid-column: 1/-1; text-align:center; padding: 50px; color: var(--gray);">Heç bir nəticə tapılmadı.</p>`;
    }
}

// ==================== 2. KATEQORİYA (GENRES) ====================

async function initGenres() {
    const mContainer = document.getElementById('movie-genres');
    const tContainer = document.getElementById('tv-genres');
    
    // Nəticə konteyneri yoxdursa yarat
    let resContainer = document.getElementById('genre-results');
    if (!resContainer && (mContainer || tContainer)) {
        resContainer = document.createElement('div');
        resContainer.id = 'genre-results';
        resContainer.className = 'movie-row';
        resContainer.style.marginTop = '40px';
        document.querySelector('.container').appendChild(resContainer);
    }

    const movieGenres = await fetchAPI('genres/movie');
    const tvGenres = await fetchAPI('genres/tv');

    if (mContainer && movieGenres) {
        mContainer.innerHTML = movieGenres.genres.map(g => 
            `<span class="genre-tag" onclick="filterByGenre(${g.id}, 'movie', '${g.name}')">${g.name}</span>`
        ).join('');
    }
    if (tContainer && tvGenres) {
        tContainer.innerHTML = tvGenres.genres.map(g => 
            `<span class="genre-tag" onclick="filterByGenre(${g.id}, 'tv', '${g.name}')">${g.name}</span>`
        ).join('');
    }
}

async function filterByGenre(id, type, name) {
    const resContainer = document.getElementById('genre-results');
    resContainer.innerHTML = `<div class="loading-placeholder" style="grid-column: 1/-1;"><div class="spinner"></div><p>${name} yüklənir...</p></div>`;
    
    // Yeni əlavə etdiyimiz discover endpoint-inə sorğu atır
    const data = await fetchAPI(`discover/${type}?with_genres=${id}`);
    renderGrid('genre-results', data, type);
    
    document.querySelectorAll('.genre-tag').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    window.scrollTo({ top: resContainer.offsetTop - 120, behavior: 'smooth' });
}

// ==================== 3. DETALLAR (MOVIE-DETAILS.HTML) ====================

async function loadMovieDetails() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const type = params.get('type'); // 'movie' və ya 'tv'

    if (!id || !type) return;

    // Server endpointləri: /api/movie/:id və ya /api/tv/:id
    const item = await fetchAPI(`${type}/${id}`);
    const credits = await fetchAPI(`${type}/${id}/credits`);
    const similar = await fetchAPI(`${type}/${id}/similar`);

    if (!item) return;

    const title = item.title || item.name;
    document.title = `CineWave - ${title}`;
    
    const detailsContainer = document.getElementById('details-content');
    if (!detailsContainer) return;

    detailsContainer.innerHTML = `
        <section class="detail-hero">
            <div class="detail-poster">
                <img src="${item.poster_path ? CONFIG.IMG_URL + item.poster_path : CONFIG.NO_POSTER}">
            </div>
            <div class="detail-info">
                <p class="featured-tag">${type.toUpperCase()}</p>
                <h1>${title}</h1>
                <div class="movie-meta" style="margin-bottom: 20px; display:flex; gap:15px; align-items:center;">
                    <span class="imdb-tag">IMDb</span>
                    <span style="color: #ffc107;">⭐ ${item.vote_average.toFixed(1)}</span>
                    <span>| ${item.release_date || item.first_air_date}</span>
                    <span>| ${item.runtime ? item.runtime + ' dəq' : (item.number_of_seasons ? item.number_of_seasons + ' Sezon' : '')}</span>
                </div>
                <div class="genre-list" style="margin-bottom: 20px;">
                    ${item.genres ? item.genres.map(g => `<span class="genre-tag" style="padding: 5px 12px; font-size: 0.8rem;">${g.name}</span>`).join('') : ''}
                </div>
                <p class="featured-description" style="line-height:1.8; color:#ccc; margin-bottom:30px;">${item.overview}</p>
                <div class="featured-actions">
                    <button class="btn primary-btn" onclick="window.open('https://vidsrc.to/embed/${type}/${id}', '_blank')">
                        <i class="fas fa-play"></i> İndi İzlə
                    </button>
                    <button class="btn secondary-btn" onclick="addToWatchlist('${title.replace(/'/g, "\\'")}')">
                        <i class="fas fa-plus"></i> Siyahıma əlavə et
                    </button>
                </div>
            </div>
        </section>

        <section class="movie-category" style="margin-top:50px;">
            <h2>Aktyor Heyəti</h2>
            <div class="cast-row" style="display:flex; gap:20px; overflow-x:auto; padding-bottom:15px;">
                ${credits && credits.cast ? credits.cast.slice(0, 10).map(c => `
                    <div style="flex:0 0 130px; text-align:center;">
                        <img src="${c.profile_path ? CONFIG.IMG_URL + c.profile_path : CONFIG.NO_USER}" style="width:110px; height:110px; border-radius:50%; object-fit:cover; border:2px solid var(--primary);">
                        <p style="font-size:0.9rem; margin-top:8px; font-weight:600;">${c.name}</p>
                    </div>
                `).join('') : '<p>Məlumat yoxdur.</p>'}
            </div>
        </section>

        <section class="movie-category" style="margin-top:50px;">
            <h2>Oxşar Məzmun</h2>
            <div class="movie-row" id="similar-grid"></div>
        </section>
    `;

    if (similar) renderGrid('similar-grid', similar, type);
}

// ==================== 4. AXTARIŞ (SEARCH.HTML) ====================

async function initSearchPage() {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('query');
    if (!query) return;

    const titleEl = document.getElementById('search-title');
    if (titleEl) titleEl.innerText = `"${query}" üçün axtarış nəticələri`;

    const data = await fetchAPI(`search?query=${encodeURIComponent(query)}`);
    // Multi-search olduğu üçün renderGrid daxilində type dinamik təyin olunacaq
    renderGrid('search-results', data); 
}

// ==================== 5. GLOBAL INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;

    // Axtarış Inputları
    const searchInputs = [document.getElementById('search-input'), document.getElementById('search-input-header')];
    searchInputs.forEach(input => {
        if(input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && input.value.trim()) {
                    window.location.href = `search.html?query=${encodeURIComponent(input.value.trim())}`;
                }
            });
        }
    });

    // Routing Logic
    if (path.includes('movie-details.html')) {
        loadMovieDetails();
    } else if (path.includes('genres.html')) {
        initGenres();
    } else if (path.includes('search.html')) {
        initSearchPage();
    } else if (path.includes('index.html') || path === '/') {
        // Populyar filmlər üçün /api/movies/popular (cəm)
        fetchAPI('movies/popular').then(data => {
            if(data && data.results[0]) {
                const h = data.results[0];
                document.getElementById('featured-title').innerText = h.title;
                document.getElementById('featured-desc').innerText = h.overview.substring(0, 150) + "...";
                document.getElementById('featured-img').src = CONFIG.ORIGINAL_IMG + h.backdrop_path;
                document.getElementById('hero-play-btn').onclick = () => goToDetails(h.id, 'movie');
            }
            renderGrid('popular-movies', data, 'movie');
        });
        fetchAPI('movies/now_playing').then(data => renderGrid('new-releases', data, 'movie'));
    } else if (path.includes('movies.html')) {
        fetchAPI('movies/popular').then(data => renderGrid('movies-popular-grid', data, 'movie'));
        fetchAPI('movies/top_rated').then(data => renderGrid('movies-top-grid', data, 'movie'));
    } else if (path.includes('series.html')) {
        // Seriallar üçün /api/tv/popular
        fetchAPI('tv/popular').then(data => renderGrid('series-popular-grid', data, 'tv'));
        fetchAPI('tv/on_the_air').then(data => renderGrid('series-on-air-grid', data, 'tv'));
    }

    // Mobil Menyu
    const hamburger = document.getElementById('hamburger-menu');
    const mobileNav = document.getElementById('mobile-nav');
    if (hamburger) hamburger.onclick = () => mobileNav.classList.toggle('active');
});

function addToWatchlist(title) {
    let list = JSON.parse(localStorage.getItem('cinewave_watchlist') || '[]');
    if(!list.includes(title)) {
        list.push(title);
        localStorage.setItem('cinewave_watchlist', JSON.stringify(list));
        alert('Siyahıya əlavə edildi!');
    }
}
