



// API 基础路径 / API Base URL
// ⚠️⚠️⚠️ 警告 / WARNING ⚠️⚠️⚠️
// 如果您是此项目的 Fork 用户或部署在自己的服务器上，
// 您必须修改下方的 API_BASE 为您自己的后端地址！
// 严禁直接使用默认的 Cloudflare 地址，否则可能会被封禁。
// If you are deploying this project, you MUST change the API_BASE below.

// Cloudflare Worker 后端地址
// 注意：如果您的后端部署在 Cloudflare Workers，默认的 *.workers.dev 域名在国内可能无法访问
// 强烈建议绑定自定义二级域名 (Custom Domain) 以解决此问题，具体操作请参考文档 DEPLOY.md 中的“进阶”部分
const API_BASE = 'https://api.yexin.de5.net/api';

// 初始化 MusicAPI 的 Worker 端点
if (typeof MusicAPI !== 'undefined') {
    MusicAPI.init(API_BASE);
}

const AuthService = {
    get currentUser() {
        const s = localStorage.getItem('currentUser');
        return s ? JSON.parse(s) : null;
    },

    async login(username, password) {
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '登录失败');

            // 保存用户信息 (目前作为 token 使用)
            localStorage.setItem('currentUser', JSON.stringify(data.user));

            return data.user;
        } catch (e) {
            console.error('Login Error:', e);
            throw e;
        }
    },

    async register(username, password) {
        try {
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '注册失败');
            return data;
        } catch (e) {
            console.error('Register Error:', e);
            throw e;
        }
    },

    logout() {
        localStorage.removeItem('currentUser');
        // 清除数据缓存
        DataService.clearCache();
    },

    async checkUserExists(username) {
        try {
            const res = await fetch(`${API_BASE}/auth/check-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '验证失败');
            return data.exists;
        } catch (e) {
            console.error('Check User Error:', e);
            throw e;
        }
    },

    async resetPassword(username, newPassword) {
        try {
            const res = await fetch(`${API_BASE}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, newPassword })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '重置密码失败');
            return data;
        } catch (e) {
            console.error('Reset Password Error:', e);
            throw e;
        }
    }
};

