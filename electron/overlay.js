// overlay.js - Uses window.electronAPI exposed by preload.js

const API_URL = 'http://127.0.0.1:5000/api';
let selectedMessageIds = [];
let selectedCombinationIds = [];
let allMessages = [];
let allCombinations = [];
let isModalOpen = false;
let lastTargetWindows = [];
let isUpdating = false;
let selectedWindows = []; // New Global

// Load selections safely (as Strings)
try {
    const raw = JSON.parse(localStorage.getItem('overlay_messages') || '[]');
    selectedMessageIds = raw.map(String);
} catch (e) {
    selectedMessageIds = [];
}

try {
    const raw = JSON.parse(localStorage.getItem('overlay_combinations') || '[]');
    selectedCombinationIds = raw.map(String);
} catch (e) {
    selectedCombinationIds = [];
}

// === THEME SYNC ===
function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

async function toggleWindowTarget() {
    openWindowModal();
}

// === TOGGLE CONTROLS ===
async function toggleListener() {
    if (isUpdating) return;
    const btn = document.getElementById('ovListenerBtn');
    const isActive = btn.classList.contains('active');

    isUpdating = true;
    updateToggleUI(btn, !isActive);

    try {
        const endpoint = isActive ? '/listener/stop' : '/listener/start';
        await apiCall(endpoint, 'POST');
        window.electronAPI.notifyUpdate();
    } catch (e) {
        updateToggleUI(btn, isActive);
    } finally {
        setTimeout(() => { isUpdating = false; }, 500);
    }
}

async function toggleEnter() {
    if (isUpdating) return;
    const btn = document.getElementById('ovEnterBtn');
    const isActive = btn.classList.contains('active');

    isUpdating = true;
    updateToggleUI(btn, !isActive);
    try {
        await apiCall('/settings', 'POST', { enter_enabled: !isActive ? 'true' : 'false' });
        window.electronAPI.notifyUpdate();
    } catch (e) {
        updateToggleUI(btn, isActive);
    } finally {
        setTimeout(() => { isUpdating = false; }, 500);
    }
}

function updateToggleUI(btn, isActive) {
    if (isActive) btn.classList.add('active');
    else btn.classList.remove('active');
}

async function syncStatus() {
    if (isUpdating) return; // Kullanıcı işlem yaparken araya girme

    try {
        const listenerRes = await apiCall('/listener/status');
        if (listenerRes && !listenerRes.error) {
            const isListenerActive = listenerRes.active;
            updateToggleUI(document.getElementById('ovListenerBtn'), isListenerActive);
            // Update status dot
            const dotListener = document.getElementById('dotListener');
            if (dotListener) {
                if (isListenerActive) dotListener.classList.add('active');
                else dotListener.classList.remove('active');
            }
        }

        const settingsRes = await apiCall('/settings');
        if (settingsRes && !settingsRes.error) {
            // Python 'True' veya 'true' döndürebilir, normalize et
            const val = String(settingsRes.enter_enabled).toLowerCase();
            const isEnter = val === 'true';
            updateToggleUI(document.getElementById('ovEnterBtn'), isEnter);
            // Update status dot
            const dotEnter = document.getElementById('dotEnter');
            if (dotEnter) {
                if (isEnter) dotEnter.classList.add('active');
                else dotEnter.classList.remove('active');
            }

            const targets = JSON.parse(settingsRes.target_windows || '[]');
            const winBtn = document.getElementById('ovWindowBtn');
            const badge = document.getElementById('ovWindowBadge');
            const dotWindow = document.getElementById('dotWindow');

            if (targets.length > 0) {
                winBtn.classList.add('active');
                badge.textContent = targets.length;
                badge.style.display = 'flex';
                if (dotWindow) dotWindow.classList.add('active');
            } else {
                winBtn.classList.remove('active');
                badge.style.display = 'none';
                if (dotWindow) dotWindow.classList.remove('active');
            }
        }
    } catch (e) { }
}

// ... existing code ...

async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(`${API_URL}${endpoint}`, options);
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return { error: 'Connection failed' };
    }
}

