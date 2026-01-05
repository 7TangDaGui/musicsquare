    // ============ UI 工具函数 ============
    setupEventListeners() {
        // 搜索框事件
        const searchInput = document.getElementById('search-input');
        const searchBtn = document.getElementById('search-btn');
        
        if (searchInput && searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.searchMusic(searchInput.value);
            });
            
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchMusic(searchInput.value);
                }
            });
        }
        
        // 音乐源按钮事件
        document.querySelectorAll('.source-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const source = btn.dataset.source;
                if (!btn.disabled) {
                    this.toggleSource(source);
                }
            });
        });
        
        // 多源搜索切换
        const multiSourceToggle = document.getElementById('multi-source-toggle');
        if (multiSourceToggle) {
            multiSourceToggle.addEventListener('change', (e) => {
                this.state.multiSourceEnabled = e.target.checked;
                this.updateSourceUI();
            });
        }
        
        // 主题切换
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                this.toggleTheme();
            });
        }
        
        // 用户头像点击事件
        const avatarBtn = document.querySelector('.avatar-btn');
        if (avatarBtn) {
            avatarBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleUserDropdown();
            });
        }
        
        // 点击其他地方关闭下拉菜单
        document.addEventListener('click', () => {
            this.hideUserDropdown();
        });
        
        // 播放控制事件
        const playBtn = document.getElementById('play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                this.togglePlayPause();
            });
        }
        
        // 播放模式切换
        const playModeBtns = document.querySelectorAll('.playmode-btn');
        playModeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.state.playMode = btn.dataset.mode;
                this.updatePlayModeUI();
                this.showToast(`播放模式: ${this.getPlayModeName(this.state.playMode)}`, 'info');
            });
        });
        
        // 新建歌单按钮
        const newPlaylistBtn = document.getElementById('new-playlist-btn');
        if (newPlaylistBtn) {
            newPlaylistBtn.addEventListener('click', () => {
                this.showNewPlaylistModal();
            });
        }
        
        // 同步平台按钮
        const syncPlatformsBtn = document.getElementById('sync-platforms-btn');
        if (syncPlatformsBtn) {
            syncPlatformsBtn.addEventListener('click', () => {
                this.showSyncPlatformsModal();
            });
        }
    }
    
    toggleSource(source) {
        if (this.state.multiSourceEnabled) {
            this.state.enabledSources[source] = !this.state.enabledSources[source];
            const enabledCount = Object.values(this.state.enabledSources).filter(v => v).length;
            if (enabledCount === 0) {
                this.state.enabledSources[source] = true;
                this.showToast('至少需要选择一个音乐源', 'warning');
            }
        } else {
            this.state.currentSource = source;
        }
        this.updateSourceUI();
    }
    
    updateSourceUI() {
        document.querySelectorAll('.source-btn').forEach(btn => {
            const source = btn.dataset.source;
            if (this.state.multiSourceEnabled) {
                btn.classList.toggle('active', this.state.enabledSources[source]);
            } else {
                btn.classList.toggle('active', source === this.state.currentSource);
            }
        });
    }
    
    updatePlayModeUI() {
        document.querySelectorAll('.playmode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === this.state.playMode);
        });
    }
    
    getPlayModeName(mode) {
        const names = {
            list: '列表循环',
            single: '单曲循环',
            shuffle: '随机播放'
        };
        return names[mode] || mode;
    }
    
    toggleUserDropdown() {
        const dropdown = document.querySelector('.user-dropdown');
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        }
    }
    
    hideUserDropdown() {
        const dropdown = document.querySelector('.user-dropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
    }
    
    // ============ 模态框相关 ============
    showLoginModal() {
        const modal = document.getElementById('login-modal');
        if (!modal) return;
        
        modal.style.display = 'block';
        
        // 登录表单提交
        const loginForm = modal.querySelector('#login-form');
        if (loginForm) {
            loginForm.onsubmit = async (e) => {
                e.preventDefault();
                const username = modal.querySelector('#login-username').value;
                const password = modal.querySelector('#login-password').value;
                
                if (await this.login(username, password)) {
                    modal.style.display = 'none';
                    loginForm.reset();
                }
            };
        }
        
        // 注册表单提交
        const registerForm = modal.querySelector('#register-form');
        if (registerForm) {
            registerForm.onsubmit = async (e) => {
                e.preventDefault();
                const username = modal.querySelector('#register-username').value;
                const password = modal.querySelector('#register-password').value;
                
                if (await this.register(username, password)) {
                    modal.style.display = 'none';
                    registerForm.reset();
                }
            };
        }
        
        // 关闭按钮
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.style.display = 'none';
            };
        }
        
        // 点击模态框外部关闭
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }
    
    showNewPlaylistModal() {
        const modal = document.getElementById('new-playlist-modal');
        if (!modal) return;
        
        modal.style.display = 'block';
        
        const form = modal.querySelector('#new-playlist-form');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                const name = modal.querySelector('#playlist-name').value;
                
                if (await this.createPlaylist(name)) {
                    modal.style.display = 'none';
                    form.reset();
                }
            };
        }
        
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.style.display = 'none';
            };
        }
        
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }
    
    showSyncPlatformsModal() {
        const modal = document.getElementById('sync-platforms-modal');
        if (!modal) return;
        
        modal.style.display = 'block';
        
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.style.display = 'none';
            };
        }
        
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }
    
    showConfirm(title, message, onConfirm) {
        const modal = document.getElementById('confirm-modal');
        if (!modal) return;
        
        modal.querySelector('.confirm-title').textContent = title;
        modal.querySelector('.confirm-message').textContent = message;
        modal.style.display = 'block';
        
        const confirmBtn = modal.querySelector('.confirm-btn');
        const cancelBtn = modal.querySelector('.cancel-btn');
        
        const handleConfirm = () => {
            modal.style.display = 'none';
            onConfirm();
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };
        
        const handleCancel = () => {
            modal.style.display = 'none';
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };
        
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        
        modal.onclick = (e) => {
            if (e.target === modal) {
                handleCancel();
            }
        };
    }
    
    // ============ Toast 通知 ============
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas fa-${this.getToastIcon(type)}"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(toast);
        
        // 显示动画
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // 自动消失
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }
    
    getToastIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }
    
    // ============ 工具函数 ============
    addToNextPlay(trackId) {
        const track = this.state.searchResults.find(t => t.uid === trackId);
        if (!track) return;
        
        this.showToast(`已添加到下一首播放: ${track.title}`, 'info');
        // 这里可以添加到播放队列的逻辑
    }
    
    // ============ 初始化应用 ============
    static init() {
        window.musicSquareApp = new MusicSquareApp();
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    MusicSquareApp.init();
});

// 导出供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MusicSquareApp;
}