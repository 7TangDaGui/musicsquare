// Cloudflare Workers API - 音乐广场完整后端
// 文件名：index.js
// 部署到：https://yunduanyingyue.tmichi1001.workers.dev/

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };

    // Handle preflight requests
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      // 数据库连接
      const db = env.DB;

      // 路由处理
      if (path === '/api/health' && method === 'GET') {
        return new Response(JSON.stringify({ 
          status: 'ok', 
          service: 'MusicSquare API',
          version: '1.0.0',
          timestamp: new Date().toISOString() 
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // 用户认证相关路由
      if (path === '/api/auth/register' && method === 'POST') {
        return await handleRegister(request, db, corsHeaders);
      }

      if (path === '/api/auth/login' && method === 'POST') {
        return await handleLogin(request, db, corsHeaders);
      }

      if (path === '/api/auth/logout' && method === 'POST') {
        return await handleLogout(request, db, corsHeaders);
      }

      if (path === '/api/auth/me' && method === 'GET') {
        return await handleGetCurrentUser(request, db, corsHeaders);
      }

      if (path === '/api/auth/update-avatar' && method === 'PUT') {
        return await handleUpdateAvatar(request, db, corsHeaders);
      }

      // 需要认证的路由
      const authResult = await authenticate(request, db);
      if (!authResult.authenticated) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      const userId = authResult.userId;

      // 歌单管理路由
      if (path === '/api/playlists' && method === 'GET') {
        return await handleGetPlaylists(request, db, userId, corsHeaders);
      }

      if (path === '/api/playlists' && method === 'POST') {
        return await handleCreatePlaylist(request, db, userId, corsHeaders);
      }

      if (path.startsWith('/api/playlists/') && method === 'GET') {
        const playlistId = path.split('/')[3];
        return await handleGetPlaylist(request, db, userId, playlistId, corsHeaders);
      }

      if (path.startsWith('/api/playlists/') && method === 'PUT') {
        const playlistId = path.split('/')[3];
        return await handleUpdatePlaylist(request, db, userId, playlistId, corsHeaders);
      }

      if (path.startsWith('/api/playlists/') && method === 'DELETE') {
        const playlistId = path.split('/')[3];
        return await handleDeletePlaylist(request, db, userId, playlistId, corsHeaders);
      }

      // 歌单歌曲管理
      if (path.startsWith('/api/playlists/') && path.endsWith('/tracks') && method === 'GET') {
        const playlistId = path.split('/')[3];
        return await handleGetPlaylistTracks(request, db, userId, playlistId, corsHeaders);
      }

      if (path.startsWith('/api/playlists/') && path.endsWith('/tracks') && method === 'POST') {
        const playlistId = path.split('/')[3];
        return await handleAddTrackToPlaylist(request, db, userId, playlistId, corsHeaders);
      }

      if (path.startsWith('/api/playlists/') && path.includes('/tracks/') && method === 'DELETE') {
        const parts = path.split('/');
        const playlistId = parts[3];
        const trackId = parts[5];
        return await handleRemoveTrackFromPlaylist(request, db, userId, playlistId, trackId, corsHeaders);
      }

      // 收藏管理路由
      if (path === '/api/favorites' && method === 'GET') {
        return await handleGetFavorites(request, db, userId, corsHeaders);
      }

      if (path === '/api/favorites' && method === 'POST') {
        return await handleAddFavorite(request, db, userId, corsHeaders);
      }

      if (path.startsWith('/api/favorites/') && method === 'DELETE') {
        const trackId = path.split('/')[3];
        return await handleRemoveFavorite(request, db, userId, trackId, corsHeaders);
      }

      if (path === '/api/favorites/check' && method === 'POST') {
        return await handleCheckFavorite(request, db, userId, corsHeaders);
      }

      // 同步平台管理
      if (path === '/api/sync/platforms' && method === 'GET') {
        return await handleGetSyncPlatforms(request, db, userId, corsHeaders);
      }

      if (path === '/api/sync/platforms' && method === 'POST') {
        return await handleAddSyncPlatform(request, db, userId, corsHeaders);
      }

      if (path.startsWith('/api/sync/platforms/') && method === 'DELETE') {
        const platformId = path.split('/')[4];
        return await handleRemoveSyncPlatform(request, db, userId, platformId, corsHeaders);
      }

      if (path.startsWith('/api/sync/platforms/') && path.endsWith('/sync') && method === 'POST') {
        const platformId = path.split('/')[4];
        return await handleSyncPlatformData(request, db, userId, platformId, corsHeaders);
      }

      // 搜索历史
      if (path === '/api/search/history' && method === 'GET') {
        return await handleGetSearchHistory(request, db, userId, corsHeaders);
      }

      if (path === '/api/search/history' && method === 'POST') {
        return await handleAddSearchHistory(request, db, userId, corsHeaders);
      }

      if (path === '/api/search/history/clear' && method === 'DELETE') {
        return await handleClearSearchHistory(request, db, userId, corsHeaders);
      }

      // 热门搜索
      if (path === '/api/search/hot' && method === 'GET') {
        return await handleGetHotSearches(request, db, corsHeaders);
      }

      // 音乐源测试
      if (path === '/api/sources/test' && method === 'POST') {
        return await handleTestMusicSources(request, corsHeaders);
      }

      // 音乐搜索代理
      if (path === '/api/music/search' && method === 'GET') {
        return await handleMusicSearch(request, corsHeaders);
      }

      // 未找到路由
      return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });

    } catch (error) {
      console.error('API Error:', error);
      return new Response(JSON.stringify({ 
        error: 'Internal Server Error', 
        details: error.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};

// ============ 工具函数 ============

// 用户认证函数
async function authenticate(request, db) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false };
  }

  const token = authHeader.substring(7);
  
  try {
    const userId = parseInt(token);
    
    if (isNaN(userId)) {
      return { authenticated: false };
    }

    // 验证用户是否存在
    const user = await db.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
    if (!user) {
      return { authenticated: false };
    }

    return { authenticated: true, userId };
  } catch (error) {
    console.error('Authentication error:', error);
    return { authenticated: false };
  }
}

// 密码哈希函数
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'music-square-salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============ 用户认证处理函数 ============

async function handleRegister(request, db, corsHeaders) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'Username and password are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 检查用户名是否已存在
    const existingUser = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
    if (existingUser) {
      return new Response(JSON.stringify({ error: 'Username already exists' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 哈希密码
    const passwordHash = await hashPassword(password);

    // 创建用户
    const result = await db.prepare(
      'INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id, username, created_at'
    ).bind(username, passwordHash).run();

    const user = result.results[0];

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        created_at: user.created_at
      },
      token: user.id.toString()
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Register error:', error);
    return new Response(JSON.stringify({ error: 'Registration failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleLogin(request, db, corsHeaders) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'Username and password are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 获取用户信息
    const user = await db.prepare(
      'SELECT id, username, password_hash, avatar_url FROM users WHERE username = ?'
    ).bind(username).first();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 验证密码
    const passwordHash = await hashPassword(password);
    if (passwordHash !== user.password_hash) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        avatar_url: user.avatar_url
      },
      token: user.id.toString()
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Login error:', error);
    return new Response(JSON.stringify({ error: 'Login failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleLogout(request, db, corsHeaders) {
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function handleGetCurrentUser(request, db, corsHeaders) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const token = authHeader.substring(7);
  const userId = parseInt(token);

  try {
    const user = await db.prepare(
      'SELECT id, username, avatar_url, created_at FROM users WHERE id = ?'
    ).bind(userId).first();

    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
        created_at: user.created_at
      }
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Get user error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get user' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleUpdateAvatar(request, db, corsHeaders) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const token = authHeader.substring(7);
  const userId = parseInt(token);

  try {
    const body = await request.json();
    const { avatar_url } = body;

    if (!avatar_url) {
      return new Response(JSON.stringify({ error: 'Avatar URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    await db.prepare(
      'UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(avatar_url, userId).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Avatar updated successfully',
      avatar_url
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Update avatar error:', error);
    return new Response(JSON.stringify({ error: 'Failed to update avatar' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}// ============ 歌单管理处理函数 ============

async function handleGetPlaylists(request, db, userId, corsHeaders) {
  try {
    const { results } = await db.prepare(`
      SELECT 
        id, name, description, cover_url, 
        created_at, updated_at,
        (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = user_playlists.id) as track_count
      FROM user_playlists 
      WHERE user_id = ? 
      ORDER BY updated_at DESC
    `).bind(userId).all();

    return new Response(JSON.stringify({
      success: true,
      playlists: results
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Get playlists error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get playlists' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleCreatePlaylist(request, db, userId, corsHeaders) {
  try {
    const body = await request.json();
    const { name, description, cover_url } = body;

    if (!name) {
      return new Response(JSON.stringify({ error: 'Playlist name is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const result = await db.prepare(
      'INSERT INTO user_playlists (user_id, name, description, cover_url) VALUES (?, ?, ?, ?) RETURNING *'
    ).bind(userId, name, description || null, cover_url || null).run();

    const playlist = result.results[0];

    return new Response(JSON.stringify({
      success: true,
      playlist: {
        ...playlist,
        track_count: 0
      },
      message: 'Playlist created successfully'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Create playlist error:', error);
    return new Response(JSON.stringify({ error: 'Failed to create playlist' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleGetPlaylist(request, db, userId, playlistId, corsHeaders) {
  try {
    const playlist = await db.prepare(`
      SELECT 
        id, name, description, cover_url, 
        created_at, updated_at,
        (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?) as track_count
      FROM user_playlists 
      WHERE id = ? AND user_id = ?
    `).bind(playlistId, playlistId, userId).first();

    if (!playlist) {
      return new Response(JSON.stringify({ error: 'Playlist not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      playlist
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Get playlist error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get playlist' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleUpdatePlaylist(request, db, userId, playlistId, corsHeaders) {
  try {
    const body = await request.json();
    const { name, description, cover_url } = body;

    // 检查歌单是否存在且属于该用户
    const existingPlaylist = await db.prepare(
      'SELECT id FROM user_playlists WHERE id = ? AND user_id = ?'
    ).bind(playlistId, userId).first();

    if (!existingPlaylist) {
      return new Response(JSON.stringify({ error: 'Playlist not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 构建更新语句
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }

    if (cover_url !== undefined) {
      updates.push('cover_url = ?');
      values.push(cover_url);
    }

    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: 'No fields to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(playlistId, userId);

    const query = `UPDATE user_playlists SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`;
    
    await db.prepare(query).bind(...values).run();

    // 获取更新后的歌单信息
    const updatedPlaylist = await db.prepare(`
      SELECT 
        id, name, description, cover_url, 
        created_at, updated_at,
        (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?) as track_count
      FROM user_playlists 
      WHERE id = ? AND user_id = ?
    `).bind(playlistId, playlistId, userId).first();

    return new Response(JSON.stringify({
      success: true,
      playlist: updatedPlaylist,
      message: 'Playlist updated successfully'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Update playlist error:', error);
    return new Response(JSON.stringify({ error: 'Failed to update playlist' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleDeletePlaylist(request, db, userId, playlistId, corsHeaders) {
  try {
    // 检查歌单是否存在且属于该用户
    const existingPlaylist = await db.prepare(
      'SELECT id FROM user_playlists WHERE id = ? AND user_id = ?'
    ).bind(playlistId, userId).first();

    if (!existingPlaylist) {
      return new Response(JSON.stringify({ error: 'Playlist not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 删除歌单（级联删除歌单中的歌曲）
    await db.prepare('DELETE FROM user_playlists WHERE id = ? AND user_id = ?')
      .bind(playlistId, userId).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Playlist deleted successfully'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Delete playlist error:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete playlist' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleGetPlaylistTracks(request, db, userId, playlistId, corsHeaders) {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // 检查歌单是否存在且属于该用户
    const playlist = await db.prepare(
      'SELECT id FROM user_playlists WHERE id = ? AND user_id = ?'
    ).bind(playlistId, userId).first();

    if (!playlist) {
      return new Response(JSON.stringify({ error: 'Playlist not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 获取歌曲总数
    const totalResult = await db.prepare(
      'SELECT COUNT(*) as total FROM playlist_tracks WHERE playlist_id = ?'
    ).bind(playlistId).first();

    const total = totalResult.total || 0;

    // 获取分页歌曲
    const { results } = await db.prepare(`
      SELECT * FROM playlist_tracks 
      WHERE playlist_id = ? 
      ORDER BY added_at DESC
      LIMIT ? OFFSET ?
    `).bind(playlistId, limit, offset).all();

    return new Response(JSON.stringify({
      success: true,
      tracks: results,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Get playlist tracks error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get playlist tracks' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleAddTrackToPlaylist(request, db, userId, playlistId, corsHeaders) {
  try {
    const body = await request.json();
    const {
      track_id,
      source,
      title,
      artist,
      album,
      cover_url,
      audio_url,
      lrc_url,
      quality
    } = body;

    // 验证必要字段
    if (!track_id || !source || !title) {
      return new Response(JSON.stringify({ error: 'Track ID, source and title are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 检查歌单是否存在且属于该用户
    const playlist = await db.prepare(
      'SELECT id FROM user_playlists WHERE id = ? AND user_id = ?'
    ).bind(playlistId, userId).first();

    if (!playlist) {
      return new Response(JSON.stringify({ error: 'Playlist not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 检查歌曲是否已在歌单中
    const existingTrack = await db.prepare(
      'SELECT id FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?'
    ).bind(playlistId, track_id).first();

    if (existingTrack) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Track already exists in playlist'
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 添加歌曲到歌单
    const result = await db.prepare(`
      INSERT INTO playlist_tracks (
        playlist_id, track_id, source, title, artist, album, 
        cover_url, audio_url, lrc_url, quality
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).bind(
      playlistId, track_id, source, title, 
      artist || null, album || null, cover_url || null,
      audio_url || null, lrc_url || null, quality || 'normal'
    ).run();

    const track = result.results[0];

    return new Response(JSON.stringify({
      success: true,
      track,
      message: 'Track added to playlist successfully'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Add track to playlist error:', error);
    return new Response(JSON.stringify({ error: 'Failed to add track to playlist' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleRemoveTrackFromPlaylist(request, db, userId, playlistId, trackId, corsHeaders) {
  try {
    // 检查歌单是否存在且属于该用户
    const playlist = await db.prepare(
      'SELECT id FROM user_playlists WHERE id = ? AND user_id = ?'
    ).bind(playlistId, userId).first();

    if (!playlist) {
      return new Response(JSON.stringify({ error: 'Playlist not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 删除歌曲
    const result = await db.prepare(
      'DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ? RETURNING id'
    ).bind(playlistId, trackId).run();

    if (result.results.length === 0) {
      return new Response(JSON.stringify({ error: 'Track not found in playlist' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Track removed from playlist successfully'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Remove track from playlist error:', error);
    return new Response(JSON.stringify({ error: 'Failed to remove track from playlist' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}// ============ 收藏管理处理函数 ============

async function handleGetFavorites(request, db, userId, corsHeaders) {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // 获取收藏总数
    const totalResult = await db.prepare(
      'SELECT COUNT(*) as total FROM user_favorites WHERE user_id = ?'
    ).bind(userId).first();

    const total = totalResult.total || 0;

    // 获取分页收藏
    const { results } = await db.prepare(`
      SELECT * FROM user_favorites 
      WHERE user_id = ? 
      ORDER BY added_at DESC
      LIMIT ? OFFSET ?
    `).bind(userId, limit, offset).all();

    return new Response(JSON.stringify({
      success: true,
      favorites: results,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Get favorites error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get favorites' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleAddFavorite(request, db, userId, corsHeaders) {
  try {
    const body = await request.json();
    const {
      track_id,
      source,
      title,
      artist,
      album,
      cover_url,
      audio_url,
      lrc_url,
      quality
    } = body;

    // 验证必要字段
    if (!track_id || !source || !title) {
      return new Response(JSON.stringify({ error: 'Track ID, source and title are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 检查是否已收藏
    const existingFavorite = await db.prepare(
      'SELECT id FROM user_favorites WHERE user_id = ? AND track_id = ?'
    ).bind(userId, track_id).first();

    if (existingFavorite) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Track already in favorites'
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 添加收藏
    const result = await db.prepare(`
      INSERT INTO user_favorites (
        user_id, track_id, source, title, artist, album, 
        cover_url, audio_url, lrc_url, quality
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).bind(
      userId, track_id, source, title, 
      artist || null, album || null, cover_url || null,
      audio_url || null, lrc_url || null, quality || 'normal'
    ).run();

    const favorite = result.results[0];

    return new Response(JSON.stringify({
      success: true,
      favorite,
      message: 'Added to favorites successfully'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Add favorite error:', error);
    return new Response(JSON.stringify({ error: 'Failed to add favorite' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleRemoveFavorite(request, db, userId, trackId, corsHeaders) {
  try {
    const result = await db.prepare(
      'DELETE FROM user_favorites WHERE user_id = ? AND track_id = ? RETURNING id'
    ).bind(userId, trackId).run();

    if (result.results.length === 0) {
      return new Response(JSON.stringify({ error: 'Favorite not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Removed from favorites successfully'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Remove favorite error:', error);
    return new Response(JSON.stringify({ error: 'Failed to remove favorite' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleCheckFavorite(request, db, userId, corsHeaders) {
  try {
    const body = await request.json();
    const { track_id } = body;

    if (!track_id) {
      return new Response(JSON.stringify({ error: 'Track ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const favorite = await db.prepare(
      'SELECT id FROM user_favorites WHERE user_id = ? AND track_id = ?'
    ).bind(userId, track_id).first();

    return new Response(JSON.stringify({
      success: true,
      is_favorite: !!favorite
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Check favorite error:', error);
    return new Response(JSON.stringify({ error: 'Failed to check favorite' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

// ============ 搜索历史处理函数 ============

async function handleGetSearchHistory(request, db, userId, corsHeaders) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '10');

    const { results } = await db.prepare(`
      SELECT keyword, source, search_count, last_searched_at
      FROM search_history 
      WHERE user_id = ? 
      ORDER BY last_searched_at DESC
      LIMIT ?
    `).bind(userId, limit).all();

    return new Response(JSON.stringify({
      success: true,
      history: results
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Get search history error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get search history' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleAddSearchHistory(request, db, userId, corsHeaders) {
  try {
    const body = await request.json();
    const { keyword, source } = body;

    if (!keyword) {
      return new Response(JSON.stringify({ error: 'Keyword is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 检查是否已有搜索记录
    const existingRecord = await db.prepare(
      'SELECT id, search_count FROM search_history WHERE user_id = ? AND keyword = ?'
    ).bind(userId, keyword).first();

    if (existingRecord) {
      // 更新现有记录
      await db.prepare(`
        UPDATE search_history 
        SET search_count = search_count + 1, 
            last_searched_at = CURRENT_TIMESTAMP,
            source = COALESCE(?, source)
        WHERE id = ?
      `).bind(source || null, existingRecord.id).run();
    } else {
      // 创建新记录
      await db.prepare(`
        INSERT INTO search_history (user_id, keyword, source)
        VALUES (?, ?, ?)
      `).bind(userId, keyword, source || null).run();
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Search history updated'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Add search history error:', error);
    return new Response(JSON.stringify({ error: 'Failed to update search history' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleClearSearchHistory(request, db, userId, corsHeaders) {
  try {
    await db.prepare('DELETE FROM search_history WHERE user_id = ?').bind(userId).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Search history cleared successfully'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Clear search history error:', error);
    return new Response(JSON.stringify({ error: 'Failed to clear search history' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleGetHotSearches(request, db, corsHeaders) {
  try {
    const { results } = await db.prepare(`
      SELECT keyword, COUNT(*) as search_count
      FROM search_history 
      WHERE last_searched_at >= datetime('now', '-7 days')
      GROUP BY keyword
      ORDER BY search_count DESC
      LIMIT 10
    `).all();

    // 如果没有数据，返回默认热门搜索
    if (results.length === 0) {
      results.push(
        { keyword: '薛之谦', search_count: 100 },
        { keyword: '周杰伦', search_count: 95 },
        { keyword: '林俊杰', search_count: 90 },
        { keyword: '邓紫棋', search_count: 85 },
        { keyword: '陈奕迅', search_count: 80 },
        { keyword: 'Taylor Swift', search_count: 75 },
        { keyword: '告五人', search_count: 70 },
        { keyword: '五月天', search_count: 65 },
        { keyword: '毛不易', search_count: 60 },
        { keyword: '张杰', search_count: 55 }
      );
    }

    return new Response(JSON.stringify({
      success: true,
      hot_searches: results
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Get hot searches error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get hot searches' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}// ============ 同步平台处理函数 ============

async function handleGetSyncPlatforms(request, db, userId, corsHeaders) {
  try {
    const { results } = await db.prepare(`
      SELECT * FROM sync_platforms 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `).bind(userId).all();

    return new Response(JSON.stringify({
      success: true,
      platforms: results
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Get sync platforms error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get sync platforms' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleAddSyncPlatform(request, db, userId, corsHeaders) {
  try {
    const body = await request.json();
    const {
      platform,
      platform_user_id,
      platform_username,
      access_token,
      refresh_token,
      expires_at,
      sync_favorites,
      sync_playlists
    } = body;

    if (!platform) {
      return new Response(JSON.stringify({ error: 'Platform is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 检查是否已添加该平台
    const existingPlatform = await db.prepare(
      'SELECT id FROM sync_platforms WHERE user_id = ? AND platform = ?'
    ).bind(userId, platform).first();

    if (existingPlatform) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Platform already added'
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 添加同步平台
    const result = await db.prepare(`
      INSERT INTO sync_platforms (
        user_id, platform, platform_user_id, platform_username,
        access_token, refresh_token, expires_at,
        sync_favorites, sync_playlists
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).bind(
      userId, platform, platform_user_id || null, platform_username || null,
      access_token || null, refresh_token || null, expires_at || null,
      sync_favorites !== undefined ? sync_favorites : 1,
      sync_playlists !== undefined ? sync_playlists : 1
    ).run();

    const platformData = result.results[0];

    return new Response(JSON.stringify({
      success: true,
      platform: platformData,
      message: 'Sync platform added successfully'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Add sync platform error:', error);
    return new Response(JSON.stringify({ error: 'Failed to add sync platform' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleRemoveSyncPlatform(request, db, userId, platformId, corsHeaders) {
  try {
    const result = await db.prepare(
      'DELETE FROM sync_platforms WHERE id = ? AND user_id = ? RETURNING id'
    ).bind(platformId, userId).run();

    if (result.results.length === 0) {
      return new Response(JSON.stringify({ error: 'Sync platform not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Sync platform removed successfully'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Remove sync platform error:', error);
    return new Response(JSON.stringify({ error: 'Failed to remove sync platform' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleSyncPlatformData(request, db, userId, platformId, corsHeaders) {
  try {
    // 获取平台信息
    const platform = await db.prepare(
      'SELECT * FROM sync_platforms WHERE id = ? AND user_id = ?'
    ).bind(platformId, userId).first();

    if (!platform) {
      return new Response(JSON.stringify({ error: 'Sync platform not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 这里应该调用各平台的API同步数据
    // 由于平台API需要具体的实现，这里只返回模拟数据
    const syncResult = {
      platform: platform.platform,
      sync_favorites: platform.sync_favorites,
      sync_playlists: platform.sync_playlists,
      favorites_synced: 0,
      playlists_synced: 0,
      last_sync_at: new Date().toISOString()
    };

    // 更新最后同步时间
    await db.prepare(
      'UPDATE sync_platforms SET last_sync_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(platformId).run();

    return new Response(JSON.stringify({
      success: true,
      sync_result: syncResult,
      message: 'Platform data synced successfully (simulated)'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Sync platform data error:', error);
    return new Response(JSON.stringify({ error: 'Failed to sync platform data' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

// ============ 音乐搜索处理函数 ============

async function handleTestMusicSources(request, corsHeaders) {
  try {
    const body = await request.json();
    const { sources } = body;

    if (!sources || !Array.isArray(sources)) {
      return new Response(JSON.stringify({ error: 'Sources array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const testResults = [];
    const testKeyword = '薛之谦';

    for (const source of sources) {
      try {
        let testUrl = '';
        let isValid = false;

        switch (source) {
          case 'netease':
            testUrl = `https://api-v1.cenguigui.cn/api/music/netease/WyY_Dg.php?type=json&msg=${encodeURIComponent(testKeyword)}&num=1&n=`;
            break;
          case 'qq':
            testUrl = `https://music-dl.sayqz.com/api?&type=search&keyword=${encodeURIComponent(testKeyword)}&source=qq&limit=1`;
            break;
          case 'migu':
            testUrl = `https://api-v1.cenguigui.cn/api/music/mgmusic_lingsheng.php?msg=${encodeURIComponent(testKeyword)}&limit=1&n=`;
            break;
          case 'kuwo':
            testUrl = `https://music-dl.sayqz.com/api?&type=search&keyword=${encodeURIComponent(testKeyword)}&source=kuwo&limit=1`;
            break;
          default:
            testResults.push({ source, status: 'unknown', error: 'Unknown source' });
            continue;
        }

        const response = await fetch(testUrl, {
          headers: {
            'User-Agent': 'MusicSquare/1.0'
          }
        });

        if (response.ok) {
          const data = await response.json();
          isValid = data && (data.code === 200 || data.data);
        }

        testResults.push({
          source,
          status: isValid ? 'available' : 'unavailable',
          url: testUrl
        });

      } catch (error) {
        testResults.push({
          source,
          status: 'error',
          error: error.message
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      test_results: testResults
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Test music sources error:', error);
    return new Response(JSON.stringify({ error: 'Failed to test music sources' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleMusicSearch(request, corsHeaders) {
  try {
    const url = new URL(request.url);
    const keyword = url.searchParams.get('keyword');
    const source = url.searchParams.get('source');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    if (!keyword) {
      return new Response(JSON.stringify({ error: 'Keyword is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!source) {
      return new Response(JSON.stringify({ error: 'Source is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    let apiUrl = '';
    let offset = (page - 1) * limit;

    switch (source) {
      case 'netease':
        apiUrl = `https://api-v1.cenguigui.cn/api/music/netease/WyY_Dg.php?type=json&msg=${encodeURIComponent(keyword)}&num=${limit}&n=${offset}`;
        break;
      case 'qq':
        apiUrl = `https://music-dl.sayqz.com/api?&type=search&keyword=${encodeURIComponent(keyword)}&source=qq&limit=${limit}`;
        break;
      case 'migu':
        apiUrl = `https://api-v1.cenguigui.cn/api/music/mgmusic_lingsheng.php?msg=${encodeURIComponent(keyword)}&limit=${limit}&n=${offset}`;
        break;
      case 'kuwo':
        apiUrl = `https://music-dl.sayqz.com/api?&type=search&keyword=${encodeURIComponent(keyword)}&source=kuwo&limit=${limit}`;
        break;
      default:
        return new Response(JSON.stringify({ error: 'Unsupported source' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
    }

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'MusicSquare/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();

    // 标准化响应格式
    let tracks = [];
    if (source === 'netease' && data.code === 200 && Array.isArray(data.data)) {
      tracks = data.data.map((item, index) => ({
        uid: `netease-${item.songid}`,
        source: 'netease',
        displayIndex: offset + index + 1,
        songid: item.songid,
        title: item.title || '',
        artist: item.singer || '',
        album: '',
        cover: null,
        audioUrl: null,
        lrc: null,
        lrcUrl: null,
        detailsLoaded: false,
        quality: 'lossless'
      }));
    } else if ((source === 'qq' || source === 'kuwo') && data.code === 200 && data.data && Array.isArray(data.data.results)) {
      tracks = data.data.results.map((item, index) => ({
        uid: `${source}-${item.id}`,
        source,
        displayIndex: offset + index + 1,
        songid: item.id,
        title: item.name || '',
        artist: item.artist || '',
        album: item.album || '',
        cover: item.pic || null,
        audioUrl: item.url || null,
        lrc: null,
        lrcUrl: item.lrc || null,
        detailsLoaded: !!item.url,
        quality: 'normal'
      }));
    } else if (source === 'migu' && data.code === 200 && Array.isArray(data.data)) {
      tracks = data.data.map((item, index) => ({
        uid: `migu-${keyword}-${item.n}-${item.title}-${item.singer}`,
        source: 'migu',
        displayIndex: item.n || offset + index + 1,
        title: item.title || '',
        artist: item.singer || '',
        album: '',
        cover: null,
        audioUrl: null,
        lrc: null,
        lrcUrl: null,
        detailsLoaded: false,
        quality: 'normal'
      }));
    }

    return new Response(JSON.stringify({
      success: true,
      source,
      keyword,
      page,
      limit,
      total: tracks.length,
      tracks
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('Music search error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to search music',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}