async function loadMessages() {
    if (isModalOpen) return;

    const container = document.getElementById('messageContainer');
    // Don't show loading spinner if we are just refreshing silently
    if (container.children.length === 0 || container.querySelector('.loading-spinner')) {
        container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>';
    }

    try {
        // Load both messages and combinations
        const [messages, combinations] = await Promise.all([
            apiCall('/messages'),
            apiCall('/combinations')
        ]);

        if (!messages || messages.error) {
            container.innerHTML = '<span style="color:#ef4444; font-size:12px; cursor:pointer;" onclick="loadMessages()">Bağlantı Hatası (Tıkla)</span>';
            return;
        }

        allMessages = messages;
        allCombinations = combinations || [];
        container.innerHTML = '';

        // Get selected messages
        let displayMessages = [];
        if (selectedMessageIds.length > 0) {
            displayMessages = selectedMessageIds
                .map(id => messages.find(m => String(m.id) === String(id)))
                .filter(Boolean);
        }

        // Get selected combinations
        let displayCombinations = [];
        if (selectedCombinationIds.length > 0) {
            displayCombinations = selectedCombinationIds
                .map(id => allCombinations.find(c => String(c.id) === String(id)))
                .filter(Boolean);
        }

        const totalItems = displayMessages.length + displayCombinations.length;

        if (totalItems === 0) {
            if (messages.length === 0 && allCombinations.length === 0) {
                container.innerHTML = '<span style="color:#94a3b8; font-size:12px;">Mesaj yok</span>';
            } else {
                container.innerHTML = '<span style="color:#94a3b8; font-size:12px; cursor:pointer;" onclick="openSelectionModal()">Seçili öğe yok <i class="fas fa-hand-pointer"></i></span>';
            }
        }

        // Render messages
        displayMessages.forEach(msg => {
            const btn = document.createElement('button');
            const hasIcon = !!msg.icon;

            if (hasIcon) {
                btn.className = 'message-btn icon-btn';
                btn.innerHTML = `<i class="${msg.icon}"></i>`;
                // Add tooltip with name and hotkey
                const tooltipInfo = msg.trigger_key ? `${msg.name} (${msg.trigger_key})` : msg.name;
                btn.title = tooltipInfo;
            } else {
                btn.className = 'message-btn';
                btn.innerHTML = `${msg.trigger_key ? `<span class="key-badge">${msg.trigger_key}</span>` : ''}<span>${msg.name}</span>`;
                btn.title = 'Gönder: ' + msg.name;
            }

            btn.style.display = 'flex';
            btn.style.alignItems = 'center';

            btn.onclick = (e) => {
                e.stopPropagation();
                sendMessage(msg.id);
            };
            container.appendChild(btn);
        });

        // Render combinations with different style
        displayCombinations.forEach(combo => {
            const btn = document.createElement('button');
            const hasIcon = !!combo.icon;

            if (hasIcon) {
                btn.className = 'message-btn combination-btn icon-btn';
                btn.innerHTML = `<i class="${combo.icon}"></i>`;
                // Add tooltip
                const tooltipInfo = combo.trigger_key ? `[Kombinasyon] ${combo.name} (${combo.trigger_key})` : `[Kombinasyon] ${combo.name}`;
                btn.title = tooltipInfo;
            } else {
                btn.className = 'message-btn combination-btn';
                btn.innerHTML = `<i class="fas fa-layer-group" style="font-size:10px; margin-right:4px; opacity:0.7;"></i>${combo.trigger_key ? `<span class="key-badge">${combo.trigger_key}</span>` : ''}<span>${combo.name}</span>`;
                btn.title = 'Kombinasyon: ' + combo.name + ' (' + (combo.items?.length || 0) + ' mesaj)';
            }

            btn.style.display = 'flex';
            btn.style.alignItems = 'center';

            btn.onclick = (e) => {
                e.stopPropagation();
                sendCombination(combo.id);
            };
            container.appendChild(btn);
        });

        resizeWindow();

    } catch (e) {
        console.error(e);
        container.innerHTML = '<span style="color:#ef4444; font-size:12px;">Hata</span>';
    }
}

async function sendMessage(id) {
    try {
        const btn = document.activeElement;

        // Önce işlemi başlat
        window.electronAPI.blurWindow();
        apiCall(`/send-message/${id}`, 'POST'); // Await etmiyoruz ki arayüz takılmasın

        // Animasyon oynat (class ekle/çıkar)
        if (btn && btn.classList.contains('message-btn')) {
            btn.classList.add('success-pulse');
            setTimeout(() => {
                btn.classList.remove('success-pulse');
            }, 400);
        }

    } catch (e) {
        console.error(e);
    }
}

