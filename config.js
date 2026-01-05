// Supabase配置
// 请替换成你自己的Supabase项目配置
const SUPABASE_CONFIG = {
    url: 'YOUR_SUPABASE_URL', // 例如: https://xxxxx.supabase.co
    anonKey: 'YOUR_SUPABASE_ANON_KEY' // 你的匿名密钥
};

// 音乐源配置
const MUSIC_SOURCES = {
    migu: { name: '咪咕音乐', color: '#ffb74d', enabled: true },
    netease: { name: '网易云音乐', color: '#ff6b6b', enabled: true },
    qq: { name: 'QQ音乐', color: '#4dd0e1', enabled: true },
    kuwo: { name: '酷我音乐', color: '#ba68c8', enabled: true }
};

// 默认设置
const DEFAULT_SETTINGS = {
    theme: 'dark',
    defaultSource: 'netease',
    playMode: 'list', // list, random, single
    itemsPerPage: 20
};
