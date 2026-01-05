# 音乐广场后端部署指南

## 数据库部署

### 1. 创建数据库表
使用以下SQL语句在Cloudflare D1数据库中创建表：

```sql
-- 复制 database_schema.sql 中的内容到Cloudflare D1数据库控制台执行
```

### 2. 数据库连接配置
在Cloudflare Workers中配置D1数据库绑定：
```toml
# wrangler.toml 配置
[[d1_databases]]
binding = "DB"
database_name = "musicsguare_db"
database_id = "你的数据库ID"
```

## 后端API部署

### 1. 创建Cloudflare Worker项目
1. 登录Cloudflare Dashboard
2. 进入Workers & Pages
3. 创建新Worker，命名为 `yunduanyingyue`
4. 将以下文件内容复制到Worker编辑器中：

### 2. 合并API代码
将以下四个文件的内容按顺序合并到 `index.js`：

1. `cloudflare_worker_part1.js` - 主框架和用户认证
2. `cloudflare_worker_part2.js` - 歌单管理功能
3. `cloudflare_worker_part3.js` - 收藏管理和搜索历史
4. `cloudflare_worker_part4.js` - 同步平台和音乐搜索

### 3. 配置环境变量
在Worker设置中配置：
- 数据库绑定：DB (D1数据库)
- 其他环境变量（如果需要）

### 4. 部署Worker
1. 保存并部署Worker
2. 访问地址：https://yunduanyingyue.tmichi1001.workers.dev/

## API接口文档

### 健康检查
```
GET /api/health
```

### 用户认证
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
PUT  /api/auth/update-avatar
```

### 歌单管理
```
GET    /api/playlists
POST   /api/playlists
GET    /api/playlists/{id}
PUT    /api/playlists/{id}
DELETE /api/playlists/{id}
GET    /api/playlists/{id}/tracks
POST   /api/playlists/{id}/tracks
DELETE /api/playlists/{id}/tracks/{trackId}
```

### 收藏管理
```
GET    /api/favorites
POST   /api/favorites
DELETE /api/favorites/{trackId}
POST   /api/favorites/check
```

### 搜索历史
```
GET    /api/search/history
POST   /api/search/history
DELETE /api/search/history/clear
GET    /api/search/hot
```

### 同步平台
```
GET    /api/sync/platforms
POST   /api/sync/platforms
DELETE /api/sync/platforms/{id}
POST   /api/sync/platforms/{id}/sync
```

### 音乐搜索
```
POST /api/sources/test
GET  /api/music/search?keyword={}&source={}&page={}&limit={}
```

## 前端配置

### API基础URL
```javascript
const API_BASE_URL = 'https://yunduanyingyue.tmichi1001.workers.dev';
```

### 认证头
```javascript
// 登录后保存token
localStorage.setItem('auth_token', response.token);

// 在API请求中添加认证头
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
};
```

## 测试数据

### 测试用户
- 用户名：test
- 密码：123456

### 测试API
```bash
# 健康检查
curl https://yunduanyingyue.tmichi1001.workers.dev/api/health

# 用户登录
curl -X POST https://yunduanyingyue.tmichi1001.workers.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"123456"}'

# 搜索音乐
curl "https://yunduanyingyue.tmichi1001.workers.dev/api/music/search?keyword=薛之谦&source=netease&page=1&limit=20"
```

## 注意事项

1. **数据库初始化**：首次部署需要执行建表语句
2. **CORS配置**：API已配置CORS，支持跨域请求
3. **认证机制**：使用简单的Bearer Token认证
4. **错误处理**：所有API返回标准化的错误响应
5. **分页支持**：列表接口支持page和limit参数

## 故障排除

### 常见问题
1. **数据库连接失败**：检查D1数据库绑定配置
2. **CORS错误**：确保前端请求包含正确的Origin头
3. **认证失败**：检查token是否正确传递
4. **API 404**：检查路由路径是否正确

### 日志查看
在Cloudflare Workers控制台查看实时日志和错误信息。

## 更新维护

### 代码更新
1. 在Cloudflare Workers编辑器中更新代码
2. 保存并部署新版本
3. 测试API功能

### 数据库迁移
如需修改表结构，使用D1数据库的迁移功能。

---

**部署完成后，前端应用即可通过API与后端进行数据交互。**