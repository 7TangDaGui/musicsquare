// ============ 收藏管理处理函数 ============

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
}