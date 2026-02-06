export default {
    async fetch(request, env) {
        // ==========================================
        // 1. 安全配置区域 (Security Configuration)
        // ==========================================

        // 允许访问的域名列表 (白名单)
        const ALLOWED_ORIGINS = [
            "https://你的github用户名.github.io",//记得修改
            "http://127.0.0.1:5500", // 本地开发备用
            "http://localhost:5500"
        ];

        const origin = request.headers.get("origin");
        const url = new URL(request.url);
        const path = url.pathname;

        // --- 安全检查: Origin 校验 ---
        // 辅助函数：检查 Origin 是否在白名单中
        function isAllowedOrigin(origin) {
            if (!origin) return false;
            return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
        }

        // 如果 Origin 存在且不在白名单内，直接拒绝
        if (origin && !isAllowedOrigin(origin)) {
             return new Response("Forbidden: Invalid Origin", { status: 403 });
        }

        // ==========================================
        // 2. CORS 设置 (CORS Headers)
        // ==========================================
        
        // 动态设置 CORS，不再使用 "*"
        const corsHeaders = {
            "Access-Control-Allow-Origin": origin || "", // 动态回显，只允许白名单内的域名
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
            "Access-Control-Max-Age": "86400",
        };

        // 处理预检请求 (Browser Pre-flight)
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        // 辅助响应函数
        const json = (data, status = 200) =>
            new Response(JSON.stringify(data), { 
                status, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });
            
        const error = (msg, status = 400) =>
            new Response(JSON.stringify({ error: msg }), { 
                status, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });

        // ==========================================
        // 3. 业务逻辑 (Business Logic) - 保持原样
        // ==========================================

        // --- Auth Helper ---
        const getUserId = () => {
            const auth = request.headers.get("Authorization");
            if (!auth) return null;
            return parseInt(auth.split(" ")[1]);
        };

        // --- Routes ---

        // 1. Auth: Register
        if (path === "/api/auth/register" && request.method === "POST") {
            try {
                const { username, password } = await request.json();
                if (!username || !password) return error("请输入用户名和密码");

                const exists = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
                if (exists) return error("该用户名已存在");

                const avatar = `https://ui-avatars.com/api/?name=${username}&background=random`;
                const res = await env.DB.prepare(
                    "INSERT INTO users (username, password, avatar, created_at) VALUES (?, ?, ?, ?)"
                ).bind(username, password, avatar, Date.now()).run();

                if (res.success) return json({ success: true, message: "注册成功" });
                return error("注册失败，请稍后重试");
            } catch (e) {
                return error("注册失败: " + e.message, 500);
            }
        }

        // 2. Auth: Login
        if (path === "/api/auth/login" && request.method === "POST") {
            try {
                const { username, password } = await request.json();
                const user = await env.DB.prepare(
                    "SELECT * FROM users WHERE username = ? AND password = ?"
                ).bind(username, password).first();

                if (!user) return error("用户名或密码错误", 401);
                return json({ success: true, user: { id: user.id, username: user.username, avatar: user.avatar } });
            } catch (e) {
                return error("登录失败: " + e.message, 500);
            }
        }

        // 3. Auth: Check User Exists (for password reset)
        if (path === "/api/auth/check-user" && request.method === "POST") {
            try {
                const { username } = await request.json();
                if (!username) return error("请输入用户名");

                // Debug log
                console.log(`Checking user exists: [${username}]`);
                const user = await env.DB.prepare("SELECT id, username FROM users WHERE username = ?").bind(username).first();
                console.log(`Check result:`, user);

                return json({ exists: !!user });
            } catch (e) {
                return error("验证失败: " + e.message, 500);
            }
        }

        // 4. Auth: Reset Password (no verification required)
        if (path === "/api/auth/reset-password" && request.method === "POST") {
            try {
                const { username, newPassword } = await request.json();
                if (!username || !newPassword) return error("缺少用户名或新密码");

                const user = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
                if (!user) return error("该账号不存在", 404);

                await env.DB.prepare("UPDATE users SET password = ? WHERE id = ?").bind(newPassword, user.id).run();
                return json({ success: true, message: "密码重置成功" });
            } catch (e) {
                return error("重置密码失败: " + e.message, 500);
            }
        }

        // 5. User: Profile Update (Avatar)
        if (path === "/api/user/profile" && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);
            const { avatar, username } = await request.json();

            if (username) {
                await env.DB.prepare("UPDATE users SET username = ? WHERE id = ?").bind(username, userId).run();
            }
            if (avatar) {
                await env.DB.prepare("UPDATE users SET avatar = ? WHERE id = ?").bind(avatar, userId).run();
            }

            return json({ success: true });
        }

        // 9. TuneHub API 代理

        // === TuneHub 歌曲解析代理 ===
        if (path === "/api/tunehub/parse" && request.method === "POST") {
            try {
                const body = await request.json();
                const { platform, ids, quality } = body;

                if (!platform || !ids) {
                    return error("Missing platform or ids");
                }

                const tuneHubRes = await fetch("https://tunehub.sayqz.com/api/v1/parse", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-API-Key": env.TUNEHUB_API_KEY
                    },
                    body: JSON.stringify({
                        platform,
                        ids,
                        quality: quality || "320k"
                    })
                });

                const data = await tuneHubRes.json();
                return json(data);
            } catch (e) {
                return error("TuneHub parse failed: " + e.message, 500);
            }
        }

        // === TuneHub 方法配置代理 ===
        if (path.startsWith("/api/tunehub/methods") && request.method === "GET") {
            try {
                const tunehubPath = path.replace("/api/tunehub/methods", "/v1/methods");
                const tuneHubRes = await fetch(`https://tunehub.sayqz.com/api${tunehubPath}`, {
                    headers: {
                        "X-API-Key": env.TUNEHUB_API_KEY
                    }
                });
                const data = await tuneHubRes.json();
                return json(data);
            } catch (e) {
                return error("TuneHub methods failed: " + e.message, 500);
            }
        }

        // === 通用请求代理（用于方法下发） ===
        if (path === "/api/tunehub/request" && request.method === "POST") {
            try {
                const { url: targetUrl, method, headers: reqHeaders, body: reqBody, params } = await request.json();

                if (!targetUrl) {
                    return error("缺少目标URL");
                }

                // 构建完整 URL（带参数）
                let fullUrl = targetUrl;
                if (params && Object.keys(params).length > 0) {
                    const urlObj = new URL(targetUrl);
                    for (const [key, value] of Object.entries(params)) {
                        urlObj.searchParams.set(key, value);
                    }
                    fullUrl = urlObj.toString();
                }

                const fetchOptions = {
                    method: method || "GET",
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        ...reqHeaders
                    }
                };

                if (reqBody && method === "POST") {
                    fetchOptions.body = typeof reqBody === "string" ? reqBody : JSON.stringify(reqBody);
                }

                const res = await fetch(fullUrl, fetchOptions);
                const text = await res.text();

                // 尝试解析为 JSON
                try {
                    const jsonData = JSON.parse(text);
                    return json({ success: true, data: jsonData });
                } catch {
                    return json({ success: true, data: text });
                }
            } catch (e) {
                return error("Request proxy failed: " + e.message, 500);
            }
        }

        // === allorigins 代理（用于 QQ 音乐等） ===
        if (path === "/api/allorigins" && request.method === "GET") {
            try {
                const targetUrl = url.searchParams.get("url");
                if (!targetUrl) return error("缺少目标URL");

                const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`);
                const text = await res.text();

                try {
                    const jsonData = JSON.parse(text);
                    return json(jsonData);
                } catch {
                    return new Response(text, { headers: corsHeaders });
                }
            } catch (e) {
                return error("Allorigins proxy failed: " + e.message, 500);
            }
        }

        // 4. SYNC API: Import Data (New)
        if (path === "/api/sync/import" && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);

            let { platform, id, playlists } = await request.json();

            if (!platform || !id || !Array.isArray(playlists)) {
                return error("Invalid data format");
            }

            try {
                // 1. Record Connection
                const existingConn = await env.DB.prepare("SELECT id FROM connected_accounts WHERE user_id = ? AND platform = ?").bind(userId, platform).first();
                if (existingConn) {
                    await env.DB.prepare("UPDATE connected_accounts SET external_user_id = ?, last_synced_at = ? WHERE id = ?").bind(id, Date.now(), existingConn.id).run();
                } else {
                    await env.DB.prepare("INSERT INTO connected_accounts (user_id, platform, external_user_id, last_synced_at) VALUES (?, ?, ?, ?)").bind(userId, platform, id, Date.now()).run();
                }

                // 2. Clear Old Synced Playlists Logic (Incremental Update)
                // Strategy: For each imported playlist, we clear only the "synced" songs (is_local_add=0), keeping manual adds.

                let importedCount = 0;

                for (const pl of playlists) {
                    // Check if playlist exists (by external_id + platform)
                    const existingPl = await env.DB.prepare("SELECT id FROM playlists WHERE user_id = ? AND platform = ? AND external_id = ?").bind(userId, platform, pl.id).first();

                    let plId;
                    if (existingPl) {
                        plId = existingPl.id;
                        // Delete old SYNCED songs only
                        await env.DB.prepare("DELETE FROM playlist_songs WHERE playlist_id = ? AND is_local_add = 0").bind(plId).run();
                        // Update name if changed? Maybe keep user's custom name if they renamed it? 
                        // Let's update name to reflect latest sync if needed, but usually we just keep ID.
                    } else {
                        // Create New - add platform prefix
                        const platformPrefixes = { netease: '网易:', qq: 'QQ:', kuwo: '酷我:' };
                        const prefix = platformPrefixes[platform] || (platform + ':');

                        // Robustly strip ALL possible old prefixes (repeating, mixed, spaces, wide colons)
                        let cleanName = pl.name;
                        const knownPrefixes = ['网易:', 'QQ:', '酷我:', 'netease:', 'qq:', 'kuwo:', '网易：', '酷我：', 'QQ：'];
                        let found = true;
                        while (found) {
                            found = false;
                            for (const p of knownPrefixes) {
                                if (cleanName.toLowerCase().startsWith(p.toLowerCase())) {
                                    cleanName = cleanName.slice(p.length).trim();
                                    found = true;
                                }
                            }
                        }

                        const prefixedName = prefix + cleanName;
                        const res = await env.DB.prepare(
                            "INSERT INTO playlists (user_id, name, is_sync, platform, external_id, can_delete, created_at) VALUES (?, ?, 1, ?, ?, 1, ?)" // can_delete=1 now
                        ).bind(userId, prefixedName, platform, pl.id, Date.now()).run();
                        plId = res.meta.last_row_id;
                    }

                    if (plId && Array.isArray(pl.tracks) && pl.tracks.length > 0) {
                        importedCount++;
                        // Batch insert
                        try {
                            const tracks = pl.tracks;
                            const now = Date.now();
                            const MAX_SONGS_PER_STMT = 25; // 100 parameters (D1 safe limit)
                            const batch = [];

                            for (let i = 0; i < tracks.length; i += MAX_SONGS_PER_STMT) {
                                const chunk = tracks.slice(i, i + MAX_SONGS_PER_STMT);
                                const placeholders = chunk.map(() => '(?, ?, 0, ?)').join(',');
                                const values = [];

                                chunk.forEach((s) => {
                                    const cleanSong = { ...s };
                                    delete cleanSong.url;
                                    if (typeof cleanSong.lrc === 'string' && cleanSong.lrc.startsWith('http')) delete cleanSong.lrc;
                                    values.push(plId, JSON.stringify(cleanSong), now);
                                });

                                batch.push(env.DB.prepare(`INSERT INTO playlist_songs (playlist_id, song_json, is_local_add, created_at) VALUES ${placeholders}`).bind(...values));
                            }

                            if (batch.length > 0) {
                                await env.DB.batch(batch);
                            }
                        } catch (e) {
                            console.error("Import songs batch error:", e);
                            throw new Error("保存歌曲数据失败 (D1 Batch Error)");
                        }
                    }
                }

                return json({ success: true, count: importedCount, message: "同步成功" });

            } catch (e) {
                return error("同步保存失败: " + e.message, 500);
            }
        }

        // 4. SYNC API: Digital ID Support (Deprecated but kept for backward compatibility if needed)
        if (path === "/api/sync" && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);

            let { platform, id, link } = await request.json();

            try {
                // A. Extract ID
                let externalId = id;
                if (!externalId && link) {
                    // Try to extract from link if id not provided
                    const match = link.match(/id=(\d+)/) || link.match(/(\d+)/);
                    if (match) externalId = match[1];
                }

                if (!externalId) return error("请输入有效的用户ID");

                // B. Map Platform to Meting Server Code
                const serverMap = {
                    'netease': 'netease',
                    'qq': 'tencent',
                    // 'migu': 'migu', // Migu disabled
                    'kuwo': 'kuwo'
                };
                const serverCode = serverMap[platform];
                if (!serverCode) return error("不支持的平台: " + platform);

                // C. Fetch Data
                let songsData = [];

                // Special handling for QQ using official API
                if (platform === 'qq') {
                    try {
                        const qqUrl = `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${externalId}&format=json`;
                        const res = await fetch(qqUrl, {
                            headers: {
                                "Referer": "https://y.qq.com/",
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                            }
                        });
                        const text = await res.text();
                        let json;
                        try {
                            json = JSON.parse(text);
                        } catch (e) {
                            console.error("QQ API Parse Error. Response:", text);
                            throw new Error("QQ API returned invalid JSON: " + text.substring(0, 100));
                        }
                        if (json.cdlist && json.cdlist[0] && json.cdlist[0].songlist) {
                            songsData = json.cdlist[0].songlist.map(item => ({
                                id: item.songmid, // Will be prefixed later
                                name: item.songname,
                                artist: item.singer ? item.singer.map(s => s.name).join('/') : 'Unknown',
                                album: item.albumname,
                                pic: item.albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${item.albummid}.jpg` : '',
                                url: '', // Not needed for DB
                                lrc: ''
                            }));
                        } else {
                            throw new Error("QQ Playlist not found or empty");
                        }
                    } catch (e) {
                        return error("QQ 导入失败: " + e.message, 500);
                    }
                } else {
                    // Try api.wuenci.com first for others
                    let metingUrl = `https://api.wuenci.com/meting/api/?type=playlist&id=${externalId}&server=${serverCode}`;
                    let metingRes = await fetch(metingUrl);
                    songsData = await metingRes.json().catch(() => null);

                    // If wuenci fails, try injahow
                    if (!songsData || songsData.error || !Array.isArray(songsData)) {
                        metingUrl = `https://api.injahow.cn/meting/?type=playlist&id=${externalId}&server=${serverCode}`;
                        metingRes = await fetch(metingUrl);
                        songsData = await metingRes.json().catch(() => null);
                    }
                }

                if (!songsData || !Array.isArray(songsData) || songsData.length === 0) {
                    return error("同步失败：未找到歌单或API暂时不可用。请检查ID是否正确，并确保歌单为公开状态。");
                }

                // D. Database Transaction

                // 1. Record Connection
                const existingConn = await env.DB.prepare("SELECT id FROM connected_accounts WHERE user_id = ? AND platform = ?").bind(userId, platform).first();
                if (existingConn) {
                    await env.DB.prepare("UPDATE connected_accounts SET external_user_id = ?, last_synced_at = ? WHERE id = ?").bind(externalId, Date.now(), existingConn.id).run();
                } else {
                    await env.DB.prepare("INSERT INTO connected_accounts (user_id, platform, external_user_id, last_synced_at) VALUES (?, ?, ?, ?)").bind(userId, platform, externalId, Date.now()).run();
                }

                // 2. Insert Playlists (Import Logic)
                const oldPls = await env.DB.prepare("SELECT id FROM playlists WHERE user_id = ? AND platform = ? AND is_sync = 1").bind(userId, platform).all();
                if (oldPls.results.length > 0) {
                    // Start transaction or prepared statements helper
                    // Here we just proceed. Optimized to batch or simple loop.
                }

                let importedCount = 0;
                // Import All Playlists (Unlimited, or reasonable limit. Meting usually returns all ~30-50).
                const playlistsToImport = metingData;

                for (const pl of playlistsToImport) {
                    // Insert Playlist
                    let plRes = await env.DB.prepare("SELECT id FROM playlists WHERE user_id = ? AND platform = ? AND external_id = ?").bind(userId, platform, pl.id).first();

                    // Helper
                    const getPlatformPrefix = (p) => {
                        if (p === 'netease') return '网易:';
                        if (p === 'qq') return 'QQ:';
                        if (p === 'kuwo') return '酷我:';
                        return p + ':';
                    };
                    const prefixedName = pl.name.startsWith(getPlatformPrefix(platform)) ? pl.name : getPlatformPrefix(platform) + pl.name;

                    if (!plRes) {
                        const res = await env.DB.prepare("INSERT INTO playlists (user_id, name, is_sync, platform, external_id, created_at) VALUES (?, ?, 1, ?, ?, ?)")
                            .bind(userId, prefixedName, platform, pl.id, Date.now()).run();
                        plRes = { id: res.meta.last_row_id };
                    } else {
                        // Update name
                        if (plRes.name !== prefixedName) {
                            await env.DB.prepare("UPDATE playlists SET name = ? WHERE id = ?").bind(prefixedName, plRes.id).run();
                        }
                    }
                    importedCount++;

                    // Sync Songs for this Playlist
                    // Check if we need to sync songs? Yes, always for import.

                    let songsData = [];
                    try {
                        if (platform === 'qq') {
                            // Use Verified QQ API
                            const qqUrl = `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${pl.id}&format=json`;
                            const res = await fetch(qqUrl, {
                                headers: {
                                    "Referer": "https://y.qq.com/",
                                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                                }
                            });
                            const json = await res.json();
                            if (json.cdlist && json.cdlist[0] && json.cdlist[0].songlist) {
                                songsData = json.cdlist[0].songlist.map(item => ({
                                    id: item.songmid,
                                    name: item.songname,
                                    artist: item.singer ? item.singer.map(s => s.name).join('/') : 'Unknown',
                                    album: item.albumname,
                                    pic: item.albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${item.albummid}.jpg` : '',
                                    url: '',
                                    lrc: ''
                                }));
                            }
                        } else if (platform === 'netease' || platform === 'kuwo') {
                            // Use Meting for others (Netease/Kuwo still okay mostly)
                            // Or use specific API if known. Meting is okay for Netease/Kuwo.
                            let metingUrl = `https://api.wuenci.com/meting/api/?type=playlist&id=${pl.id}&server=${serverCode}`;
                            let metingRes = await fetch(metingUrl);
                            const data = await metingRes.json().catch(() => null);
                            if (Array.isArray(data)) songsData = data;
                        }

                        // ... (rest of logic handles insert)
                    } catch (e) { console.error("Sync songs error", e); }

                    // 3. Insert All Songs (Single Statement Insert)
                    const MAX_INSERT_SIZE = 2000;
                    const now = Date.now();

                    for (let i = 0; i < songsData.length; i += MAX_INSERT_SIZE) {
                        const chunk = songsData.slice(i, i + MAX_INSERT_SIZE);
                        const placeholders = chunk.map(() => '(?, ?, 0, ?)').join(',');
                        const values = [];

                        chunk.forEach((s, idx) => {
                            const songObj = {
                                id: `${platform}-${s.id}`,
                                title: s.name,
                                artist: s.artist,
                                album: s.album,
                                cover: s.pic,
                                source: platform,
                                url: s.url,
                                lrc: s.lrc
                            };
                            const absoluteIndex = i + idx;
                            values.push(plRes.id, JSON.stringify(songObj), now);
                        });

                        if (values.length > 0) {
                            await env.DB.prepare(`INSERT INTO playlist_songs (playlist_id, song_json, is_local_add, created_at) VALUES ${placeholders}`)
                                .bind(...values)
                                .run();
                        }
                    }
                }

                return json({ success: true, count: importedCount, message: "同步成功" });

                return json({ success: true, count: importedCount, message: "同步成功" });

            } catch (e) {
                // Check for JSON parse error which usually means HTML response
                if (e.message.includes("Unexpected token") || e.message.includes("JSON")) {
                    return error("第三方接口暂时不可用 (API Error)，请稍后重试", 503);
                }
                return error("同步服务出错: " + e.message, 500);
            }
        }

        // 5. Playlists: List (Supports folder structure view)
        if (path === "/api/playlists" && request.method === "GET") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);

            const { results } = await env.DB.prepare(
                "SELECT * FROM playlists WHERE user_id = ? ORDER BY created_at DESC"
            ).bind(userId).all();

            const playlists = [];
            for (const pl of results) {
                // Fetch ALL songs for local/synced playlists (Order by ID ASC to follow insertion order)
                const { results: songs } = await env.DB.prepare(
                    "SELECT id, song_json FROM playlist_songs WHERE playlist_id = ? ORDER BY id ASC"
                ).bind(pl.id).all();

                playlists.push({
                    id: pl.id,
                    name: pl.name,
                    is_sync: !!pl.is_sync,
                    platform: pl.platform,
                    external_id: pl.external_id,
                    can_delete: !!pl.can_delete,
                    tracks: songs.map(s => {
                        const song = JSON.parse(s.song_json);
                        song.uid = s.id; // Add uid from table ID
                        song.is_local_add = !!s.is_local_add;
                        return song;
                    })
                });
            }

            return json(playlists);
        }

        if (path === "/api/playlists/sync" && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);
            const { platform, externalId, name, songs } = await request.json();
            if (!platform || !externalId || !Array.isArray(songs)) return error("数据格式无效");

            // 1. Check if playlist exists
            let pl = await env.DB.prepare("SELECT * FROM playlists WHERE user_id = ? AND platform = ? AND external_id = ?").bind(userId, platform, externalId).first();
            let playlistId;

            // Helper to get platform prefix
            const getPlatformPrefix = (p) => {
                if (p === 'netease') return '网易:';
                if (p === 'qq') return 'QQ:';
                if (p === 'kuwo') return '酷我:';
                return p + ':';
            };

            const getCleanedName = (raw) => {
                let n = raw;
                const knownPrefixes = ['网易:', 'QQ:', '酷我:', 'netease:', 'qq:', 'kuwo:', '网易：', '酷我：', 'QQ：'];
                let found = true;
                while (found) {
                    found = false;
                    for (const p of knownPrefixes) {
                        if (n.toLowerCase().startsWith(p.toLowerCase())) {
                            n = n.slice(p.length).trim();
                            found = true;
                        }
                    }
                }
                return n;
            };

            if (!pl) {
                const prefixedName = getPlatformPrefix(platform) + getCleanedName(name);
                const res = await env.DB.prepare("INSERT INTO playlists (user_id, name, is_sync, platform, external_id, created_at, can_delete) VALUES (?, ?, 1, ?, ?, ?, 1)")
                    .bind(userId, prefixedName, platform, externalId, Date.now()).run();
                playlistId = res.meta.last_row_id;
            } else {
                playlistId = pl.id;
                // Update name if changed (keep prefix, strip duplicates)
                const prefixedName = getPlatformPrefix(platform) + getCleanedName(name);
                if (pl.name !== prefixedName) {
                    await env.DB.prepare("UPDATE playlists SET name = ? WHERE id = ?").bind(prefixedName, playlistId).run();
                }
            }

            // 2. Full Replace Strategy using D1 Batch (Atomic)
            try {
                const now = Date.now();
                const MAX_SONGS_PER_STMT = 25;
                const batchStatements = [];

                // Add Delete Statement to batch
                batchStatements.push(env.DB.prepare("DELETE FROM playlist_songs WHERE playlist_id = ? AND is_local_add = 0").bind(playlistId));

                // Prepare Insert Statements
                let importedCount = 0;
                for (let i = 0; i < songs.length; i += MAX_SONGS_PER_STMT) {
                    const chunk = songs.slice(i, i + MAX_SONGS_PER_STMT);
                    const placeholders = chunk.map(() => '(?, ?, 0, ?)').join(',');
                    const values = [];

                    chunk.forEach((s) => {
                        const cleanSong = { ...s };
                        delete cleanSong.url;
                        if (typeof cleanSong.lrc === 'string' && cleanSong.lrc.startsWith('http')) delete cleanSong.lrc;

                        values.push(playlistId, JSON.stringify(cleanSong), now);
                        importedCount++;
                    });

                    batchStatements.push(env.DB.prepare(`INSERT INTO playlist_songs (playlist_id, song_json, is_local_add, created_at) VALUES ${placeholders}`).bind(...values));
                }

                // Execute ALL in a single transaction
                if (batchStatements.length > 0) {
                    await env.DB.batch(batchStatements);
                }

                return json({ success: true, count: importedCount, message: "同步完成 (全量覆盖)" });
            } catch (e) {
                console.error("Sync batch failed:", e);
                return error("同步数据库操作失败: " + e.message, 500);
            }
        }

        // 6. Playlists: Create/Delete/Update/Add Songs (Standard CRUD)
        if (path === "/api/playlists" && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);
            const { name } = await request.json();
            const res = await env.DB.prepare("INSERT INTO playlists (user_id, name, created_at) VALUES (?, ?, ?)")
                .bind(userId, name, Date.now()).run();
            return json({ success: true, id: res.meta.last_row_id, name });
        }

        // Add Song to Playlist
        const addSongMatch = path.match(/^\/api\/playlists\/(\d+)\/songs$/);
        if (addSongMatch && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);
            const plId = addSongMatch[1];
            const song = await request.json();

            // Verify playlist ownership
            const pl = await env.DB.prepare("SELECT * FROM playlists WHERE id = ?").bind(plId).first();
            if (!pl || pl.user_id !== userId) return error("无权限", 403);

            // Strip sensitive/temporary fields
            delete song.url;
            if (typeof song.lrc === 'string' && song.lrc.startsWith('http')) delete song.lrc;

            // Check duplicate
            const exists = await env.DB.prepare("SELECT id FROM playlist_songs WHERE playlist_id = ? AND json_extract(song_json, '$.id') = ?").bind(plId, song.id).first();
            if (exists) return error("歌曲已存在于歌单中");

            // INSERT with is_local_add = 1
            const res = await env.DB.prepare("INSERT INTO playlist_songs (playlist_id, song_json, is_local_add, created_at) VALUES (?, ?, 1, ?)").bind(plId, JSON.stringify(song), Date.now()).run();
            return json({ success: true, id: res.meta.last_row_id });
        }

        // Batch Add Songs to Playlist
        const batchAddSongsMatch = path.match(/^\/api\/playlists\/batch-songs$/);
        if (batchAddSongsMatch && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);
            const { playlistId, songs } = await request.json();
            if (!playlistId || !Array.isArray(songs)) return error("数据格式无效");

            // Verify playlist ownership
            const pl = await env.DB.prepare("SELECT * FROM playlists WHERE id = ?").bind(playlistId).first();
            if (!pl || pl.user_id !== userId) return error("无权限", 403);

            // Prepare batch insert
            const stmt = env.DB.prepare("INSERT INTO playlist_songs (playlist_id, song_json, is_local_add, created_at) VALUES (?, ?, 1, ?)");

            // Check existing songs to avoid duplicates in batch
            // (For large batches, we might skip checking all or do a bulk check. Here simplified.)
            const { results: existing } = await env.DB.prepare("SELECT json_extract(song_json, '$.id') as sid FROM playlist_songs WHERE playlist_id = ?").bind(playlistId).all();
            const existingIds = new Set(existing.map(r => r.sid));

            let addedCount = 0;
            const CHUNK_SIZE = 20;

            for (let i = 0; i < songs.length; i += CHUNK_SIZE) {
                const chunk = songs.slice(i, i + CHUNK_SIZE);
                const currentBatch = [];
                for (const s of chunk) {
                    if (!existingIds.has(s.id)) {
                        // Strip sensitive/temporary fields
                        const cleanSong = { ...s };
                        delete cleanSong.url;
                        if (typeof cleanSong.lrc === 'string' && cleanSong.lrc.startsWith('http')) delete cleanSong.lrc;

                        currentBatch.push(stmt.bind(playlistId, JSON.stringify(cleanSong), Date.now() - (i + currentBatch.length)));
                        addedCount++;
                        existingIds.add(s.id); // Prevent dups within same batch
                    }
                }
                if (currentBatch.length > 0) await env.DB.batch(currentBatch);
            }

            return json({ success: true, count: addedCount });
        }

        // remove song from playlist
        const removeSongMatch = path.match(/^\/api\/playlists\/(\d+)\/songs$/);
        if (removeSongMatch && request.method === "DELETE") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);
            const plId = removeSongMatch[1];
            const { uid } = await request.json(); // song uid (or id)

            // Check permission
            const pl = await env.DB.prepare("SELECT * FROM playlists WHERE id = ?").bind(plId).first();
            if (!pl || pl.user_id !== userId) return error("无权限", 403);

            // Delete by row ID (id column)
            // Frontend sends the database row ID as 'uid'
            await env.DB.prepare("DELETE FROM playlist_songs WHERE playlist_id = ? AND id = ?").bind(plId, uid).run();
            return json({ success: true });
        }

        // Delete Playlist
        const deletePlMatch = path.match(/^\/api\/playlists\/(\d+)$/);
        if (deletePlMatch && request.method === "DELETE") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);
            const plId = deletePlMatch[1];
            // Check permission
            const pl = await env.DB.prepare("SELECT * FROM playlists WHERE id = ?").bind(plId).first();
            if (!pl || pl.user_id !== userId) return error("无权限", 403);
            // if (pl.can_delete === 0) return error("无法删除同步歌单", 403); // REMOVED RESTRICTION

            await env.DB.prepare("DELETE FROM playlist_songs WHERE playlist_id = ?").bind(plId).run();
            await env.DB.prepare("DELETE FROM playlists WHERE id = ?").bind(plId).run();
            return json({ success: true });
        }

        // Rename Playlist
        const renamePlMatch = path.match(/^\/api\/playlists\/(\d+)$/);
        if (renamePlMatch && request.method === "PUT") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);
            const plId = renamePlMatch[1];
            const { name } = await request.json();
            if (!name) return error("请输入名称");

            // Check permission
            const pl = await env.DB.prepare("SELECT * FROM playlists WHERE id = ?").bind(plId).first();
            if (!pl || pl.user_id !== userId) return error("无权限", 403);

            await env.DB.prepare("UPDATE playlists SET name = ? WHERE id = ?").bind(name, plId).run();
            return json({ success: true });
        }


        // 7. Favorites: CRUD
        if (path === "/api/favorites" && request.method === "GET") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);
            const { results } = await env.DB.prepare("SELECT song_json FROM favorites WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all();
            return json(results.map(r => JSON.parse(r.song_json)));
        }
        if (path === "/api/favorites" && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);
            const song = await request.json();
            // Strip sensitive/temporary fields
            delete song.url;
            if (typeof song.lrc === 'string' && song.lrc.startsWith('http')) delete song.lrc;

            // Check dupe
            const exists = await env.DB.prepare("SELECT id FROM favorites WHERE user_id = ? AND json_extract(song_json, '$.id') = ?").bind(userId, song.id).first();
            if (exists) return json({ success: true, message: "Already favorite" });

            await env.DB.prepare("INSERT INTO favorites (user_id, song_json, created_at) VALUES (?, ?, ?)").bind(userId, JSON.stringify(song), Date.now()).run();
            return json({ success: true });
        }
        if (path === "/api/favorites" && request.method === "DELETE") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);
            const { id } = await request.json(); // song id
            await env.DB.prepare("DELETE FROM favorites WHERE user_id = ? AND json_extract(song_json, '$.id') = ?").bind(userId, id).run();
            return json({ success: true });
        }

        // Batch Add Favorites
        if (path === "/api/favorites/batch" && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);
            const { songs } = await request.json();
            if (!Array.isArray(songs)) return error("数据格式无效");

            const { results: existingFavs } = await env.DB.prepare("SELECT json_extract(song_json, '$.id') as songId FROM favorites WHERE user_id = ?").bind(userId).all();
            const existingIds = new Set(existingFavs.map(r => r.songId));

            const stmt = env.DB.prepare("INSERT INTO favorites (user_id, song_json, created_at) VALUES (?, ?, ?)");

            const CHUNK_SIZE = 20;
            let addedCount = 0;
            for (let i = 0; i < songs.length; i += CHUNK_SIZE) {
                const chunk = songs.slice(i, i + CHUNK_SIZE);
                const currentBatch = [];
                for (const s of chunk) {
                    if (!existingIds.has(s.id)) {
                        // Strip fields
                        const clean = { ...s };
                        delete clean.url;
                        if (typeof clean.lrc === 'string' && clean.lrc.startsWith('http')) delete clean.lrc;

                        currentBatch.push(stmt.bind(userId, JSON.stringify(clean), Date.now() - (i + currentBatch.length)));
                        addedCount++;
                        existingIds.add(s.id);
                    }
                }
                if (currentBatch.length > 0) await env.DB.batch(currentBatch);
            }

            return json({ success: true, count: addedCount });
        }

        // Batch Delete Favorites
        if (path === "/api/favorites/batch" && request.method === "DELETE") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);
            const { ids } = await request.json();
            if (!Array.isArray(ids)) return error("数据格式无效");

            // Delete all matching songs (silently ignore non-existent)
            for (const id of ids) {
                await env.DB.prepare("DELETE FROM favorites WHERE user_id = ? AND json_extract(song_json, '$.id') = ?").bind(userId, id).run();
            }
            return json({ success: true, count: ids.length });
        }

        // Batch Delete Songs from Playlist
        const batchDeleteSongsMatch = path.match(/^\/api\/playlists\/(\d+)\/songs\/batch$/);
        if (batchDeleteSongsMatch && request.method === "DELETE") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);
            const plId = batchDeleteSongsMatch[1];
            const { uids } = await request.json();
            if (!Array.isArray(uids)) return error("数据格式无效");

            // Verify playlist ownership
            const pl = await env.DB.prepare("SELECT * FROM playlists WHERE id = ?").bind(plId).first();
            if (!pl || pl.user_id !== userId) return error("无权限", 403);

            // Delete all matching songs by uid
            for (const uid of uids) {
                await env.DB.prepare("DELETE FROM playlist_songs WHERE playlist_id = ? AND id = ?").bind(plId, uid).run();
            }
            return json({ success: true, count: uids.length });
        }

        // 8. Play History (With strict limit 100)
        if (path === "/api/history" && request.method === "GET") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);
            const { results } = await env.DB.prepare("SELECT id, song_json FROM play_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 100").bind(userId).all();
            return json(results.map(r => {
                const song = JSON.parse(r.song_json);
                song.uid = r.id;  // Add uid for deletion
                return song;
            }));
        }
        if (path === "/api/history" && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);
            const song = await request.json();
            // Strip sensitive/temporary fields
            delete song.url;
            if (typeof song.lrc === 'string' && song.lrc.startsWith('http')) delete song.lrc;

            await env.DB.prepare("INSERT INTO play_history (user_id, song_json, played_at) VALUES (?, ?, ?)").bind(userId, JSON.stringify(song), Date.now()).run();

            // Cleanup: Keep only recent 100
            await env.DB.prepare("DELETE FROM play_history WHERE user_id = ? AND id NOT IN (SELECT id FROM play_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 100)").bind(userId, userId).run();

            return json({ success: true });
        }

        // Batch Delete History
        if (path === "/api/history/batch" && request.method === "DELETE") {
            const userId = getUserId();
            if (!userId) return error("未登录", 401);
            const { ids } = await request.json();
            if (!Array.isArray(ids)) return error("数据格式无效");

            // Delete all matching history by song id
            for (const id of ids) {
                await env.DB.prepare("DELETE FROM play_history WHERE user_id = ? AND json_extract(song_json, '$.id') = ?").bind(userId, id).run();
            }
            return json({ success: true, count: ids.length });
        }

        // 9. Audio Proxy (CORS Bypass) with Caching
        if (path === "/api/proxy" && request.method === "GET") {
            try {
                const targetUrl = url.searchParams.get("url");
                if (!targetUrl) return error("缺少目标URL");

                // Use Cloudflare Cache API for better performance
                const cache = caches.default;
                const cacheKey = new Request(request.url, request);

                // Try to get cached response first
                let cachedResponse = await cache.match(cacheKey);
                if (cachedResponse) {
                    // Return cached response with CORS headers
                    const newHeaders = new Headers(cachedResponse.headers);
                    // 允许所有来源访问代理音频（修复跨域播放问题）
                    newHeaders.set("Access-Control-Allow-Origin", "*");
                    newHeaders.set("X-Cache", "HIT");
                    return new Response(cachedResponse.body, {
                        status: cachedResponse.status,
                        headers: newHeaders
                    });
                }

                // Fetch from origin
                const res = await fetch(targetUrl, {
                    headers: {
                        "User-Agent": request.headers.get("User-Agent") || "Mozilla/5.0",
                        "Referer": new URL(targetUrl).origin
                    }
                });

                // Only cache successful responses
                if (res.ok) {
                    // Clone response for caching
                    const responseToCache = res.clone();

                    // Get original headers and inject CORS + cache control
                    const newHeaders = new Headers(res.headers);
                    newHeaders.set("Access-Control-Allow-Origin", "*");
                    newHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
                    newHeaders.set("Cache-Control", "public, max-age=3600"); // 1 hour cache
                    newHeaders.set("X-Cache", "MISS");
                    newHeaders.delete("set-cookie");

                    const finalResponse = new Response(res.body, {
                        status: res.status,
                        statusText: res.statusText,
                        headers: newHeaders
                    });

                    // Store in cache (don't await, fire and forget)
                    const cacheHeaders = new Headers(responseToCache.headers);
                    cacheHeaders.set("Cache-Control", "public, max-age=3600");
                    cacheHeaders.delete("set-cookie");

                    const cacheableResponse = new Response(responseToCache.body, {
                        status: responseToCache.status,
                        headers: cacheHeaders
                    });

                    // Use waitUntil if available (in event context)
                    try {
                        // env.waitUntil(cache.put(cacheKey, cacheableResponse));
                         // 注意：如果 env.waitUntil 不可用，直接调用 cache.put 可能会报错，这里加个 try catch 忽略
                         // 在 Module Worker 中通常使用 ctx.waitUntil，这里为了兼容代码没有 ctx，直接忽略 promise
                         cache.put(cacheKey, cacheableResponse).catch(() => {});
                    } catch (e) {
                        // Ignore cache errors
                    }

                    return finalResponse;
                }

                // Non-OK response, return as-is with CORS
                const newHeaders = new Headers(res.headers);
                newHeaders.set("Access-Control-Allow-Origin", "*");
                newHeaders.delete("set-cookie");

                return new Response(res.body, {
                    status: res.status,
                    statusText: res.statusText,
                    headers: newHeaders
                });
            } catch (e) {
                return error("Proxy failed: " + e.message, 500);
            }
        }

        return error("API Not Found", 404);
    },
};
