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
    }