async function sendCombination(id) {
    try {
        const btn = document.activeElement;

        // Önce işlemi başlat
        window.electronAPI.blurWindow();
        apiCall(`/send-combination/${id}`, 'POST');

        // Animasyon oynat
        if (btn && btn.classList.contains('message-btn')) {
            btn.classList.add('combo-pulse');
            // Kombinasyonlar uzun sürebilir ama buton animasyonu kısa olsun
            setTimeout(() => {
                btn.classList.remove('combo-pulse');
            }, 600);
        }

    } catch (e) {
        console.error(e);
    }
}

function resizeWindow(isModal = false) {
    if (isModal) {
        window.electronAPI.resizeOverlay({ width: 340, height: 420 });
        return;
    }

    const container = document.querySelector('.overlay-container');
    const messageContainer = document.getElementById('messageContainer');

    if (container && messageContainer) {
        // Önce container genişliğini sıfırla ki gerçek boyutları ölçebilelim
        container.style.width = 'auto';
        messageContainer.style.width = 'auto';

        const messageButtons = messageContainer.querySelectorAll('.message-btn');
        const messageCount = messageButtons.length;

        if (messageCount === 0) {
            window.electronAPI.resizeOverlay({ width: 400, height: 66 });
            return;
        }

        // Her satırda maksimum 8 mesaj
        const maxPerRow = 8;

        // Tüm satırları kontrol et ve en geniş olana göre boyutlan
        let maxWidth = 0;
        let currentChunkWidth = 0;

        for (let i = 0; i < messageCount; i++) {
            const btn = messageButtons[i];
            currentChunkWidth += btn.offsetWidth + 8; // 8px gap

            // Eğer bu eleman 6'lı grubun sonuncusuysa veya listenin son elemanıysa
            if ((i + 1) % maxPerRow === 0 || i === messageCount - 1) {
                // Sondaki gap'i çıkar
                const actualWidth = currentChunkWidth - 8;
                if (actualWidth > maxWidth) {
                    maxWidth = actualWidth;
                }
                currentChunkWidth = 0; // Sıfırla
            }
        }

        // Mesaj container'ına bu genişliği ata
        messageContainer.style.width = maxWidth + 'px';

        // Bir frame bekle ki layout güncellensin
        requestAnimationFrame(() => {
            const containerRect = container.getBoundingClientRect();

            // Pencere boyutunu ayarla
            const width = Math.ceil(containerRect.width) + 24;
            const height = Math.max(60, Math.ceil(containerRect.height) + 16);

            window.electronAPI.resizeOverlay({ width, height });
        });
    }
}

// ==================== SELECTION WINDOW ====================

function openSelectionModal() {
    // Modal yerine ayrı pencere aç
    window.electronAPI.openSelectionWindow();
}

// ==================== WINDOW SELECTION WINDOW ====================

function openWindowModal() {
    // Modal yerine ayrı pencere aç
    window.electronAPI.openWindowSelectionWindow();
}

// Event Listeners
document.getElementById('settingsBtn').addEventListener('click', openSelectionModal);
document.getElementById('closeOverlayBtn').addEventListener('click', () => {
    window.electronAPI.closeOverlay();
});

// Sidebar Toggle Listeners
document.getElementById('ovListenerBtn').addEventListener('click', toggleListener);
document.getElementById('ovEnterBtn').addEventListener('click', toggleEnter);
document.getElementById('ovWindowBtn').addEventListener('click', toggleWindowTarget);


// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    loadMessages();
    syncStatus();

    // Hover ile pencere boyutunu güncelle
    const controlsWrapper = document.querySelector('.controls-wrapper');
    if (controlsWrapper) {
        controlsWrapper.addEventListener('mouseenter', () => {
            resizeWindow();
        });
        controlsWrapper.addEventListener('mouseleave', () => {
            resizeWindow();
        });
    }

    // Refresh status periodically (Faster for snappier UI)
    setInterval(syncStatus, 500);

    // Listen for updates (Theme & Status & Messages)
    if (window.electronAPI && window.electronAPI.onUpdate) {
        window.electronAPI.onUpdate(() => {
            // Selection window kapandığında selectedMessageIds güncelle
            try {
                const raw = JSON.parse(localStorage.getItem('overlay_messages') || '[]');
                selectedMessageIds = raw.map(String);
            } catch (e) {
                selectedMessageIds = [];
            }
            // Also update combination selections
            try {
                const raw = JSON.parse(localStorage.getItem('overlay_combinations') || '[]');
                selectedCombinationIds = raw.map(String);
            } catch (e) {
                selectedCombinationIds = [];
            }
            syncStatus();
            loadTheme();
            loadMessages();
        });
    }
});

