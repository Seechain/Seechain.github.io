const CHANNELS_API = 'canales.json';

const FILTERS = {
    general: 'Generales',
    news: 'Noticias',
    music: 'Radios',
    culture: 'Cultura',
    entertainment: 'Entretención',
    sports: 'Deportes',
    kids: 'Niños',

};



let allChannels = [];
let currentFilter = 'general';
let player = null;
let hls = null;
let audioPlayer = null;

function getStreamType(url) {
    if (!url) return 'unknown';
    if (url.match(/\.m3u8(\?|$)/)) return 'hls';
    if (url.match(/\.m3u(\?|$)/)) return 'm3u-playlist';
    if (url.match(/\.(aac|mp3|ogg|opus|flac)(\?|$)/)) return 'audio';
    if (url.match(/\.pls(\?|$)/)) return 'pls-playlist';
    return 'audio';
}

async function parsePlaylist(url) {
    try {
        const response = await fetch(url);
        const text = await response.text();
        const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
        return lines.length > 0 ? lines[0] : null;
    } catch (e) {
        console.error('Error parsing playlist:', e);
        return null;
    }
}

async function resolveStreamUrl(url) {
    const type = getStreamType(url);
    if (type === 'm3u-playlist' || type === 'pls-playlist') {
        return await parsePlaylist(url);
    }
    return url;
}

async function loadChannels() {
    try {
        const response = await fetch(CHANNELS_API);
        const data = await response.json();
        allChannels = Object.entries(data)
            .filter(([key, channel]) => channel.país === 'cl')
            .map(([key, channel]) => ({ key, ...channel }));
        renderChannels();
        renderFilters();
    } catch (error) {
        console.error('Error loading channels:', error);
        document.getElementById('channelsGrid').innerHTML = '<p class="error">Error al cargar canales</p>';
    }
}

function renderFilters() {
    const filtersContainer = document.getElementById('filters');
    filtersContainer.innerHTML = Object.entries(FILTERS).map(([key, label]) => `
        <button class="filter-btn ${key === currentFilter ? 'active' : ''}" data-filter="${key}">
            ${label}
        </button>
    `).join('');

    filtersContainer.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentFilter = btn.dataset.filter;
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderChannels();
        });
    });
}

function renderChannels() {
    const container = document.getElementById('channelsGrid');
    let filtered;
    
    if (currentFilter === 'general') {
        filtered = allChannels.filter(ch => 
            ch.categoría === 'general'
        );
    } else {
        filtered = allChannels.filter(ch => 
            ch.categoría === currentFilter
        );
    }

    container.innerHTML = filtered.map(channel => {
        const hasStream = channel.señales?.m3u8_url?.length > 0;
        
        return `
            <div class="channel-card" data-key="${channel.key}">
                ${hasStream ? '<div class="live-indicator">EN VIVO</div>' : ''}
                <img src="${channel.logo || 'https://via.placeholder.com/150?text=TV'}" 
                     alt="${channel.nombre}" 
                     class="channel-logo" 
                     onerror="this.src='https://via.placeholder.com/150?text=${encodeURIComponent(channel.nombre)}'">
                <h2>${channel.nombre}</h2>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.channel-card').forEach(card => {
        card.addEventListener('click', () => {
            const key = card.dataset.key;
            const channel = allChannels.find(ch => ch.key === key);
            if (channel) openChannel(channel);
        });
    });
}

function initPlayer() {
    const video = document.getElementById('videoPlayer');
    if (player) return;
    
    player = new Plyr(video, {
        controls: ['play-large', 'play', 'volume', 'settings', 'fullscreen'],
        settings: ['quality', 'speed'],
        speed: {
            selected: 1,
            options: [0.5, 0.75, 1, 1.25, 1.5]
        },
        tooltips: {
            controls: true,
            seek: true
        },
        keyboard: {
            focused: true,
            global: false
        }
    });
}

function openChannel(channel) {
    const modal = document.getElementById('playerModal');
    const modalTitle = document.getElementById('modalTitle');
    const video = document.getElementById('videoPlayer');
    const statusText = document.getElementById('statusText');

    modalTitle.textContent = channel.nombre;
    modal.style.display = 'flex';
    statusText.textContent = 'Cargando...';

    initPlayer();

    if (hls) {
        hls.destroy();
        hls = null;
    }

    let streamUrl = null;
    let streamSource = null;

    if (channel.señales?.m3u8_url?.length > 0) {
        streamUrl = channel.señales.m3u8_url[0];
        streamSource = 'm3u8';
    } else if (channel.señales?.iframe_url?.length > 0) {
        streamUrl = channel.señales.iframe_url[0];
        streamSource = 'iframe';
    }

    if (streamUrl) {
        const type = getStreamType(streamUrl);
        if (type === 'hls') {
            playStream(streamUrl, 'video');
        } else if (type === 'm3u-playlist' || type === 'pls-playlist') {
            statusText.textContent = 'Cargando lista...';
            resolveStreamUrl(streamUrl).then(resolved => {
                if (resolved) {
                    const resolvedType = getStreamType(resolved);
                    playStream(resolved, resolvedType === 'audio' ? 'audio' : 'video');
                } else {
                    statusText.textContent = 'Error al leer la lista';
                }
            });
        } else if (type === 'audio') {
            playStream(streamUrl, 'audio');
        } else if (streamSource === 'iframe') {
            statusText.textContent = 'Abriendo en sitio oficial...';
            setTimeout(() => {
                window.open(streamUrl, '_blank');
                closePlayer();
            }, 1000);
        }
    } else if (channel.señales?.yt_id) {
        statusText.textContent = 'Abriendo YouTube...';
        setTimeout(() => {
            window.open(`https://www.youtube.com/watch?v=${channel.señales.yt_id}`, '_blank');
            closePlayer();
        }, 1000);
    } else if (channel.sitio_oficial) {
        statusText.textContent = 'Abriendo sitio oficial...';
        setTimeout(() => {
            window.open(channel.sitio_oficial, '_blank');
            closePlayer();
        }, 1000);
    } else {
        statusText.textContent = 'Sin seal disponible';
    }
}

