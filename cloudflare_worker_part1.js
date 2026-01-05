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
}