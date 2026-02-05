const MusicAPI = {
    // 配置
    sources: ['netease', 'qq', 'kuwo'],

    // API 端点 - ⚠️ 注意: 这里的 worker 会在 service.js 中被初始化覆盖
    endpoints: {
        worker: '', // 将在初始化时设置为 API_BASE
        netease: 'https://netease-cloud-music-api-eight-rho.vercel.app',
    },

    searchCache: new Map(),

    // 音质偏好 - 决定降级策略的起始点
    // 选项: 'flac24bit', 'flac', '320k', '128k'
    get preferredQuality() {
        return localStorage.getItem('preferredQuality') || 'flac24bit';
    },
    set preferredQuality(val) {
        localStorage.setItem('preferredQuality', val);
    },

    // 从偏好音质开始构建降级链
    getQualityChain(preferred) {
        const allQualities = ['flac24bit', 'flac', '320k', '128k'];
        const idx = allQualities.indexOf(preferred);
        if (idx === -1) return allQualities; // 回退到全部尝试
        return allQualities.slice(idx); // 从偏好音质开始尝试
    },

    // 初始化 Worker 端点
    init(apiBase) {
        this.endpoints.worker = apiBase;
    },

    getProxyUrl(url, source = null) {
        if (!url) return url;
        const PROXY_BASE = `${this.endpoints.worker}/proxy?url=`;

        if (url.startsWith(PROXY_BASE) ||
            url.includes('localhost') ||
            url.includes('127.0.0.1')) return url;

        // 强制网易云和QQ音乐使用 HTTPS (因为它们有有效的证书)
        if (url.startsWith('http://') && (url.includes('music.126.net') || url.includes('qq.com'))) {
            url = url.replace('http://', 'https://');
        }

        // 针对酷我: 发送给代理时强制使用 HTTP (因为它们的 SSL 证书有问题，修复 526 错误)
        if (url.includes('kuwo.cn') && url.startsWith('https://')) {
            url = url.replace('https://', 'http://');
        }

        // 网易云 HTTPS CDN 不需要代理即可访问
        if (url.includes('music.126.net') && url.startsWith('https://')) {
            return url;
        }

        // 根据域名模式检查是否需要代理
        const needProxyByDomain = url.includes('126.net') ||
            url.includes('qq.com') ||
            url.includes('kuwo.cn') ||
            url.includes('kwcdn.kuwo.cn') ||
            url.includes('sycdn.kuwo.cn');

        // 检查是否为酷我的 API URL
        const isKuwoApiUrl = url.includes('source=kuwo') || source === 'kuwo';

        if (needProxyByDomain || isKuwoApiUrl) {
            return PROXY_BASE + encodeURIComponent(url);
        }
        return url;
    },


    // Netease API Request Helper (Proxy via Worker)
    async _requestNetease(path) {
        const targetUrl = `${this.endpoints.netease}${path}`;

        // 如果没有 worker 端点，回退到直接请求
        if (!this.endpoints.worker) {
            const res = await fetch(targetUrl);
            return await res.json();
        }

        const url = `${this.endpoints.worker}/tunehub/request`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: targetUrl,
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Referer': 'https://music.163.com/'
                    }
                })
            });
            const result = await res.json();

            if (!result.success && result.message) {
                console.warn('Netease Proxy failed:', result.message);
                // Fallback attempt?
            }

            let data = result.data;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch (e) { }
            }
            // 如果 data 为空或者失败，尝试直接返回 result (视 worker 实现而定)
            return data || result;
        } catch (e) {
            console.error('Netease Proxy request failed:', e);
            throw e;
        }
    },

    // 搜索 - 根据平台使用不同的 API
    async search(keyword, source, page = 1, limit = 20, signal = null) {
        if (!keyword) return [];

        const cacheKey = `${source}:${keyword}:${page}:${limit}`;
        if (this.searchCache.has(cacheKey)) {
            return this.searchCache.get(cacheKey);
        }

        try {
            let results = [];

            if (source === 'netease') {
                results = await this._searchNetease(keyword, page, limit, signal);
            } else if (source === 'qq') {
                results = await this._searchQQ(keyword, page, limit, signal);
            } else if (source === 'kuwo') {
                results = await this._searchKuwo(keyword, page, limit, signal);
            }

            // Cache results
            if (this.searchCache.size > 100) {
                const firstKey = this.searchCache.keys().next().value;
                this.searchCache.delete(firstKey);
            }
            this.searchCache.set(cacheKey, results);

            return results;
        } catch (e) {
            if (e.name === 'AbortError') return [];
            console.error(`搜索 "${keyword}" 失败:`, e.message);
            return [];
        }
    },

    // 网易云搜索 - 使用 Vercel 公共实例
    async _searchNetease(keyword, page, limit, signal) {
        const offset = (page - 1) * limit;
        const path = `/search?keywords=${encodeURIComponent(keyword)}&offset=${offset}&limit=${limit}`;

        const json = await this._requestNetease(path);

        if (json.code !== 200 || !json.result || !json.result.songs) return [];

        return json.result.songs.map(item => {
            const sid = String(item.id);
            return {
                id: `netease-${sid}`,
                songId: sid,
                title: item.name || '未知歌曲',
                artist: item.artists ? item.artists.map(a => a.name).join(', ') : '未知歌手',
                album: item.album ? item.album.name : '-',
                cover: item.album && item.album.picUrl ? item.album.picUrl : '',
                source: 'netease',
                duration: item.duration ? Math.floor(item.duration / 1000) : 0
            };
        });
    },

    // QQ音乐搜索 - 使用 Worker 通用代理
    // JSONP Helper
    jsonp(url, params = {}) {
        return new Promise((resolve, reject) => {
            const callbackName = `jsonp_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            const script = document.createElement('script');

            let queryString = '';
            for (const key in params) {
                queryString += `&${key}=${encodeURIComponent(params[key])}`;
            }

            // QQ音乐特定的回调参数名
            const targetUrl = `${url}&jsonpCallback=${callbackName}&callback=${callbackName}${queryString}`;

            window[callbackName] = (data) => {
                delete window[callbackName];
                document.body.removeChild(script);
                resolve(data);
            };

            script.onerror = () => {
                delete window[callbackName];
                document.body.removeChild(script);
                reject(new Error('JSONP request failed'));
            };

            script.src = targetUrl;
            document.body.appendChild(script);
        });
    },

    // QQ音乐搜索 - 使用 search_for_qq_cp API (GET请求，直接返回歌曲列表)
    async _searchQQ(keyword, page, limit, signal) {
        // 使用 search_for_qq_cp 接口
        const targetUrl = `https://shc.y.qq.com/soso/fcgi-bin/search_for_qq_cp?w=${encodeURIComponent(keyword)}&p=${page}&n=${limit}&format=json`;

        const url = `${this.endpoints.worker}/tunehub/request`;
        const fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: targetUrl,
                method: 'GET',
                headers: {
                    'Referer': 'https://y.qq.com/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            })
        };
        if (signal) fetchOptions.signal = signal;

        try {
            console.log('[QQ] Requesting via search_for_qq_cp:', keyword);
            const res = await fetch(url, fetchOptions);
            const result = await res.json();

            // Check worker success
            if (!result.success || !result.data) return [];

            let data = result.data;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch (e) { }
            }

            // search_for_qq_cp 返回 data.song.list
            const songList = data?.data?.song?.list;
            if (!songList || !Array.isArray(songList)) return [];

            return songList.map(item => {
                const sid = item.songmid;
                const albumId = item.albummid || '';
                return {
                    id: `qq-${sid}`,
                    songId: sid,
                    title: item.songname || '未知歌曲',
                    artist: item.singer ? item.singer.map(s => s.name).join(', ') : '未知歌手',
                    album: item.albumname || '-',
                    cover: albumId ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumId}.jpg` : '',
                    source: 'qq',
                    duration: item.interval || 0
                };
            });
        } catch (e) {
            console.error('QQ Search error:', e);
            return [];
        }
    },

    // 酷我搜索 - 通过 Worker 代理 (使用 searchMusicBykeyWord + strategy=2012 获取正版歌曲)
    async _searchKuwo(keyword, page, limit, signal) {
        const pn = page - 1;
        // 使用新接口，strategy=2012 确保返回正版歌曲而不是翻唱版本
        const targetUrl = `http://www.kuwo.cn/search/searchMusicBykeyWord?vipver=1&client=kt&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&mobi=1&issubtitle=1&show_copyright_off=1&pn=${pn}&rn=${limit}&all=${encodeURIComponent(keyword)}`;

        const url = `${this.endpoints.worker}/tunehub/request`;
        const fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: targetUrl,
                method: 'GET',
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            })
        };
        if (signal) fetchOptions.signal = signal;

        try {
            console.log('[Kuwo] Requesting:', targetUrl);
            const res = await fetch(url, fetchOptions);
            const result = await res.json();
            console.log('[Kuwo] Worker Result:', result);

            let rawData = result.data;
            let abslist = [];

            if (typeof rawData === 'string') {
                if (rawData.startsWith('jsondata=')) {
                    rawData = rawData.replace('jsondata=', '');
                }
                try {
                    const parseObj = new Function('return ' + rawData);
                    const dataObj = parseObj();
                    abslist = dataObj.abslist || [];
                } catch (e) {
                    console.error('Kuwo parse error:', e);
                }
            } else if (rawData && rawData.abslist) {
                abslist = rawData.abslist;
            }

            return abslist.map(item => ({
                id: `kuwo-${item.MUSICRID.replace('MUSIC_', '')}`,
                songId: item.MUSICRID.replace('MUSIC_', ''),
                title: item.SONGNAME || '未知歌曲',
                artist: item.ARTIST ? item.ARTIST.replace(/&/g, ', ') : '未知歌手',
                album: item.ALBUM || '-',
                cover: item.web_albumpic_short ? this.getProxyUrl(`https://img1.kuwo.cn/star/albumcover/${item.web_albumpic_short}`, 'kuwo') : '',
                source: 'kuwo',
                duration: parseInt(item.DURATION) || 0
            }));

        } catch (e) {
            console.error('Kuwo search error:', e);
            return [];
        }
    },

    // 超时助手函数
    timeoutPromise(promise, ms) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Operation timed out after ${ms}ms`));
            }, ms);
            promise.then(
                (res) => {
                    clearTimeout(timeoutId);
                    resolve(res);
                },
                (err) => {
                    clearTimeout(timeoutId);
                    reject(err);
                }
            );
        });
    },

    async aggregateSearch(keyword, page = 1, signal = null) {
        if (!keyword) return [];

        const TIMEOUT = 15000; // 每个平台 15s 超时

        const searchPromises = [
            this.timeoutPromise(this.search(keyword, 'netease', page, 10, signal), TIMEOUT),
            this.timeoutPromise(this.search(keyword, 'qq', page, 10, signal), TIMEOUT),
            this.timeoutPromise(this.search(keyword, 'kuwo', page, 10, signal), TIMEOUT)
        ];

        try {
            // 使用 allSettled 确保即使某些请求失败也能获取部分结果
            const resultsSettled = await Promise.allSettled(searchPromises);

            const results = resultsSettled.map(r => {
                if (r.status === 'fulfilled') return r.value;
                // 记录警告但不中断
                console.warn('Search platform failed or timed out:', r.reason);
                return [];
            });

            // 交替合并结果
            const merged = [];
            const maxLen = Math.max(...results.map(r => r.length));
            for (let i = 0; i < maxLen; i++) {
                for (const arr of results) {
                    if (arr[i]) merged.push(arr[i]);
                }
            }
            return merged;
        } catch (e) {
            if (e.name === 'AbortError') return [];
            console.error('Aggregate search critical error:', e);
            return [];
        }
    },

    // URL 缓存，避免重复请求 API
    urlCache: new Map(),

    // 获取歌曲详情 - 使用 TuneHub 解析
    async getSongDetails(track) {
        try {
            // 优先检查缓存
            const cacheKey = `${track.source}-${track.songId || track.id}`;
            if (this.urlCache.has(cacheKey)) {
                const cached = this.urlCache.get(cacheKey);
                track.url = cached.url;
                track.cover = cached.cover || track.cover;
                track.lrc = cached.lrc || track.lrc;
                return track;
            }

            const sid = track.songId || (track.id && String(track.id).includes('-') ? String(track.id).split('-')[1] : track.id);
            if (!sid) return track;

            // 平台映射
            const platformMap = { netease: 'netease', qq: 'qq', kuwo: 'kuwo' };
            const platform = platformMap[track.source];
            if (!platform) return track;

            // 调用 TuneHub 解析 API
            const parseUrl = `${this.endpoints.worker}/tunehub/parse`;
            const qualities = this.getQualityChain(this.preferredQuality);

            let parseResult = null;
            for (const quality of qualities) {
                try {
                    const res = await fetch(parseUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            platform,
                            ids: sid,
                            quality
                        })
                    });
                    const json = await res.json();
                    console.log('TuneHub parse response:', json);

                    // 处理多种可能的返回格式
                    if (json.code === 0 && json.data) {
                        // 格式0: { data: { data: [{ url: "..." }] } } - 嵌套 data 结构 (新增)
                        if (json.data.data && Array.isArray(json.data.data) && json.data.data.length > 0) {
                            parseResult = json.data.data[0];
                            break;
                        }
                        // 格式1: { data: { url: "..." } } - 单曲直接返回对象
                        if (json.data.url) {
                            parseResult = json.data;
                            break;
                        }
                        // 格式2: { data: [{ url: "..." }] } - 数组
                        if (Array.isArray(json.data) && json.data.length > 0) {
                            parseResult = json.data[0];
                            break;
                        }
                        // 格式3: { data: { songs: [...] } } - TuneHub 标准
                        if (json.data.songs && json.data.songs.length > 0) {
                            parseResult = json.data.songs[0];
                            break;
                        }
                    }
                } catch (e) {
                    console.warn(`TuneHub parse failed for quality ${quality}:`, e);
                }
            }

            if (parseResult) {
                track.url = parseResult.url || track.url;
                // 针对酷我，由于 SSL 证书问题，代理封面 URL
                let coverUrl = parseResult.cover || track.cover;
                if (coverUrl && track.source === 'kuwo') {
                    coverUrl = this.getProxyUrl(coverUrl, 'kuwo');
                }
                track.cover = coverUrl;
                track.lrc = parseResult.lyrics || parseResult.lyric || track.lrc;
                track.actualQuality = parseResult.actualQuality;

                // 处理歌词
                if (track.lrc && typeof track.lrc === 'object' && track.lrc.original) {
                    track.lrc = track.lrc.original;
                }
            }

            // 如果获取到了 URL，缓存结果
            if (track.url) {
                if (this.urlCache.size > 200) {
                    const firstKey = this.urlCache.keys().next().value;
                    this.urlCache.delete(firstKey);
                }
                this.urlCache.set(cacheKey, { url: track.url, cover: track.cover, lrc: track.lrc });
            }

        } catch (e) {
            console.error("Detail fetch error:", e);
        }
        return track;
    },

    parsePlaylistUrl(url) {
        if (!url) return null;
        url = url.trim();

        // Netease: https://y.music.163.com/m/playlist?id=6586246706
        if (url.includes('163.com')) {
            const match = url.match(/[?&]id=(\d+)/);
            if (match) return { source: 'netease', id: match[1] };
        }

        // QQ: https://i2.y.qq.com/n3/other/pages/details/playlist.html?id=3817475436
        if (url.includes('qq.com') || url.includes('tencent')) {
            const match = url.match(/[?&]id=([\d\w]+)/);
            if (match) return { source: 'qq', id: match[1] };
        }

        // Kuwo: https://m.kuwo.cn/newh5app/playlist_detail/3026741014
        if (url.includes('kuwo.cn')) {
            const match = url.match(/playlist_detail\/(\d+)/);
            if (match) return { source: 'kuwo', id: match[1] };
        }

        // Raw numeric ID fallback
        if (/^\d+$/.test(url)) {
            return { source: null, id: url };
        }

        return null;
    },

    // 获取歌单歌曲
    async getPlaylistSongs(source, playlistId) {
        try {
            if (source === 'netease') {
                return await this._getPlaylistNetease(playlistId);
            } else if (source === 'qq') {
                return await this._getPlaylistQQ(playlistId);
            } else if (source === 'kuwo') {
                return await this._getPlaylistKuwo(playlistId);
            }
        } catch (e) {
            console.error("Playlist songs fetch error:", e);
        }
        return { name: '未知歌单', tracks: [] };
    },

    async _getPlaylistNetease(playlistId) {
        try {
            const json = await this._requestNetease(`/playlist/detail?id=${playlistId}`);

            if (json.code !== 200 || !json.playlist) return { name: '未知歌单', tracks: [] };

            const playlist = json.playlist;
            // 移除限制，获取所有 trackIds
            const trackIds = playlist.trackIds ? playlist.trackIds.map(t => t.id) : [];

            // 批量获取详情 (分块大小 50，避免 URL 过长)
            let tracks = [];
            if (trackIds.length > 0) {
                const CHUNK_SIZE = 50;
                const chunks = [];
                for (let i = 0; i < trackIds.length; i += CHUNK_SIZE) {
                    chunks.push(trackIds.slice(i, i + CHUNK_SIZE));
                }

                // 获取分块数据 (顺序执行以保证稳定性)
                const detailMap = new Map();
                for (const chunkIds of chunks) {
                    try {
                        const detailJson = await this._requestNetease(`/song/detail?ids=${chunkIds.join(',')}`);
                        if (detailJson.songs) {
                            detailJson.songs.forEach(s => detailMap.set(String(s.id), s));
                        }
                    } catch (e) { console.error("Chunk fetch failed", e); }
                }

                // 重新映射以保持 trackIds 顺序
                tracks = trackIds.map(tid => {
                    const item = detailMap.get(String(tid));
                    if (!item) return null;
                    return {
                        id: `netease-${item.id}`,
                        songId: String(item.id),
                        title: item.name || '未知歌曲',
                        artist: item.ar ? item.ar.map(a => a.name).join(', ') : '未知歌手',
                        album: item.al ? item.al.name : '-',
                        cover: item.al && item.al.picUrl ? item.al.picUrl : '',
                        source: 'netease'
                    };
                }).filter(t => t !== null);
            }

            return {
                name: playlist.name || '未知歌单',
                tracks
            };
        } catch (e) {
            console.error('Get Playlist Netease Error:', e);
            return { name: '未知歌单', tracks: [] };
        }
    },

    async _getPlaylistQQ(playlistId) {
        // 使用经过验证的官方 API，使用大额限制 (10000) 确保完全导入
        const targetUrl = `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${playlistId}&format=json&song_begin=0&song_num=10000`;

        const url = `${this.endpoints.worker}/tunehub/request`;
        const fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: targetUrl,
                method: 'GET',
                headers: {
                    'Referer': 'https://y.qq.com/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            })
        };

        try {
            const res = await fetch(url, fetchOptions);
            const result = await res.json();

            // 处理 Worker 代理响应包装
            let data = result;
            if (result.success && result.data) {
                data = result.data;
                if (typeof data === 'string') {
                    try { data = JSON.parse(data); } catch (e) { }
                }
            }

            if (!data.cdlist || !data.cdlist[0]) return { name: '未知歌单', tracks: [] };

            const cd = data.cdlist[0];
            const tracks = (cd.songlist || []).map(item => ({
                id: `qq-${item.songmid}`,
                songId: item.songmid,
                title: item.songname || '未知歌曲',
                artist: item.singer ? item.singer.map(s => s.name).join(', ') : '未知歌手',
                album: item.albumname || '-',
                cover: item.albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${item.albummid}.jpg` : '',
                source: 'qq'
            }));

            return {
                name: cd.dissname || '未知歌单',
                tracks
            };
        } catch (e) {
            console.error('QQ Playlist Import Error:', e);
            throw e;
        }
    },

    async _getPlaylistKuwo(playlistId) {
        // 增加限制到 2000
        const targetUrl = `http://nplserver.kuwo.cn/pl.svc?op=getlistinfo&pid=${playlistId}&pn=0&rn=2000&encode=utf8&keyset=pl2012&vipver=MUSIC_9.0.5.0_W1&newver=1`;
        const url = `${this.endpoints.worker}/tunehub/request`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: targetUrl,
                method: 'GET',
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            })
        });
        const result = await res.json();

        if (!result.success || !result.data || !result.data.musiclist) return { name: '未知歌单', tracks: [] };

        const tracks = result.data.musiclist.map(item => ({
            id: `kuwo-${item.id}`,
            songId: String(item.id),
            title: item.name || '未知歌曲',
            artist: item.artist || '未知歌手',
            album: item.album || '-',
            cover: item.pic ? this.getProxyUrl(item.pic.replace('_120.', '_500.'), 'kuwo') : '',
            source: 'kuwo'
        }));

        return {
            name: result.data.title || '未知歌单',
            tracks
        };
    },

    // 获取排行榜列表
    async getBillboardList(source) {
        try {
            if (source === 'netease') {
                return await this._getToplistsNetease();
            } else if (source === 'qq') {
                return await this._getToplistsQQ();
            } else if (source === 'kuwo') {
                return await this._getToplistsKuwo();
            }
        } catch (e) {
            console.error("Billboard list fetch error:", e);
        }
        return [];
    },

    async _getToplistsNetease() {
        const json = await this._requestNetease('/toplist');

        if (json.code !== 200 || !json.list) return [];

        return json.list.map(item => ({
            id: String(item.id),
            name: item.name || '未知榜单',
            pic: item.coverImgUrl || '',
            updateFrequency: item.updateFrequency || ''
        }));
    },

    async _getToplistsQQ() {
        const targetUrl = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
        const body = {
            comm: { cv: 4747474, ct: 24, format: "json", inCharset: "utf-8", outCharset: "utf-8", uin: 0 },
            toplist: { module: "musicToplist.ToplistInfoServer", method: "GetAll", param: {} }
        };

        const url = `${this.endpoints.worker}/tunehub/request`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: targetUrl,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Referer': 'https://y.qq.com/' },
                body: body
            })
        });
        const result = await res.json();

        if (!result.success || !result.data || !result.data.toplist || !result.data.toplist.data || !result.data.toplist.data.group) {
            return [];
        }

        const toplists = [];
        result.data.toplist.data.group.forEach(group => {
            (group.toplist || []).forEach(item => {
                toplists.push({
                    id: String(item.topId),
                    name: item.title || '未知榜单',
                    pic: item.headPicUrl || item.frontPicUrl || '',
                    updateFrequency: item.updateType === 1 ? '每日更新' : '每周更新'
                });
            });
        });
        return toplists;
    },

    async _getToplistsKuwo() {
        const targetUrl = 'http://qukudata.kuwo.cn/q.k?op=query&cont=tree&node=2&pn=0&rn=1000&fmt=json&level=2';
        const url = `${this.endpoints.worker}/tunehub/request`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: targetUrl,
                method: 'GET',
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            })
        });
        const result = await res.json();

        if (!result.success || !result.data || !result.data.child) return [];

        return result.data.child
            .filter(item => item.source === '1')
            .map(item => ({
                id: item.sourceid,
                name: item.name || '未知榜单',
                pic: item.pic ? this.getProxyUrl(item.pic, 'kuwo') : '',
                updateFrequency: item.info || '定期更新'
            }));
    },

    // 获取排行榜详情
    async getBillboardDetail(source, id) {
        try {
            if (source === 'netease') {
                return await this._getToplistDetailNetease(id);
            } else if (source === 'qq') {
                return await this._getToplistDetailQQ(id);
            } else if (source === 'kuwo') {
                return await this._getToplistDetailKuwo(id);
            }
        } catch (e) {
            console.error("Billboard detail fetch error:", e);
        }
        return [];
    },

    async _getToplistDetailNetease(id) {
        const json = await this._requestNetease(`/playlist/detail?id=${id}`);

        if (json.code !== 200 || !json.playlist) return [];

        const trackIds = json.playlist.trackIds ? json.playlist.trackIds.map(t => t.id).slice(0, 100) : [];
        if (trackIds.length === 0) return [];

        const detailJson = await this._requestNetease(`/song/detail?ids=${trackIds.join(',')}`);

        if (!detailJson.songs) return [];

        return detailJson.songs.map(item => ({
            id: `netease-${item.id}`,
            songId: String(item.id),
            title: item.name || '未知歌曲',
            artist: item.ar ? item.ar.map(a => a.name).join(', ') : '未知歌手',
            album: item.al ? item.al.name : '-',
            cover: item.al && item.al.picUrl ? item.al.picUrl : '',
            source: 'netease'
        }));
    },

    async _getToplistDetailQQ(id) {
        const targetUrl = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
        const body = {
            comm: { cv: 4747474, ct: 24, format: "json", inCharset: "utf-8", outCharset: "utf-8", uin: 0 },
            req: { module: "musicToplist.ToplistInfoServer", method: "GetDetail", param: { topid: parseInt(id), num: 100, period: "" } }
        };

        const url = `${this.endpoints.worker}/tunehub/request`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: targetUrl,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Referer': 'https://y.qq.com/' },
                body: body
            })
        });
        const result = await res.json();

        if (!result.success || !result.data || !result.data.req || !result.data.req.data || !result.data.req.data.songInfoList) {
            return [];
        }

        return result.data.req.data.songInfoList.map(item => ({
            id: `qq-${item.mid}`,
            songId: item.mid,
            title: item.name || '未知歌曲',
            artist: item.singer ? item.singer.map(s => s.name).join(', ') : '未知歌手',
            album: item.album ? item.album.name : '-',
            cover: item.album && item.album.mid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${item.album.mid}.jpg` : '',
            source: 'qq'
        }));
    },

    async _getToplistDetailKuwo(id) {
        const targetUrl = `http://kbangserver.kuwo.cn/ksong.s?from=pc&fmt=json&pn=0&rn=100&type=bang&data=content&id=${id}&show_copyright_off=0&pcmp4=1&isbang=1`;
        const url = `${this.endpoints.worker}/tunehub/request`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: targetUrl,
                method: 'GET',
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            })
        });
        const result = await res.json();

        if (!result.success || !result.data || !result.data.musiclist) return [];

        return result.data.musiclist.map(item => ({
            id: `kuwo-${item.id}`,
            songId: String(item.id),
            title: item.name || '未知歌曲',
            artist: item.artist || '未知歌手',
            album: item.album || '-',
            cover: item.pic ? this.getProxyUrl(item.pic.replace('_120.', '_500.'), 'kuwo') : '',
            source: 'kuwo'
        }));
    },

    async fetchLrcText(lrcUrl) {
        if (!lrcUrl || !lrcUrl.startsWith('http')) return lrcUrl;

        // Use proxy for lrc mostly to avoid CORS
        const url = this.getProxyUrl(lrcUrl);
        try {
            const res = await fetch(url);
            return await res.text();
        } catch (e) {
            console.error("LRC fetch failed:", e);
            return '';
        }
    }
};

window.MusicAPI = MusicAPI;