const DataService = {
    favorites: [],
    playlists: [],

    get authHeader() {
        const user = AuthService.currentUser;
        return user ? { 'Authorization': `Bearer ${user.id}` } : {};
    },

    async init() {
        if (!AuthService.currentUser) return;
        await Promise.all([this.fetchPlaylists(), this.fetchFavorites()]);
    },

    clearCache() {
        this.favorites = [];
        this.playlists = [];
    },

    async syncPlatform(platform, url) {
        try {
            const parsed = MusicAPI.parsePlaylistUrl(url);
            if (!parsed) throw new Error("无法解析链接，请检查格式是否正确");

            // 去重检查
            const existing = this.playlists.find(p =>
                (p.platform === parsed.source || p.source === parsed.source) &&
                (String(p.externalId) === String(parsed.id) || String(p.external_id) === String(parsed.id))
            );

            if (existing) {
                console.log("发现已存在的同步歌单:", existing.name);
                return await this.syncExistingPlaylist(existing);
            }

            const platformNames = { netease: '网易云', qq: 'QQ', kuwo: '酷我' };
            UI.showToast(`正在从${platformNames[platform] || platform}获取歌单...`, 'info');

            const result = await MusicAPI.getPlaylistSongs(parsed.source, parsed.id);
            if (!result || !result.tracks || result.tracks.length === 0) throw new Error("无法获取歌曲列表或歌单为空");

            const res = await fetch(`${API_BASE}/playlists/sync`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform: parsed.source,
                    externalId: parsed.id,
                    name: result.name || "我的同步歌单",
                    songs: result.tracks.map(s => this.cleanSong(s))
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '同步失败');

            UI.showToast(`同步成功: ${data.count} 项更新`, 'success');
            await this.fetchPlaylists(); // Refresh
            return true;
        } catch (e) {
            console.error('Sync Error:', e);
            UI.showToast(`同步失败: ${e.message}`, 'error');
            return false;
        }
    },

    async syncExistingPlaylist(pl) {
        try {
            // 从歌单对象确定 来源/ID
            const platform = pl.platform || pl.source;
            const extId = pl.externalId || pl.external_id;

            if (!platform || !extId) {
                UI.showToast("该歌单缺少同步信息", "error");
                return false;
            }

            // 静默获取新歌曲
            const result = await MusicAPI.getPlaylistSongs(platform, extId);
            if (!result || !result.tracks) {
                console.warn(`歌单 ${pl.name} 同步结果为空`);
                return false;
            }

            const freshSongs = result.tracks.map(s => this.cleanSong(s));

            // 使用后端增量同步端点
            // 该端点处理添加新歌曲并移除已删除的歌曲（同时保留手动添加的歌曲）
            // 发送前清理名称以防止前缀堆积
            let cleanPlName = pl.name;
            const prefixes = ['网易:', 'QQ:', '酷我:', 'netease:', 'qq:', 'kuwo:', '网易：', '酷我：', 'QQ：'];
            let found = true;
            while (found) {
                found = false;
                for (const p of prefixes) {
                    if (cleanPlName.toLowerCase().startsWith(p.toLowerCase())) {
                        cleanPlName = cleanPlName.slice(p.length).trim();
                        found = true;
                    }
                }
            }

            const res = await fetch(`${API_BASE}/playlists/sync`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform: platform,
                    externalId: extId,
                    name: cleanPlName,
                    songs: freshSongs
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '同步失败');

            UI.showToast(`歌单 "${pl.name}" 同步完成`, 'success');
            await this.fetchPlaylists(); // 刷新本地列表以显示更改
            return true;
        } catch (e) {
            console.error("Sync Existing Error:", e);
            UI.showToast("同步出错", "error");
            return false;
        }
    },

    checkAutoSync() {
        const LAST_SYNC_KEY = 'last_daily_sync_date';
        const now = new Date();
        const beijingTime = new Date(now.getTime() + (480 + now.getTimezoneOffset()) * 60000); // 如果本地不是北京时间，粗略转换
        // 用户浏览器时间 + 8 小时偏移...
        // 实际上，只需检查本地时间是否超过上午 8 点（如果用户在中国），或者检查严格的北京时间。
        // 用户要求 "中国北京时间上午 8 点"。
        // 我们信任用户的系统时间，如果他们在中国，或者足够接近。
        // 使用简单逻辑: 如果 (小时 >= 8) 且 (最后同步日期 != 今天日期字符串)

        const todayStr = beijingTime.toISOString().split('T')[0];
        const lastSync = localStorage.getItem(LAST_SYNC_KEY);

        if (beijingTime.getHours() >= 8 && lastSync !== todayStr) {
            console.log("触发每日自动同步...");
            localStorage.setItem(LAST_SYNC_KEY, todayStr);

            // 同步所有导入的歌单
            this.playlists.forEach(pl => {
                if ((pl.platform || pl.source) && (pl.externalId || pl.external_id)) {
                    this.syncExistingPlaylist(pl);
                }
            });
        }
    },

    cleanSong(song) {
        const clean = { ...song };
        delete clean.url;
        if (typeof clean.lrc === 'string' && clean.lrc.startsWith('http')) delete clean.lrc;
        return clean;
    },

    /**
     * 从外部平台导入歌单
     * @param {string} platform - 平台名称 (netease, qq, 等)
     * @param {string} externalId - 外部歌单 ID
     * @param {Array} playlists - 包含 id, name, 和 tracks 的歌单对象数组
     * @returns {Object} 带有成功状态的响应
     */
    async importPlaylists(platform, externalId, playlists) {
        try {
            // 发送到后端前清理所有歌曲数据
            const cleanPlaylists = playlists.map(pl => ({
                ...pl,
                tracks: pl.tracks ? pl.tracks.map(s => this.cleanSong(s)) : []
            }));

            const res = await fetch(`${API_BASE}/sync/import`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform, id: externalId, playlists: cleanPlaylists })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || '导入失败');
            }
            return { success: true, count: data.count, message: data.message };
        } catch (e) {
            console.error('Import Playlists Error:', e);
            return { success: false, message: e.message };
        }
    },

    // --- Favorites ---
    async fetchFavorites() {
        try {
            const res = await fetch(`${API_BASE}/favorites`, {
                headers: this.authHeader
            });
            if (res.ok) {
                this.favorites = await res.json();
            }
        } catch (e) {
            console.error('Fetch Favorites Error:', e);
        }
        return this.favorites;
    },

    async addFavorite(song) {
        // Optimistic update - add to top
        this.favorites.unshift(song);
        try {
            await fetch(`${API_BASE}/favorites`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify(this.cleanSong(song))
            });
            document.dispatchEvent(new CustomEvent('favorites-updated'));
        } catch (e) {
            console.error('Add Favorite Error:', e);
        }
    },

    async addBatchFavorites(songs) {
        // Optimistic update - add to top
        this.favorites.unshift(...songs);
        try {
            const res = await fetch(`${API_BASE}/favorites/batch`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ songs: songs.map(s => this.cleanSong(s)) })
            });
            if (!res.ok) throw new Error('Batch favorites failed');
            return true;
        } catch (e) {
            console.error('Batch Add Favorites Error:', e);
            this.fetchFavorites();
            throw e;
        }
    },

    async removeFavorite(uid) {
        // Optimistic update
        this.favorites = this.favorites.filter(s => s.id !== uid && s.uid !== uid); //处理两种 ID 格式
        try {
            await fetch(`${API_BASE}/favorites`, {
                method: 'DELETE',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: uid }) // 后端期望 'id'
            });
        } catch (e) {
            console.error('Remove Favorite Error:', e);
        }
    },

    async removeBatchFavorites(songs) {
        // Optimistic update - remove all matching songs
        const idsToRemove = songs.map(s => s.id || s.uid);
        this.favorites = this.favorites.filter(s =>
            !idsToRemove.includes(s.id) && !idsToRemove.includes(s.uid)
        );
        try {
            const res = await fetch(`${API_BASE}/favorites/batch`, {
                method: 'DELETE',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: idsToRemove })
            });
            if (!res.ok) throw new Error('Batch remove favorites failed');
            return true;
        } catch (e) {
            console.error('Batch Remove Favorites Error:', e);
            this.fetchFavorites(); // 出错刷新
            throw e;
        }
    },

    isFavorite(song) {
        if (!song) return false;
        // 检查两种 ID 类型 (本地 'netease-123' vs 后端存储的)
        return this.favorites.some(f => f.id === song.id || f.id === song.uid);
    },

    // --- Playlists ---
    async fetchPlaylists() {
        try {
            const res = await fetch(`${API_BASE}/playlists`, {
                headers: this.authHeader
            });
            if (res.ok) {
                const list = await res.json();
                // 后端已按倒序排序
                this.playlists = list;
            }
        } catch (e) {
            console.error('Fetch Playlists Error:', e);
        }
        return this.playlists;
    },

    async createPlaylist(name, tracks = []) {
        try {
            const res = await fetch(`${API_BASE}/playlists`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, songs: tracks.map(s => this.cleanSong(s)) })
            });
            if (res.ok) {
                const pl = await res.json();
                this.playlists.unshift(pl); // 添加到顶部
                return pl;
            }
        } catch (e) {
            console.error('Create Playlist Error:', e);
        }
        return null;
    },

    async deletePlaylist(id) {
        // Optimistic
        this.playlists = this.playlists.filter(p => p.id !== id);
        try {
            await fetch(`${API_BASE}/playlists/${id}`, {
                method: 'DELETE',
                headers: this.authHeader
            });
        } catch (e) {
            console.error('Delete Playlist Error:', e);
        }
    },

    async renamePlaylist(id, name) {
        const pl = this.playlists.find(p => p.id === id);
        if (pl) pl.name = name;
        try {
            await fetch(`${API_BASE}/playlists/${id}`, {
                method: 'PUT',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
        } catch (e) {
            console.error('Rename Playlist Error:', e);
        }
    },

    async addSongToPlaylist(playlistId, song) {
        let pl = this.playlists.find(p => p.id === playlistId);
        if (!pl) {
            await this.fetchPlaylists();
            pl = this.playlists.find(p => p.id === playlistId);
        }

        if (!pl) return false;

        // 使用 id 和 uid 检查重复
        if (pl.tracks.some(t => (song.id && t.id === song.id) || (song.uid && t.uid === song.uid))) return false;

        // 乐观更新 - 添加到顶部以保持倒序 (最新优先)
        const tempTrack = { ...song };
        pl.tracks.unshift(tempTrack);

        try {
            const res = await fetch(`${API_BASE}/playlists/${playlistId}/songs`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify(this.cleanSong(song))
            });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                if (data.uid) {
                    tempTrack.uid = data.uid;
                }
                this.fetchPlaylists();
                return true;
            }

            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || '后端保存失败');
        } catch (e) {
            console.error('Add Song to Playlist Error:', e);
            pl.tracks = pl.tracks.filter(t => t !== tempTrack);
            throw e;
        }
    },

    async addBatchSongsToPlaylist(playlistId, songs) {
        let pl = this.playlists.find(p => p.id === playlistId);
        if (!pl) {
            await this.fetchPlaylists();
            pl = this.playlists.find(p => p.id === playlistId);
        }
        if (!pl) throw new Error('Playlist not found');

        // Filter duplicates
        const newSongs = songs.filter(s => !pl.tracks.some(t => t.id === s.id));
        if (newSongs.length === 0) return 0;

        // 乐观更新 - 添加到顶部以保持倒序 (最新优先)
        pl.tracks.unshift(...newSongs);

        try {
            const res = await fetch(`${API_BASE}/playlists/batch-songs`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ playlistId, songs: newSongs.map(s => this.cleanSong(s)) })
            });
            if (!res.ok) throw new Error('Batch add songs failed');
            this.fetchPlaylists(); // Refresh to sync
            return newSongs.length;
        } catch (e) {
            console.error('Batch Add Songs Error:', e);
            this.fetchPlaylists(); // Refresh to sync
            throw e;
        }
    },

    async removeSongFromPlaylist(playlistId, songUid) {
        const pl = this.playlists.find(p => p.id === playlistId);
        if (pl) {
            pl.tracks = pl.tracks.filter(t => t.uid !== songUid);
        }
        try {
            await fetch(`${API_BASE}/playlists/${playlistId}/songs`, {
                method: 'DELETE',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: songUid })
            });
        } catch (e) {
            console.error('Remove Song from Playlist Error:', e);
        }
    },

    async removeBatchSongsFromPlaylist(playlistId, songs) {
        const pl = this.playlists.find(p => p.id === playlistId);
        if (!pl) return;

        // Optimistic update - remove all matching songs
        const uidsToRemove = songs.map(s => s.uid || s.id);
        pl.tracks = pl.tracks.filter(t =>
            !uidsToRemove.includes(t.uid) && !uidsToRemove.includes(t.id)
        );

        try {
            const res = await fetch(`${API_BASE}/playlists/${playlistId}/songs/batch`, {
                method: 'DELETE',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ uids: uidsToRemove })
            });
            if (!res.ok) throw new Error('Batch delete songs failed');
            this.fetchPlaylists(); // Refresh to sync
            return true;
        } catch (e) {
            console.error('Batch Remove Songs Error:', e);
            this.fetchPlaylists(); // 出错刷新
            throw e;
        }
    },

    async fetchHistory() {
        try {
            const res = await fetch(`${API_BASE}/history`, { headers: this.authHeader });
            if (res.ok) {
                const data = await res.json();
                return data;
            }
        } catch (e) {
            console.error('Fetch History Error:', e);
        }
        return [];
    },

    async addToHistory(song) {
        try {
            await fetch(`${API_BASE}/history`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify(this.cleanSong(song))
            });
            document.dispatchEvent(new CustomEvent('history-updated'));
        } catch (e) { console.error('Add History Error:', e); }
    },

    async removeBatchHistory(songs) {
        const idsToRemove = songs.map(s => s.id || s.uid);
        try {
            const res = await fetch(`${API_BASE}/history/batch`, {
                method: 'DELETE',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: idsToRemove })
            });
            if (!res.ok) throw new Error('Batch remove history failed');
            return true;
        } catch (e) {
            console.error('Batch Remove History Error:', e);
            throw e;
        }
    }
};
