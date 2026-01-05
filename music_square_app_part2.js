    // ============ 播放器功能 ============
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
    }