// ============ 歌单管理处理函数 ============

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
}