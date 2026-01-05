// ============ 同步平台处理函数 ============

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