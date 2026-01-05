/*
  # MusicSquare数据库架构
  
  1. 新建表
    - `users` - 用户表
      - `id` (uuid, 主键) 
      - `username` (text, 唯一) - 用户名
      - `password_hash` (text) - 密码哈希
      - `avatar_url` (text) - 头像URL
      - `created_at` (timestamptz) - 创建时间
      
    - `playlists` - 歌单表
      - `id` (uuid, 主键)
      - `user_id` (uuid, 外键) - 用户ID
      - `name` (text) - 歌单名称
      - `is_default` (boolean) - 是否为默认收藏
      - `cover_url` (text) - 歌单封面
      - `created_at` (timestamptz) - 创建时间
      
    - `playlist_songs` - 歌单歌曲表
      - `id` (uuid, 主键)
      - `playlist_id` (uuid, 外键) - 歌单ID
      - `song_id` (text) - 歌曲ID
      - `song_data` (jsonb) - 歌曲完整数据
      - `sort_order` (integer) - 排序
      - `created_at` (timestamptz) - 添加时间
      
    - `play_history` - 播放历史表
      - `id` (uuid, 主键)
      - `user_id` (uuid, 外键) - 用户ID
      - `song_id` (text) - 歌曲ID
      - `song_data` (jsonb) - 歌曲数据
      - `played_at` (timestamptz) - 播放时间
      
    - `platform_sync` - 平台同步配置表
      - `id` (uuid, 主键)
      - `user_id` (uuid, 外键) - 用户ID
      - `platform` (text) - 平台名称(migu/netease/qq/kuwo)
      - `credentials` (jsonb) - 登录凭证
      - `sync_enabled` (boolean) - 是否启用同步
      - `last_sync_at` (timestamptz) - 最后同步时间
      
    - `synced_playlists` - 同步的歌单表
      - `id` (uuid, 主键)
      - `user_id` (uuid, 外键) - 用户ID
      - `platform` (text) - 平台名称
      - `platform_playlist_id` (text) - 平台歌单ID
      - `name` (text) - 歌单名称
      - `cover_url` (text) - 封面URL
      - `songs` (jsonb) - 歌曲列表
      - `synced_at` (timestamptz) - 同步时间
      
    - `user_settings` - 用户设置表
      - `id` (uuid, 主键)
      - `user_id` (uuid, 外键) - 用户ID
      - `theme` (text) - 主题(light/dark)
      - `default_source` (text) - 默认音乐源
      - `play_mode` (text) - 播放模式(list/random/single)
      - `settings` (jsonb) - 其他设置
      
  2. 安全性
    - 为所有表启用RLS
    - 用户只能访问自己的数据
    - 密码使用bcrypt加密
*/

-- 创建users表
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  avatar_url text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- 创建playlists表
CREATE TABLE IF NOT EXISTS playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean DEFAULT false,
  cover_url text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- 创建playlist_songs表
CREATE TABLE IF NOT EXISTS playlist_songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  song_id text NOT NULL,
  song_data jsonb NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 创建play_history表
CREATE TABLE IF NOT EXISTS play_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id text NOT NULL,
  song_data jsonb NOT NULL,
  played_at timestamptz DEFAULT now()
);

-- 创建platform_sync表
CREATE TABLE IF NOT EXISTS platform_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  credentials jsonb DEFAULT '{}',
  sync_enabled boolean DEFAULT false,
  last_sync_at timestamptz,
  UNIQUE(user_id, platform)
);

-- 创建synced_playlists表
CREATE TABLE IF NOT EXISTS synced_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  platform_playlist_id text NOT NULL,
  name text NOT NULL,
  cover_url text DEFAULT '',
  songs jsonb DEFAULT '[]',
  synced_at timestamptz DEFAULT now(),
  UNIQUE(user_id, platform, platform_playlist_id)
);

-- 创建user_settings表
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme text DEFAULT 'light',
  default_source text DEFAULT 'netease',
  play_mode text DEFAULT 'list',
  settings jsonb DEFAULT '{}'
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist_id ON playlist_songs(playlist_id);
CREATE INDEX IF NOT EXISTS idx_play_history_user_id ON play_history(user_id);
CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_sync_user_id ON platform_sync(user_id);
CREATE INDEX IF NOT EXISTS idx_synced_playlists_user_id ON synced_playlists(user_id);

-- 启用RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE play_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- users表策略
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- playlists表策略
CREATE POLICY "Users can view own playlists"
  ON playlists FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own playlists"
  ON playlists FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own playlists"
  ON playlists FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own playlists"
  ON playlists FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- playlist_songs表策略
CREATE POLICY "Users can view songs in own playlists"
  ON playlist_songs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM playlists
    WHERE playlists.id = playlist_songs.playlist_id
    AND playlists.user_id = auth.uid()
  ));

CREATE POLICY "Users can add songs to own playlists"
  ON playlist_songs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM playlists
    WHERE playlists.id = playlist_songs.playlist_id
    AND playlists.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete songs from own playlists"
  ON playlist_songs FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM playlists
    WHERE playlists.id = playlist_songs.playlist_id
    AND playlists.user_id = auth.uid()
  ));

-- play_history表策略
CREATE POLICY "Users can view own play history"
  ON play_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own play history"
  ON play_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own play history"
  ON play_history FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- platform_sync表策略
CREATE POLICY "Users can view own platform sync"
  ON platform_sync FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own platform sync"
  ON platform_sync FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own platform sync"
  ON platform_sync FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own platform sync"
  ON platform_sync FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- synced_playlists表策略
CREATE POLICY "Users can view own synced playlists"
  ON synced_playlists FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own synced playlists"
  ON synced_playlists FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own synced playlists"
  ON synced_playlists FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own synced playlists"
  ON synced_playlists FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- user_settings表策略
CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
