-- 音乐广场数据库建表语句
-- 数据库名：musicsguare_db

-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 用户歌单表
CREATE TABLE IF NOT EXISTS user_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    cover_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. 歌单歌曲关联表
CREATE TABLE IF NOT EXISTS playlist_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    track_id VARCHAR(100) NOT NULL, -- 歌曲唯一标识，格式: source-songid
    source VARCHAR(20) NOT NULL, -- 音乐源: migu, netease, qq, kuwo
    title VARCHAR(200) NOT NULL,
    artist VARCHAR(200),
    album VARCHAR(200),
    cover_url TEXT,
    audio_url TEXT,
    lrc_url TEXT,
    quality VARCHAR(20), -- normal, lossless
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (playlist_id) REFERENCES user_playlists(id) ON DELETE CASCADE
);

-- 4. 用户收藏表
CREATE TABLE IF NOT EXISTS user_favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    track_id VARCHAR(100) NOT NULL,
    source VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    artist VARCHAR(200),
    album VARCHAR(200),
    cover_url TEXT,
    audio_url TEXT,
    lrc_url TEXT,
    quality VARCHAR(20),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, track_id)
);

-- 5. 同步平台表
CREATE TABLE IF NOT EXISTS sync_platforms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    platform VARCHAR(20) NOT NULL, -- qq, netease, migu, kuwo
    platform_user_id VARCHAR(100), -- 平台用户ID
    platform_username VARCHAR(100), -- 平台用户名
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP,
    sync_favorites BOOLEAN DEFAULT 1,
    sync_playlists BOOLEAN DEFAULT 1,
    last_sync_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, platform)
);

-- 6. 平台同步歌单表
CREATE TABLE IF NOT EXISTS sync_platform_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_platform_id INTEGER NOT NULL,
    platform_playlist_id VARCHAR(100) NOT NULL, -- 平台歌单ID
    name VARCHAR(200) NOT NULL,
    description TEXT,
    cover_url TEXT,
    track_count INTEGER DEFAULT 0,
    last_sync_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sync_platform_id) REFERENCES sync_platforms(id) ON DELETE CASCADE,
    UNIQUE(sync_platform_id, platform_playlist_id)
);

-- 7. 平台同步收藏表
CREATE TABLE IF NOT EXISTS sync_platform_favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_platform_id INTEGER NOT NULL,
    platform_track_id VARCHAR(100) NOT NULL, -- 平台歌曲ID
    title VARCHAR(200) NOT NULL,
    artist VARCHAR(200),
    album VARCHAR(200),
    cover_url TEXT,
    audio_url TEXT,
    lrc_url TEXT,
    quality VARCHAR(20),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sync_platform_id) REFERENCES sync_platforms(id) ON DELETE CASCADE,
    UNIQUE(sync_platform_id, platform_track_id)
);

-- 8. 搜索历史表
CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    keyword VARCHAR(100) NOT NULL,
    source VARCHAR(20), -- 搜索时使用的音乐源
    search_count INTEGER DEFAULT 1,
    last_searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, keyword)
);

-- 创建索引以提高查询性能
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_user_playlists_user_id ON user_playlists(user_id);
CREATE INDEX idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id);
CREATE INDEX idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX idx_sync_platforms_user_id ON sync_platforms(user_id);
CREATE INDEX idx_sync_platform_playlists_sync_id ON sync_platform_playlists(sync_platform_id);
CREATE INDEX idx_sync_platform_favorites_sync_id ON sync_platform_favorites(sync_platform_id);
CREATE INDEX idx_search_history_user_id ON search_history(user_id);
CREATE INDEX idx_search_history_keyword ON search_history(keyword);

-- 创建触发器用于更新时间戳
CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
AFTER UPDATE ON users 
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_user_playlists_timestamp 
AFTER UPDATE ON user_playlists 
BEGIN
    UPDATE user_playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_sync_platforms_timestamp 
AFTER UPDATE ON sync_platforms 
BEGIN
    UPDATE sync_platforms SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_sync_platform_playlists_timestamp 
AFTER UPDATE ON sync_platform_playlists 
BEGIN
    UPDATE sync_platform_playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;