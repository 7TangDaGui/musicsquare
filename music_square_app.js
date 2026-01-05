// 音乐广场 - 完整前端应用
// 文件名：music_square_app.js
// 基于现有皮卡丘音乐站进行功能增强

const API_BASE_URL = 'https://yunduanyingyue.tmichi1001.workers.dev';

class MusicSquareApp {
    constructor() {
        this.state = {
            // 用户状态
            user: null,
            token: localStorage.getItem('auth_token'),
            
            // 音乐源状态
            currentSource: 'netease',
            enabledSources: { netease: true, qq: false, migu: false, kuwo: false },
            multiSourceEnabled: false,
            
            // 搜索状态
            searchKeyword: '',
            searchResults: [],
            currentPage: 1,
            pageSize: 20,
            totalResults: 0,
            
            // 播放状态
            currentTrack: null,
            isPlaying: false,
            currentTime: 0,
            duration: 0,
            volume: 0.7,
            isMuted: false,
            playMode: 'list', // list, single, shuffle
            
            // 收藏和歌单
            favorites: [],
            playlists: [],
            currentPlaylist: null,
            
            // 同步平台
            syncPlatforms: [],
            
            // 主题
            theme: localStorage.getItem('theme') || 'dark'
        };
        
        this.init();
    }
    
    async init() {
        await this.checkAuth();
        this.setupEventListeners();
        this.loadHotSearches();
        this.initTheme();
        this.updateUserUI();
        this.loadPlaylists();
        this.loadFavorites();
        this.testAllSources();
    }
    
    // ============ API 请求工具 ============
    async apiRequest(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        if (this.state.token) {
            headers['Authorization'] = `Bearer ${this.state.token}`;
        }
        
        try {
            const response = await fetch(url, {
                ...options,
                headers
            });
            
            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API请求错误:', error);
            this.showToast('网络请求失败', 'error');
            throw error;
        }
    }
    
    // ============ 用户认证 ============
    async checkAuth() {
        if (!this.state.token) {
            this.state.user = null;
            return false;
        }
        
        try {
            const data = await this.apiRequest('/api/auth/me');
            if (data.success) {
                this.state.user = data.user;
                return true;
            }
        } catch (error) {
            this.state.user = null;
            this.state.token = null;
            localStorage.removeItem('auth_token');
        }
        
        return false;
    }
    