function playStream(url, type = 'video') {
    const video = document.getElementById('videoPlayer');
    const audio = document.getElementById('audioPlayer');
    const statusText = document.getElementById('statusText');

    video.style.display = type === 'video' ? 'block' : 'none';
    audio.style.display = type === 'audio' ? 'block' : 'none';

    if (type === 'audio') {
        audio.src = url;
        audio.play().catch(() => {
            statusText.textContent = 'Click para reproducir audio';
        });
        statusText.textContent = 'En vivo (audio)';
        return;
    }

    if (Hls.isSupported()) {
        hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 90,
            maxBufferLength: 40,
            maxMaxBufferLength: 180,
            maxBufferSize: 80 * 1000 * 1000,
            maxBufferHole: 0.5,
            capLevelToPlayerSize: true,
            autoLevelEnabled: true,
            startLevel: 2
        });

        hls.loadSource(url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
            const levels = data.levels;
            if (levels.length > 2) {
                hls.startLevel = 2;
            }

            if (player && levels.length > 0) {
                const qualityOptions = levels.map((level, index) => ({
                    id: index,
                    label: level.height ? `${level.height}p` : `${level.bitrate / 1000}kbps`
                }));
                
                qualityOptions.unshift({ id: -1, label: 'Auto' });

                player.quality = {
                    default: -1,
                    options: qualityOptions,
                    forced: true
                };

                player.on('qualitychange', (event) => {
                    const quality = event.detail.qualities[player.quality.selected];
                    if (quality && quality.id >= 0) {
                        hls.currentLevel = quality.id;
                    } else {
                        hls.currentLevel = -1;
                    }
                });
            }

            video.play().catch(() => {
                statusText.textContent = 'Click para reproducir';
            });
            statusText.textContent = 'En vivo';
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, () => {
            statusText.textContent = 'En vivo';
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                statusText.textContent = 'Error, reintentando...';
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    setTimeout(() => hls.startLoad(), 3000);
                } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    hls.recoverMediaError();
                }
            }
        });

        statusText.textContent = 'Conectando...';

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.play().catch(() => {});
        statusText.textContent = 'En vivo';
    } else {
        statusText.textContent = 'Navegador no compatible';
    }
}

function closePlayer() {
    const modal = document.getElementById('playerModal');
    const video = document.getElementById('videoPlayer');
    const audio = document.getElementById('audioPlayer');

    modal.style.display = 'none';

    if (hls) {
        hls.destroy();
        hls = null;
    }

    if (player) {
        player.pause();
    }

    video.pause();
    video.src = '';
    video.style.display = 'block';

    audio.pause();
    audio.src = '';
    audio.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    loadChannels();

    document.getElementById('closeBtn').addEventListener('click', closePlayer);
    document.getElementById('playerModal').addEventListener('click', (e) => {
        if (e.target.id === 'playerModal') closePlayer();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePlayer();
    });
});