    async login(username, password) {
        try {
            const data = await this.apiRequest('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
            
            if (data.success) {
                this.state.user = data.user;
                this.state.token = data.token;
                localStorage.setItem('auth_token', data.token);
                this.updateUserUI();
                this.showToast('登录成功', 'success');
                return true;
            }
        } catch (error) {
            this.showToast('登录失败，请检查用户名和密码', 'error');
        }
        return false;
    }
    
    async register(username, password) {
        try {
            const data = await this.apiRequest('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
            
            if (data.success) {
                this.state.user = data.user;
                this.state.token = data.token;
                localStorage.setItem('auth_token', data.token);
                this.updateUserUI();
                this.showToast('注册成功', 'success');
                return true;
            }
        } catch (error) {
            this.showToast('注册失败，用户名可能已存在', 'error');
        }
        return false;
    }
    
    logout() {
        this.showConfirm('确认退出', '确定要退出登录吗？', () => {
            this.state.user = null;
            this.state.token = null;
            localStorage.removeItem('auth_token');
            this.updateUserUI();
            this.showToast('已退出登录', 'info');
        });
    }
    
    updateUserUI() {
        const avatarDefault = document.querySelector('.avatar-default');
        if (!avatarDefault) return;
        
        if (this.state.user) {
            if (this.state.user.avatar_url) {
                avatarDefault.innerHTML = `<img src="${this.state.user.avatar_url}" class="avatar-img" alt="${this.state.user.username}">`;
            } else {
                avatarDefault.textContent = this.state.user.username.charAt(0).toUpperCase();
            }
        } else {
            avatarDefault.textContent = '未';
        }
    }
    
    // ============ 主题切换 ============
    initTheme() {
        document.body.setAttribute('data-theme', this.state.theme);
        const icon = document.getElementById('theme-toggle')?.querySelector('i');
        if (icon) {
            icon.className = this.state.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }
    
    toggleTheme() {
        this.state.theme = this.state.theme === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', this.state.theme);
        localStorage.setItem('theme', this.state.theme);
        this.initTheme();
    }
    
    // ============ 音乐源管理 ============
    async testAllSources() {
        const sources = ['netease', 'qq', 'migu', 'kuwo'];
        try {
            const data = await this.apiRequest('/api/sources/test', {
                method: 'POST',
                body: JSON.stringify({ sources })
            });
            
            if (data.success) {
                data.test_results.forEach(result => {
                    if (result.status !== 'available') {
                        const btn = document.querySelector(`.source-btn[data-source="${result.source}"]`);
                        if (btn) {
                            btn.classList.add('disabled');
                            btn.disabled = true;
                            this.showToast(`${this.getSourceName(result.source)}暂时不可用`, 'warning');
                        }
                    }
                });
            }
        } catch (error) {
            console.error('测试音乐源失败:', error);
        }
    }
    
    getSourceName(source) {
        const names = {
            netease: '网易云音乐',
            qq: 'QQ音乐',
            migu: '咪咕音乐',
            kuwo: '酷我音乐'
        };
        return names[source] || source;
    }
    
    // ============ 热门搜索 ============
    async loadHotSearches() {
        try {
            const data = await this.apiRequest('/api/search/hot');
            if (data.success) {
                const hotTags = document.getElementById('hot-tags');
                if (hotTags) {
                    hotTags.innerHTML = data.hot_searches.map(item => `
                        <div class="hot-tag" data-keyword="${item.keyword}">
                            ${item.keyword}
                        </div>
                    `).join('');
                    
                    document.querySelectorAll('.hot-tag').forEach(tag => {
                        tag.addEventListener('click', () => {
                            const keyword = tag.dataset.keyword;
                            document.getElementById('search-input').value = keyword;
                            this.searchMusic(keyword);
                        });
                    });
                }
            }
        } catch (error) {
            console.error('加载热门搜索失败:', error);
        }
    }
    
    // ============ 搜索功能 ============
    async searchMusic(keyword, page = 1) {
        if (!keyword.trim()) {
            this.showToast('请输入搜索关键词', 'warning');
            return;
        }
        
        this.state.searchKeyword = keyword;
        this.state.currentPage = page;
        
        this.showToast('搜索中...', 'info');
        
        try {
            let allResults = [];
            
            if (this.state.multiSourceEnabled) {
                const sources = Object.keys(this.state.enabledSources).filter(s => this.state.enabledSources[s]);
                const promises = sources.map(source => 
                    this.apiRequest(`/api/music/search?keyword=${encodeURIComponent(keyword)}&source=${source}&page=${page}&limit=${this.state.pageSize}`)
                );
                
                const results = await Promise.allSettled(promises);
                
                results.forEach((result, index) => {
                    if (result.status === 'fulfilled' && result.value.success) {
                        allResults = allResults.concat(result.value.tracks);
                    }
                });
            } else {
                const data = await this.apiRequest(
                    `/api/music/search?keyword=${encodeURIComponent(keyword)}&source=${this.state.currentSource}&page=${page}&limit=${this.state.pageSize}`
                );
                if (data.success) {
                    allResults = data.tracks;
                    this.state.totalResults = data.total;
                }
            }
            
            this.state.searchResults = allResults;
            this.renderSearchResults();
            this.showToast(`找到 ${allResults.length} 个结果`, 'success');
            
            // 保存搜索历史
            if (this.state.user) {
                try {
                    await this.apiRequest('/api/search/history', {
                        method: 'POST',
                        body: JSON.stringify({
                            keyword,
                            source: this.state.multiSourceEnabled ? 'multi' : this.state.currentSource
                        })
                    });
                } catch (error) {
                    console.error('保存搜索历史失败:', error);
                }
            }
        } catch (error) {
            console.error('搜索失败:', error);
            this.showToast('搜索失败，请稍后重试', 'error');
        }
    }
    
    renderSearchResults() {
        const resultsGrid = document.getElementById('results-grid');
        if (!resultsGrid) return;
        
        if (this.state.searchResults.length === 0) {
            resultsGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <h3>没有找到相关结果</h3>
                    <p>尝试搜索其他关键词</p>
                </div>
            `;
            return;
        }
        
        resultsGrid.innerHTML = this.state.searchResults.map((track, index) => `
            <div class="song-card ${this.state.currentTrack && this.state.currentTrack.uid === track.uid ? 'playing' : ''}" data-index="${index}">
                <div class="song-header">
                    <div>
                        <div class="song-title">${track.title || '未知歌曲'}</div>
                        <div class="song-artist">${track.artist || '未知歌手'}</div>
                        <div class="song-source">
                            <i class="fas fa-${track.source === 'netease' ? 'cloud' : track.source === 'qq' ? 'qq' : 'music'}"></i>
                            ${this.getSourceName(track.source)}
                        </div>
                    </div>
                    <div class="song-actions">
                        <button class="action-btn play-btn" data-index="${index}" title="播放">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="action-btn favorite-btn ${this.isFavorite(track.uid) ? 'active' : ''}" data-track-id="${track.uid}" title="${this.isFavorite(track.uid) ? '取消收藏' : '收藏'}">
                            <i class="${this.isFavorite(track.uid) ? 'fas' : 'far'} fa-heart"></i>
                        </button>
                        <button class="action-btn add-btn" data-track-id="${track.uid}" title="添加到歌单">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="action-btn next-btn" data-track-id="${track.uid}" title="下一首播放">
                            <i class="fas fa-forward"></i>
                        </button>
                    </div>
                </div>
                <div class="song-footer">
                    <div class="song-quality">${track.quality === 'lossless' ? '无损' : '标准'}</div>
                    <div class="song-duration">-:--</div>
                </div>
            </div>
        `).join('');
        
        // 添加事件监听器
        resultsGrid.querySelectorAll('.play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.playTrack(index);
            });
        });
        
        resultsGrid.querySelectorAll('.favorite-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const trackId = btn.dataset.trackId;
                this.toggleFavorite(trackId);
            });
        });
        
        resultsGrid.querySelectorAll('.add-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const trackId = btn.dataset.trackId;
                this.showAddToPlaylistModal(trackId);
            });
        });
        
        resultsGrid.querySelectorAll('.next-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const trackId = btn.dataset.trackId;
                this.addToNextPlay(trackId);
            });
        });
        
        // 更新分页
        this.updatePagination();
    }
    
    updatePagination() {
        const pagination = document.getElementById('pagination');
        if (!pagination) return;
        
        const totalPages = Math.ceil(this.state.totalResults / this.state.pageSize);
        
        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }
        
        pagination.innerHTML = `
            <button class="page-btn" id="prev-page" ${this.state.currentPage <= 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
            <span class="page-info">第 ${this.state.currentPage} 页 / 共 ${totalPages} 页</span>
            <button class="page-btn" id="next-page" ${this.state.currentPage >= totalPages ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        `;
        
        document.getElementById('prev-page')?.addEventListener('click', () => {
            if (this.state.currentPage > 1) {
                this.searchMusic(this.state.searchKeyword, this.state.currentPage - 1);
            }
        });
        
        document.getElementById('next-page')?.addEventListener('click', () => {
            if (this.state.currentPage < totalPages) {
                this.searchMusic(this.state.searchKeyword, this.state.currentPage + 1);
            }
        });
    }    // ============ 播放器功能 ============
    playTrack(index) {
        const track = this.state.searchResults[index];
        if (!track) return;
        
        this.state.currentTrack = track;
        this.updatePlayerUI();
        
        // 更新当前播放歌曲显示
        const nowPlayingTitle = document.getElementById('now-playing-title');
        const nowPlayingArtist = document.getElementById('now-playing-artist');
        if (nowPlayingTitle) nowPlayingTitle.textContent = track.title;
        if (nowPlayingArtist) nowPlayingArtist.textContent = track.artist;
        
        this.showToast(`开始播放: ${track.title}`, 'info');
    }
    
    updatePlayerUI() {
        const playBtn = document.getElementById('play-btn');
        if (!playBtn) return;
        
        const icon = playBtn.querySelector('i');
        icon.className = this.state.isPlaying ? 'fas fa-pause' : 'fas fa-play';
    }
    
    togglePlayPause() {
        this.state.isPlaying = !this.state.isPlaying;
        this.updatePlayerUI();
        
        if (this.state.isPlaying) {
            this.showToast('播放', 'info');
        } else {
            this.showToast('暂停', 'info');
        }
    }
    
    // ============ 收藏功能 ============
    async loadFavorites() {
        if (!this.state.user) return;
        
        try {
            const data = await this.apiRequest('/api/favorites');
            if (data.success) {
                this.state.favorites = data.favorites || [];
            }
        } catch (error) {
            console.error('加载收藏失败:', error);
        }
    }
    
    isFavorite(trackId) {
        return this.state.favorites.some(fav => fav.track_id === trackId);
    }
    
    async toggleFavorite(trackId) {
        if (!this.state.user) {
            this.showLoginModal();
            return;
        }
        
        const track = this.state.searchResults.find(t => t.uid === trackId);
        if (!track) return;
        
        try {
            if (this.isFavorite(trackId)) {
                // 移除收藏
                await this.apiRequest(`/api/favorites/${trackId}`, {
                    method: 'DELETE'
                });
                this.state.favorites = this.state.favorites.filter(fav => fav.track_id !== trackId);
                this.showToast('已取消收藏', 'info');
            } else {
                // 添加收藏
                await this.apiRequest('/api/favorites', {
                    method: 'POST',
                    body: JSON.stringify({
                        track_id: trackId,
                        title: track.title,
                        artist: track.artist,
                        source: track.source
                    })
                });
                this.state.favorites.push({
                    track_id: trackId,
                    title: track.title,
                    artist: track.artist,
                    source: track.source
                });
                this.showToast('已添加到收藏', 'success');
            }
            
            // 更新UI
            this.renderSearchResults();
        } catch (error) {
            console.error('收藏操作失败:', error);
            this.showToast('操作失败，请稍后重试', 'error');
        }
    }
    
    // ============ 歌单功能 ============
    async loadPlaylists() {
        if (!this.state.user) return;
        
        try {
            const data = await this.apiRequest('/api/playlists');
            if (data.success) {
                this.state.playlists = data.playlists || [];
                this.renderPlaylists();
            }
        } catch (error) {
            console.error('加载歌单失败:', error);
        }
    }
    
    renderPlaylists() {
        const playlistsContainer = document.getElementById('playlists-container');
        if (!playlistsContainer) return;
        
        if (this.state.playlists.length === 0) {
            playlistsContainer.innerHTML = `
                <div class="empty-playlists">
                    <i class="fas fa-folder-open"></i>
                    <p>暂无歌单，点击"新建歌单"创建</p>
                </div>
            `;
            return;
        }
        
        playlistsContainer.innerHTML = this.state.playlists.map(playlist => `
            <div class="playlist-folder ${this.state.currentPlaylist === playlist.id ? 'active' : ''}" data-playlist-id="${playlist.id}">
                <i class="fas fa-folder"></i>
                <span class="playlist-name">${playlist.name}</span>
                <div class="playlist-actions">
                    <button class="playlist-action-btn rename-btn" data-playlist-id="${playlist.id}" title="重命名">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="playlist-action-btn delete-btn" data-playlist-id="${playlist.id}" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        // 添加事件监听器
        playlistsContainer.querySelectorAll('.playlist-folder').forEach(folder => {
            folder.addEventListener('click', (e) => {
                if (!e.target.closest('.playlist-action-btn')) {
                    const playlistId = folder.dataset.playlistId;
                    this.selectPlaylist(playlistId);
                }
            });
        });
        
        playlistsContainer.querySelectorAll('.rename-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const playlistId = btn.dataset.playlistId;
                this.renamePlaylist(playlistId);
            });
        });
        
        playlistsContainer.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const playlistId = btn.dataset.playlistId;
                this.deletePlaylist(playlistId);
            });
        });
    }
    
    async createPlaylist(name) {
        if (!this.state.user) {
            this.showLoginModal();
            return;
        }
        
        if (!name.trim()) {
            this.showToast('请输入歌单名称', 'warning');
            return;
        }
        
        try {
            const data = await this.apiRequest('/api/playlists', {
                method: 'POST',
                body: JSON.stringify({ name })
            });
            
            if (data.success) {
                this.state.playlists.push(data.playlist);
                this.renderPlaylists();
                this.showToast('歌单创建成功', 'success');
                return true;
            }
        } catch (error) {
            console.error('创建歌单失败:', error);
            this.showToast('创建歌单失败', 'error');
        }
        return false;
    }
    
    async renamePlaylist(playlistId) {
        const playlist = this.state.playlists.find(p => p.id === playlistId);
        if (!playlist) return;
        
        const newName = prompt('请输入新的歌单名称:', playlist.name);
        if (!newName || newName.trim() === playlist.name) return;
        
        try {
            const data = await this.apiRequest(`/api/playlists/${playlistId}`, {
                method: 'PUT',
                body: JSON.stringify({ name: newName.trim() })
            });
            
            if (data.success) {
                playlist.name = newName.trim();
                this.renderPlaylists();
                this.showToast('歌单重命名成功', 'success');
            }
        } catch (error) {
            console.error('重命名歌单失败:', error);
            this.showToast('重命名失败', 'error');
        }
    }
    
    async deletePlaylist(playlistId) {
        if (!confirm('确定要删除这个歌单吗？')) return;
        
        try {
            const data = await this.apiRequest(`/api/playlists/${playlistId}`, {
                method: 'DELETE'
            });
            
            if (data.success) {
                this.state.playlists = this.state.playlists.filter(p => p.id !== playlistId);
                if (this.state.currentPlaylist === playlistId) {
                    this.state.currentPlaylist = null;
                }
                this.renderPlaylists();
                this.showToast('歌单删除成功', 'success');
            }
        } catch (error) {
            console.error('删除歌单失败:', error);
            this.showToast('删除失败', 'error');
        }
    }
    
    selectPlaylist(playlistId) {
        this.state.currentPlaylist = playlistId;
        this.renderPlaylists();
        this.loadPlaylistTracks(playlistId);
    }
    
    async loadPlaylistTracks(playlistId) {
        try {
            const data = await this.apiRequest(`/api/playlists/${playlistId}/tracks`);
            if (data.success) {
                // 显示歌单中的歌曲
                this.showToast(`加载歌单歌曲: ${data.tracks.length} 首`, 'info');
            }
        } catch (error) {
            console.error('加载歌单歌曲失败:', error);
        }
    }
    
    async addToPlaylist(playlistId, trackId) {
        const track = this.state.searchResults.find(t => t.uid === trackId);
        if (!track) return;
        
        try {
            const data = await this.apiRequest(`/api/playlists/${playlistId}/tracks`, {
                method: 'POST',
                body: JSON.stringify({
                    track_id: trackId,
                    title: track.title,
                    artist: track.artist,
                    source: track.source
                })
            });
            
            if (data.success) {
                this.showToast('已添加到歌单', 'success');
                return true;
            }
        } catch (error) {
            console.error('添加到歌单失败:', error);
            this.showToast('添加到歌单失败', 'error');
        }
        return false;
    }
    
    showAddToPlaylistModal(trackId) {
        if (!this.state.user) {
            this.showLoginModal();
            return;
        }
        
        const modal = document.getElementById('add-to-playlist-modal');
        if (!modal) return;
        
        // 更新歌单列表
        const playlistList = modal.querySelector('.playlist-list');
        playlistList.innerHTML = this.state.playlists.map(playlist => `
            <div class="playlist-option" data-playlist-id="${playlist.id}">
                <i class="fas fa-folder"></i>
                <span>${playlist.name}</span>
            </div>
        `).join('');
        
        // 添加事件监听器
        playlistList.querySelectorAll('.playlist-option').forEach(option => {
            option.addEventListener('click', () => {
                const playlistId = option.dataset.playlistId;
                this.addToPlaylist(playlistId, trackId);
                modal.style.display = 'none';
            });
        });
        
        modal.style.display = 'block';
    }
    
    // ============ 同步平台功能 ============
    async loadSyncPlatforms() {
        if (!this.state.user) return;
        
        try {
            const data = await this.apiRequest('/api/sync/platforms');
            if (data.success) {
                this.state.syncPlatforms = data.platforms || [];
                this.renderSyncPlatforms();
            }
        } catch (error) {
            console.error('加载同步平台失败:', error);
        }
    }
    
    renderSyncPlatforms() {
        const syncContainer = document.getElementById('sync-platforms');
        if (!syncContainer) return;
        
        syncContainer.innerHTML = this.state.syncPlatforms.map(platform => `
            <div class="sync-platform ${platform.synced ? 'synced' : ''}" data-platform="${platform.name}">
                <div class="platform-info">
                    <i class="fab fa-${platform.name === 'qq' ? 'qq' : 'netease' === 'netease' ? 'cloud' : 'music'}"></i>
                    <span>${platform.name === 'qq' ? 'QQ音乐' : '网易云音乐'}</span>
                </div>
                <button class="sync-btn ${platform.synced ? 'synced' : ''}" data-platform="${platform.name}">
                    ${platform.synced ? '已同步' : '同步'}
                </button>
            </div>
        `).join('');
        
        // 添加事件监听器
        syncContainer.querySelectorAll('.sync-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const platform = btn.dataset.platform;
                this.syncPlatform(platform);
            });
        });
    }
    
    async syncPlatform(platform) {
        if (!this.state.user) {
            this.showLoginModal();
            return;
        }
        
        this.showToast(`正在同步${platform === 'qq' ? 'QQ音乐' : '网易云音乐'}...`, 'info');
        
        try {
            const data = await this.apiRequest('/api/sync/sync', {
                method: 'POST',
                body: JSON.stringify({ platform })
            });
            
            if (data.success) {
                this.showToast('同步成功', 'success');
                this.loadSyncPlatforms();
                this.loadFavorites();
                this.loadPlaylists();
            }
        } catch (error) {
            console.error('同步失败:', error);
            this.showToast('同步失败，请检查登录状态', 'error');
        }
    }    // ============ UI 工具函数 ============
    setupEventListeners() {
        // 搜索框事件
        const searchInput = document.getElementById('search-input');
        const searchBtn = document.getElementById('search-btn');
        
        if (searchInput && searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.searchMusic(searchInput.value);
            });
            
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchMusic(searchInput.value);
                }
            });
        }
        
        // 音乐源按钮事件
        document.querySelectorAll('.source-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const source = btn.dataset.source;
                if (!btn.disabled) {
                    this.toggleSource(source);
                }
            });
        });
        
        // 多源搜索切换
        const multiSourceToggle = document.getElementById('multi-source-toggle');
        if (multiSourceToggle) {
            multiSourceToggle.addEventListener('change', (e) => {
                this.state.multiSourceEnabled = e.target.checked;
                this.updateSourceUI();
            });
        }
        
        // 主题切换
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                this.toggleTheme();
            });
        }
        
        // 用户头像点击事件
        const avatarBtn = document.querySelector('.avatar-btn');
        if (avatarBtn) {
            avatarBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleUserDropdown();
            });
        }
        
        // 点击其他地方关闭下拉菜单
        document.addEventListener('click', () => {
            this.hideUserDropdown();
        });
        
        // 播放控制事件
        const playBtn = document.getElementById('play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                this.togglePlayPause();
            });
        }
        
        // 播放模式切换
        const playModeBtns = document.querySelectorAll('.playmode-btn');
        playModeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.state.playMode = btn.dataset.mode;
                this.updatePlayModeUI();
                this.showToast(`播放模式: ${this.getPlayModeName(this.state.playMode)}`, 'info');
            });
        });
        
        // 新建歌单按钮
        const newPlaylistBtn = document.getElementById('new-playlist-btn');
        if (newPlaylistBtn) {
            newPlaylistBtn.addEventListener('click', () => {
                this.showNewPlaylistModal();
            });
        }
        
        // 同步平台按钮
        const syncPlatformsBtn = document.getElementById('sync-platforms-btn');
        if (syncPlatformsBtn) {
            syncPlatformsBtn.addEventListener('click', () => {
                this.showSyncPlatformsModal();
            });
        }
    }
    
    toggleSource(source) {
        if (this.state.multiSourceEnabled) {
            this.state.enabledSources[source] = !this.state.enabledSources[source];
            const enabledCount = Object.values(this.state.enabledSources).filter(v => v).length;
            if (enabledCount === 0) {
                this.state.enabledSources[source] = true;
                this.showToast('至少需要选择一个音乐源', 'warning');
            }
        } else {
            this.state.currentSource = source;
        }
        this.updateSourceUI();
    }
    
    updateSourceUI() {
        document.querySelectorAll('.source-btn').forEach(btn => {
            const source = btn.dataset.source;
            if (this.state.multiSourceEnabled) {
                btn.classList.toggle('active', this.state.enabledSources[source]);
            } else {
                btn.classList.toggle('active', source === this.state.currentSource);
            }
        });
    }
    
    updatePlayModeUI() {
        document.querySelectorAll('.playmode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === this.state.playMode);
        });
    }
    
    getPlayModeName(mode) {
        const names = {
            list: '列表循环',
            single: '单曲循环',
            shuffle: '随机播放'
        };
        return names[mode] || mode;
    }
    
    toggleUserDropdown() {
        const dropdown = document.querySelector('.user-dropdown');
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        }
    }
    
    hideUserDropdown() {
        const dropdown = document.querySelector('.user-dropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
    }
    
    // ============ 模态框相关 ============
    showLoginModal() {
        const modal = document.getElementById('login-modal');
        if (!modal) return;
        
        modal.style.display = 'block';
        
        // 登录表单提交
        const loginForm = modal.querySelector('#login-form');
        if (loginForm) {
            loginForm.onsubmit = async (e) => {
                e.preventDefault();
                const username = modal.querySelector('#login-username').value;
                const password = modal.querySelector('#login-password').value;
                
                if (await this.login(username, password)) {
                    modal.style.display = 'none';
                    loginForm.reset();
                }
            };
        }
        
        // 注册表单提交
        const registerForm = modal.querySelector('#register-form');
        if (registerForm) {
            registerForm.onsubmit = async (e) => {
                e.preventDefault();
                const username = modal.querySelector('#register-username').value;
                const password = modal.querySelector('#register-password').value;
                
                if (await this.register(username, password)) {
                    modal.style.display = 'none';
                    registerForm.reset();
                }
            };
        }
        
        // 关闭按钮
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.style.display = 'none';
            };
        }
        
        // 点击模态框外部关闭
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }
    
    showNewPlaylistModal() {
        const modal = document.getElementById('new-playlist-modal');
        if (!modal) return;
        
        modal.style.display = 'block';
        
        const form = modal.querySelector('#new-playlist-form');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                const name = modal.querySelector('#playlist-name').value;
                
                if (await this.createPlaylist(name)) {
                    modal.style.display = 'none';
                    form.reset();
                }
            };
        }
        
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.style.display = 'none';
            };
        }
        
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }
    
    showSyncPlatformsModal() {
        const modal = document.getElementById('sync-platforms-modal');
        if (!modal) return;
        
        modal.style.display = 'block';
        
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.style.display = 'none';
            };
        }
        
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }
    
    showConfirm(title, message, onConfirm) {
        const modal = document.getElementById('confirm-modal');
        if (!modal) return;
        
        modal.querySelector('.confirm-title').textContent = title;
        modal.querySelector('.confirm-message').textContent = message;
        modal.style.display = 'block';
        
        const confirmBtn = modal.querySelector('.confirm-btn');
        const cancelBtn = modal.querySelector('.cancel-btn');
        
        const handleConfirm = () => {
            modal.style.display = 'none';
            onConfirm();
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };
        
        const handleCancel = () => {
            modal.style.display = 'none';
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };
        
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        
        modal.onclick = (e) => {
            if (e.target === modal) {
                handleCancel();
            }
        };
    }
    
    // ============ Toast 通知 ============
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas fa-${this.getToastIcon(type)}"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(toast);
        
        // 显示动画
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // 自动消失
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }
    
    getToastIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }
    
    // ============ 工具函数 ============
    addToNextPlay(trackId) {
        const track = this.state.searchResults.find(t => t.uid === trackId);
        if (!track) return;
        
        this.showToast(`已添加到下一首播放: ${track.title}`, 'info');
        // 这里可以添加到播放队列的逻辑
    }
    
    // ============ 初始化应用 ============
    static init() {
        window.musicSquareApp = new MusicSquareApp();
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    MusicSquareApp.init();
});

// 导出供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MusicSquareApp;
}