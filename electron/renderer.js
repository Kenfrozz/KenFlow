const API_URL = 'http://127.0.0.1:5000/api';

// ==================== STATE ====================
let currentMessageId = null;
let currentPatternId = null;
let currentCombinationId = null;
let patternsCache = [];
let messagesCache = [];
let combinationMessages = []; // Messages in current combination being edited
let backendReady = false;

// ==================== BACKEND CONNECTION ====================
async function waitForBackend(maxRetries = 30, retryDelay = 200) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(`${API_URL}/settings`, {
                method: 'GET',
                signal: AbortSignal.timeout(500)
            });
            if (response.ok) {
                backendReady = true;
                console.log(`Backend ready after ${i * retryDelay}ms`);
                return true;
            }
        } catch (e) {
            // Backend not ready yet
        }
        await new Promise(r => setTimeout(r, retryDelay));
    }
    console.error('Backend failed to start');
    return false;
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initWindowControls();
    initNavigation();
    initMessageHandlers();
    initPatternHandlers();
    initCombinationHandlers();
    initSidebarControls();
    initListenerHandlers();
    initDashboard();

    // Wait for backend before loading data
    const ready = await waitForBackend();

    if (ready) {
        loadMessages();
        loadPatterns();
        loadCombinations();
        loadSettings();
        loadListenerStatus();
        loadDashboard();
    } else {
        showToast('Backend baglantisi kurulamadi', 'error');
    }

    // Auto-refresh listener status
    setInterval(loadListenerStatus, 2000);

    // Auto-refresh dashboard when visible
    setInterval(() => {
        const dashboardTab = document.getElementById('dashboard-tab');
        if (dashboardTab && dashboardTab.classList.contains('active')) {
            loadDashboard();
        }
    }, 30000); // Every 30 seconds

    // Listen for updates from Overlay (Sync)
    if (window.electronAPI && window.electronAPI.onUpdate) {
        window.electronAPI.onUpdate(() => {
            loadListenerStatus();
            loadSettings();
            updateWindowTargetUI(); // Dogru fonksiyon adi
            loadDashboard();
        });
    }
});

// ==================== THEME ====================
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);

    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    window.electronAPI.notifyUpdate();
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('themeIcon');
    if (theme === 'light') {
        icon.className = 'fas fa-moon';
    } else {
        icon.className = 'fas fa-sun';
    }
}

// ==================== WINDOW CONTROLS ====================
function initWindowControls() {
    const overlayBtn = document.getElementById('openOverlayBtn');
    if (overlayBtn) {
        overlayBtn.addEventListener('click', () => {
            if (overlayBtn.classList.contains('open')) {
                window.electronAPI.closeOverlay();
            } else {
                window.electronAPI.openOverlay();
                overlayBtn.classList.add('open');
            }
        });
    }

    document.getElementById('minimizeBtn').addEventListener('click', () => window.electronAPI.minimizeWindow());

    const maximizeBtn = document.getElementById('maximizeBtn');
    maximizeBtn.addEventListener('click', async () => {
        const isMaximized = await window.electronAPI.maximizeWindow();
        updateMaximizeIcon(isMaximized);
    });

    document.getElementById('closeBtn').addEventListener('click', () => window.electronAPI.closeWindow());

    // Check initial state
    checkMaximizeState();
    checkOverlayStatus();
}

function checkOverlayStatus() {
    if (window.electronAPI.onOverlayClosed) {
        window.electronAPI.onOverlayClosed(() => {
            const btn = document.getElementById('openOverlayBtn');
            if (btn) btn.classList.remove('open');
        });

        // Eğer overlay açıldı eventi varsa (main.js'den gelmeli) onu da dinleyebiliriz
        // Şimdilik click ile open yapıyoruz, kapanınca siliyoruz.
    }
}

async function checkMaximizeState() {
    const isMaximized = await window.electronAPI.isMaximized();
    updateMaximizeIcon(isMaximized);
}

function updateMaximizeIcon(isMaximized) {
    const icon = document.querySelector('#maximizeBtn i');
    if (isMaximized) {
        icon.className = 'far fa-clone';
    } else {
        icon.className = 'far fa-square';
    }
}

// ==================== NAVIGATION ====================
function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
        });
    });
}

// ==================== TOAST ====================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: 'check-circle', error: 'exclamation-circle', warning: 'exclamation-triangle' };
    toast.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ==================== API HELPERS ====================
async function apiGet(endpoint) {
    const res = await fetch(`${API_URL}${endpoint}`);
    return res.json();
}

async function apiPost(endpoint, data) {
    const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return res.json();
}

async function apiPut(endpoint, data) {
    const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return res.json();
}

async function apiDelete(endpoint) {
    const res = await fetch(`${API_URL}${endpoint}`, { method: 'DELETE' });
    return res.json();
}

// ==================== MESSAGES ====================
async function loadMessages(search = '') {
    try {
        const endpoint = search ? `/messages?search=${encodeURIComponent(search)}` : '/messages';
        const messages = await apiGet(endpoint);
        renderMessages(messages);
    } catch (e) {
        console.error('Error loading messages:', e);
    }
}

function renderMessages(messages) {
    const tbody = document.getElementById('messagesBody');
    const empty = document.getElementById('messagesEmpty');
    const table = document.getElementById('messagesTable');

    if (messages.length === 0) {
        table.style.display = 'none';
        empty.classList.add('show');
        return;
    }

    table.style.display = 'table';
    empty.classList.remove('show');

    const templateCount = (count) => {
        if (count === 0) return '';
        return `<span class="template-badge"><i class="fas fa-layer-group"></i>${count}</span>`;
    };

    const triggerKeyDisplay = (key) => {
        if (!key) return '<span class="no-key">—</span>';
        const keys = key.split('+').map(k => `<kbd>${escapeHtml(k)}</kbd>`);
        return `<div class="key-combo">${keys.join('<span class="key-separator">+</span>')}</div>`;
    };

    tbody.innerHTML = messages.map(msg => `
        <tr>
            <td>
                <div class="message-name-cell">
                    ${templateCount(msg.templates?.length || 0)}
                    <strong>${escapeHtml(msg.name)}</strong>
                </div>
            </td>
            <td>
                <div class="message-actions-cell">
                    ${triggerKeyDisplay(msg.trigger_key)}
                    <div class="action-btns">
                        <button class="action-btn copy" onclick="copyMessage(${msg.id})" title="Panoya Kopyala"><i class="fas fa-copy"></i></button>
                        <button class="action-btn edit" onclick="editMessage(${msg.id})" title="Düzenle"><i class="fas fa-pen"></i></button>
                        <button class="action-btn delete" onclick="deleteMessage(${msg.id})" title="Sil"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </td>
        </tr>
    `).join('');
}

function initMessageHandlers() {
    document.getElementById('messageSearch').addEventListener('input', (e) => loadMessages(e.target.value));
    document.getElementById('addMessageBtn').addEventListener('click', openAddMessageModal);
    document.getElementById('closeMessageModal').addEventListener('click', closeMessageModal);
    document.getElementById('cancelMessageBtn').addEventListener('click', closeMessageModal);
    document.getElementById('addTemplateBtn').addEventListener('click', addTemplateField);
    document.getElementById('saveMessageBtn').addEventListener('click', saveMessage);

    // Trigger key handlers
    document.getElementById('triggerKeyDisplay').addEventListener('click', startTriggerKeyListen);
    document.getElementById('triggerClearBtn').addEventListener('click', clearTriggerKey);

    // Window target handlers
    document.getElementById('windowTargetBtn').addEventListener('click', openWindowModal);
    document.getElementById('closeWindowModal').addEventListener('click', closeWindowModal);
    document.getElementById('cancelWindowBtn').addEventListener('click', closeWindowModal);
    document.getElementById('saveWindowBtn').addEventListener('click', saveWindowSettings);
    document.getElementById('refreshWindowsBtn').addEventListener('click', loadWindows);
    document.getElementById('allWindowsCheckbox').addEventListener('change', toggleWindowSelection);

    document.getElementById('refreshWindowsBtn').addEventListener('click', loadWindows);
    document.getElementById('allWindowsCheckbox').addEventListener('change', toggleWindowSelection);

    // Icon Preview Handler
    const iconInput = document.getElementById('messageIcon');
    const iconPreview = document.getElementById('messageIconPreview');
    if (iconInput && iconPreview) {
        iconInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            iconPreview.className = val || 'fas fa-bolt';
        });
    }

    // Initial UI update
    updateWindowTargetUI();
}

// ==================== WINDOW TARGETING ====================
let selectedWindows = [];

async function openWindowModal() {
    const modal = document.getElementById('windowModal');
    modal.classList.add('show');

    // Load current settings
    try {
        const settings = await apiGet('/settings');
        const targetWindows = JSON.parse(settings.target_windows || '[]');
        selectedWindows = targetWindows;

        const allCheckbox = document.getElementById('allWindowsCheckbox');
        allCheckbox.checked = selectedWindows.length === 0;

        loadWindows();
    } catch (e) {
        console.error('Error loading window settings:', e);
        loadWindows();
    }
}

function closeWindowModal() {
    document.getElementById('windowModal').classList.remove('show');
}

async function loadWindows() {
    const listEl = document.getElementById('windowList');
    const refreshBtn = document.getElementById('refreshWindowsBtn');

    listEl.innerHTML = `
        <div class="window-list-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Pencereler yükleniyor...</span>
        </div>
    `;

    refreshBtn.classList.add('spinning');

    try {
        const response = await apiGet('/windows');
        refreshBtn.classList.remove('spinning');

        if (response.error) {
            listEl.innerHTML = `<div class="window-list-empty">Hata: ${response.error}</div>`;
            return;
        }

        const windows = response.windows;
        if (windows.length === 0) {
            listEl.innerHTML = '<div class="window-list-empty">Açık pencere bulunamadı.</div>';
            return;
        }

        renderWindowList(windows);
    } catch (e) {
        refreshBtn.classList.remove('spinning');
        listEl.innerHTML = '<div class="window-list-empty">Pencereler yüklenemedi. Python backend çalışıyor mu?</div>';
    }
}

function renderWindowList(windows) {
    const listEl = document.getElementById('windowList');
    const allChecked = document.getElementById('allWindowsCheckbox').checked;

    listEl.innerHTML = windows.map(win => {
        const isSelected = selectedWindows.includes(win);
        return `
            <div class="window-item ${isSelected ? 'selected' : ''} ${allChecked ? 'disabled' : ''}" onclick="toggleWindowItem(this, '${escapeHtml(win)}')">
                <input type="checkbox" ${isSelected ? 'checked' : ''} ${allChecked ? 'disabled' : ''}>
                <span class="window-item-title" title="${escapeHtml(win)}">${escapeHtml(win)}</span>
            </div>
        `;
    }).join('');
}

function toggleWindowSelection() {
    const allChecked = document.getElementById('allWindowsCheckbox').checked;
    const windowItems = document.querySelectorAll('.window-item');
    const inputs = document.querySelectorAll('.window-item input');

    windowItems.forEach(item => {
        if (allChecked) item.classList.add('disabled');
        else item.classList.remove('disabled');
    });

    inputs.forEach(input => {
        input.disabled = allChecked;
    });
}

function toggleWindowItem(el, windowName) {
    if (document.getElementById('allWindowsCheckbox').checked) return;

    const checkbox = el.querySelector('input');
    const newState = !checkbox.checked;

    checkbox.checked = newState;
    if (newState) {
        el.classList.add('selected');
        if (!selectedWindows.includes(windowName)) {
            selectedWindows.push(windowName);
        }
    } else {
        el.classList.remove('selected');
        selectedWindows = selectedWindows.filter(w => w !== windowName);
    }
}

async function saveWindowSettings() {
    const allChecked = document.getElementById('allWindowsCheckbox').checked;
    const targets = allChecked ? [] : selectedWindows;

    try {
        await apiPost('/settings', {
            target_windows: JSON.stringify(targets)
        });

        showToast('Pencere ayarları kaydedildi');
        updateWindowTargetUI(targets);
        closeWindowModal();
    } catch (e) {
        showToast('Ayarlar kaydedilemedi', 'error');
    }
}

async function updateWindowTargetUI(targetList = null) {
    const btn = document.getElementById('windowTargetBtn');
    const badge = document.getElementById('windowCountBadge');

    let targets = targetList;
    if (!targets) {
        try {
            const settings = await apiGet('/settings');
            targets = JSON.parse(settings.target_windows || '[]');
        } catch {
            targets = [];
        }
    }

    if (targets.length > 0) {
        btn.classList.add('targeted');
        btn.title = `Pencere Hedefleme: ${targets.length} pencere seçili`;
        badge.textContent = targets.length;
        badge.classList.add('show');
    } else {
        btn.classList.remove('targeted');
        btn.title = 'Pencere Hedefleme: Tümü';
        badge.classList.remove('show');
    }
}

// ==================== TRIGGER KEY LISTENING ====================
let triggerListening = false;

function startTriggerKeyListen() {
    const box = document.getElementById('triggerKeyBox');
    const textEl = document.getElementById('triggerKeyText');

    if (triggerListening) {
        stopTriggerKeyListen();
        return;
    }

    triggerListening = true;
    box.classList.add('listening');
    textEl.textContent = 'Bir tuşa basın...';
    textEl.classList.remove('has-key');

    // Listen for keydown
    document.addEventListener('keydown', handleTriggerKeyPress);
}

async function handleTriggerKeyPress(e) {
    e.preventDefault();
    e.stopPropagation();

    // Get key name
    let keyName = e.key;

    // Normalize key names
    if (keyName === ' ') keyName = 'space';
    if (keyName === 'Escape') {
        stopTriggerKeyListen();
        return;
    }

    // Handle special keys
    const specialKeys = {
        'Control': 'ctrl',
        'Alt': 'alt',
        'Shift': 'shift',
        'Meta': 'win',
        'ArrowUp': 'up',
        'ArrowDown': 'down',
        'ArrowLeft': 'left',
        'ArrowRight': 'right'
    };

    if (specialKeys[keyName]) {
        keyName = specialKeys[keyName];
    }

    // Build combo
    let combo = [];
    if (e.ctrlKey && keyName !== 'ctrl') combo.push('ctrl');
    if (e.altKey && keyName !== 'alt') combo.push('alt');
    if (e.shiftKey && keyName !== 'shift') combo.push('shift');
    combo.push(keyName.toLowerCase());

    const triggerKey = combo.join('+');

    // Check for conflict BEFORE assigning
    const hasConflict = await checkTriggerKeyConflict(triggerKey);

    if (hasConflict) {
        // Don't assign the key, just show warning and stop listening
        stopTriggerKeyListen();
        return;
    }

    // No conflict, assign the key
    document.getElementById('triggerKey').value = triggerKey;
    updateTriggerKeyDisplay(triggerKey);
    stopTriggerKeyListen();
    showToast(`Tetik tuşu ayarlandı: ${triggerKey}`);
}

function stopTriggerKeyListen() {
    const box = document.getElementById('triggerKeyBox');
    const textEl = document.getElementById('triggerKeyText');
    const currentKey = document.getElementById('triggerKey').value;

    triggerListening = false;
    box.classList.remove('listening');

    // Restore display based on current value
    if (currentKey) {
        updateTriggerKeyDisplay(currentKey);
    } else {
        textEl.innerHTML = 'Tıklayın ve bir tuşa basın...';
        textEl.classList.remove('has-key');
    }

    document.removeEventListener('keydown', handleTriggerKeyPress);
}

function updateTriggerKeyDisplay(triggerKey) {
    const textEl = document.getElementById('triggerKeyText');

    if (!triggerKey) {
        textEl.innerHTML = 'Tıklayın ve bir tuşa basın...';
        textEl.classList.remove('has-key');
        return;
    }

    // Create visual kbd badges
    const keys = triggerKey.split('+');
    const badges = keys.map(k => `<kbd>${escapeHtml(k)}</kbd>`).join('<span class="key-sep">+</span>');
    textEl.innerHTML = `<span class="key-badge">${badges}</span>`;
    textEl.classList.add('has-key');
}

function clearTriggerKey() {
    document.getElementById('triggerKey').value = '';
    updateTriggerKeyDisplay('');
    hideTriggerKeyWarning();
    showToast('Tetik tuşu temizlendi');
}

async function checkTriggerKeyConflict(triggerKey) {
    const warningEl = document.getElementById('triggerKeyWarning');

    if (!triggerKey) {
        hideTriggerKeyWarning();
        return false;
    }

    try {
        const allMessages = await apiGet('/messages');
        const conflictMessage = allMessages.find(msg =>
            msg.trigger_key === triggerKey && msg.id !== currentMessageId
        );

        if (conflictMessage) {
            warningEl.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <span>Bu tuş "<span class="conflict-message-name">${escapeHtml(conflictMessage.name)}</span>" mesajında zaten kullanılıyor!</span>
            `;
            warningEl.classList.add('show');
            return true;
        } else {
            hideTriggerKeyWarning();
            return false;
        }
    } catch (e) {
        console.error('Error checking trigger key conflict:', e);
        return false;
    }
}

function hideTriggerKeyWarning() {
    const warningEl = document.getElementById('triggerKeyWarning');
    warningEl.classList.remove('show');
    warningEl.innerHTML = '';
}

function openAddMessageModal() {
    currentMessageId = null;
    document.getElementById('messageModalTitle').textContent = 'Yeni Mesaj';
    document.getElementById('messageName').value = '';
    document.getElementById('triggerKey').value = '';
    document.getElementById('messageIcon').value = '';
    document.getElementById('messageIconPreview').className = 'fas fa-bolt';
    document.getElementById('templatesContainer').innerHTML = '';
    updateTriggerKeyDisplay('');
    hideTriggerKeyWarning();
    addTemplateField();
    document.getElementById('messageModal').classList.add('show');
}

async function editMessage(id) {
    try {
        const msg = await apiGet(`/messages/${id}`);
        currentMessageId = id;
        document.getElementById('messageModalTitle').textContent = 'Mesajı Düzenle';
        document.getElementById('messageName').value = msg.name;
        document.getElementById('triggerKey').value = msg.trigger_key || '';
        document.getElementById('messageIcon').value = msg.icon || '';
        document.getElementById('messageIconPreview').className = msg.icon || 'fas fa-bolt';

        const container = document.getElementById('templatesContainer');
        container.innerHTML = '';
        msg.templates.forEach(t => addTemplateField(t.content));

        if (msg.templates.length === 0) addTemplateField();
        updateTriggerKeyDisplay(msg.trigger_key || '');
        hideTriggerKeyWarning();
        document.getElementById('messageModal').classList.add('show');
    } catch (e) {
        showToast('Mesaj yüklenemedi', 'error');
    }
}

function closeMessageModal() {
    document.getElementById('messageModal').classList.remove('show');
    updateTriggerKeyDisplay('');
    hideTriggerKeyWarning();
    currentMessageId = null;
}

function addTemplateField(content = '') {
    const container = document.getElementById('templatesContainer');
    const div = document.createElement('div');
    div.className = 'template-item';
    div.innerHTML = `
        <div class="template-input-wrapper">
            <textarea placeholder="Template içeriği yazın... {kalip_adi} ile kalıp kullanabilirsiniz">${escapeHtml(content)}</textarea>
            <button class="template-remove" onclick="this.closest('.template-item').remove()" title="Kaldır">
                <i class="fas fa-times"></i>
            </button>
            <div class="pattern-autocomplete"></div>
        </div>
    `;
    container.appendChild(div);

    // Add autocomplete listener and auto-resize
    const textarea = div.querySelector('textarea');
    const autocomplete = div.querySelector('.pattern-autocomplete');
    setupPatternAutocomplete(textarea, autocomplete);
    setupAutoResize(textarea);

    // Initial resize if content exists
    if (content) {
        autoResizeTextarea(textarea);
    }
}

function setupAutoResize(textarea) {
    textarea.addEventListener('input', () => autoResizeTextarea(textarea));
    textarea.addEventListener('focus', () => autoResizeTextarea(textarea));
}

function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(44, textarea.scrollHeight) + 'px';
}

function setupPatternAutocomplete(textarea, autocomplete) {
    let isSelecting = false;

    textarea.addEventListener('input', (e) => {
        if (isSelecting) return;

        const value = textarea.value;
        const cursorPos = textarea.selectionStart;
        const textBeforeCursor = value.substring(0, cursorPos);

        // Check if we're inside a pattern (after { but no closing })
        const lastOpenBrace = textBeforeCursor.lastIndexOf('{');
        const lastCloseBrace = textBeforeCursor.lastIndexOf('}');

        if (lastOpenBrace > lastCloseBrace) {
            const searchTerm = textBeforeCursor.substring(lastOpenBrace + 1).toLowerCase();
            const matches = patternsCache.filter(p =>
                p.name.toLowerCase().includes(searchTerm)
            );

            if (matches.length > 0) {
                showAutocomplete(autocomplete, matches, textarea, lastOpenBrace);
            } else {
                hideAutocomplete(autocomplete);
            }
        } else {
            hideAutocomplete(autocomplete);
        }
    });

    textarea.addEventListener('keydown', (e) => {
        if (autocomplete.classList.contains('show')) {
            const items = autocomplete.querySelectorAll('.autocomplete-item');
            const activeItem = autocomplete.querySelector('.autocomplete-item.active');
            let activeIndex = Array.from(items).indexOf(activeItem);

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIndex = (activeIndex + 1) % items.length;
                items.forEach((item, i) => item.classList.toggle('active', i === activeIndex));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
                items.forEach((item, i) => item.classList.toggle('active', i === activeIndex));
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                if (activeItem) {
                    e.preventDefault();
                    isSelecting = true;
                    selectPattern(activeItem.dataset.pattern, textarea, autocomplete);
                    setTimeout(() => isSelecting = false, 50);
                }
            } else if (e.key === 'Escape') {
                hideAutocomplete(autocomplete);
            }
        }
    });

    textarea.addEventListener('blur', () => {
        setTimeout(() => hideAutocomplete(autocomplete), 150);
    });
}

function showAutocomplete(autocomplete, patterns, textarea, bracePos) {
    autocomplete.innerHTML = patterns.slice(0, 5).map((p, i) => `
        <div class="autocomplete-item${i === 0 ? ' active' : ''}" data-pattern="${escapeHtml(p.name)}">
            <span class="pattern-name">{${escapeHtml(p.name)}}</span>
            <span class="pattern-count">${p.items?.length || 0} değer</span>
        </div>
    `).join('');

    autocomplete.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectPattern(item.dataset.pattern, textarea, autocomplete);
        });
    });

    autocomplete.classList.add('show');
}

function hideAutocomplete(autocomplete) {
    autocomplete.classList.remove('show');
}

function selectPattern(patternName, textarea, autocomplete) {
    const value = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastOpenBrace = textBeforeCursor.lastIndexOf('{');

    const newValue = value.substring(0, lastOpenBrace) + '{' + patternName + '}' + value.substring(cursorPos);
    textarea.value = newValue;

    const newCursorPos = lastOpenBrace + patternName.length + 2;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    textarea.focus();

    hideAutocomplete(autocomplete);
}

async function saveMessage() {
    const name = document.getElementById('messageName').value.trim();
    const triggerKey = document.getElementById('triggerKey').value.trim();
    const icon = document.getElementById('messageIcon').value.trim();
    const templates = [...document.querySelectorAll('#templatesContainer textarea')]
        .map(t => t.value.trim())
        .filter(t => t);

    if (!name) { showToast('Mesaj adı gerekli', 'error'); return; }
    if (templates.length === 0) { showToast('En az bir template gerekli', 'error'); return; }

    // Check for trigger key conflict
    if (triggerKey) {
        try {
            const allMessages = await apiGet('/messages');
            const conflictMessage = allMessages.find(msg =>
                msg.trigger_key === triggerKey && msg.id !== currentMessageId
            );

            if (conflictMessage) {
                const confirmOverwrite = confirm(
                    `"${triggerKey}" tuşu zaten "${conflictMessage.name}" mesajında kullanılıyor.\n\n` +
                    `Yine de bu tuşu kullanmak istiyor musunuz?\n` +
                    `(Eski mesajın tetik tuşu silinecek)`
                );

                if (!confirmOverwrite) {
                    return;
                }

                // Remove trigger key from the conflicting message
                await apiPut(`/messages/${conflictMessage.id}`, {
                    name: conflictMessage.name,
                    templates: conflictMessage.templates.map(t => t.content),
                    trigger_key: null
                });
            }
        } catch (e) {
            console.error('Error checking trigger key conflict:', e);
        }
    }

    try {
        const data = { name, templates, trigger_key: triggerKey || null, icon: icon || null };
        if (currentMessageId) {
            await apiPut(`/messages/${currentMessageId}`, data);
            showToast('Mesaj güncellendi');
        } else {
            await apiPost('/messages', data);
            showToast('Mesaj eklendi');
        }
        closeMessageModal();
        loadMessages();
        // Refresh listener to pick up new hotkeys
        refreshListener();
    } catch (e) {
        showToast('Kaydetme hatası', 'error');
    }
}

async function runMessage(id) {
    try {
        const result = await apiPost(`/send-message/${id}`, {});
        if (result.success) {
            showToast('Mesaj gönderildi');
        } else {
            showToast('Gönderme hatası: ' + (result.error || 'Bilinmeyen hata'), 'error');
        }
    } catch (e) {
        showToast('Gönderme hatası', 'error');
    }
}

async function copyMessage(id) {
    try {
        const result = await apiPost(`/messages/${id}/copy`, {});
        if (result.success) {
            showToast('Panoya kopyalandı');
        } else {
            showToast('Kopyalama hatası', 'error');
        }
    } catch (e) {
        showToast('Kopyalama hatası', 'error');
    }
}

async function deleteMessage(id) {
    if (!confirm('Bu mesajı silmek istediğinize emin misiniz?')) return;
    try {
        await apiDelete(`/messages/${id}`);
        showToast('Mesaj silindi');
        loadMessages();
    } catch (e) {
        showToast('Silme hatası', 'error');
    }
}

// ==================== PATTERNS ====================
async function loadPatterns() {
    try {
        const patterns = await apiGet('/patterns');
        patternsCache = patterns;
        renderPatterns(patterns);
    } catch (e) {
        console.error('Error loading patterns:', e);
    }
}

function renderPatterns(patterns) {
    const grid = document.getElementById('patternsGrid');
    const empty = document.getElementById('patternsEmpty');

    if (patterns.length === 0) {
        grid.style.display = 'none';
        empty.classList.add('show');
        return;
    }

    grid.style.display = 'grid';
    empty.classList.remove('show');

    grid.innerHTML = patterns.map(p => `
        <div class="pattern-card">
            <div class="pattern-card-header">
                <div class="pattern-card-title">${escapeHtml(p.name)} <code>{${escapeHtml(p.name)}}</code></div>
                <div class="action-btns">
                    <button class="action-btn edit" onclick="editPattern(${p.id})" title="Düzenle"><i class="fas fa-pen"></i></button>
                    <button class="action-btn delete" onclick="deletePattern(${p.id})" title="Sil"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="pattern-items">
                ${p.items.slice(0, 8).map(i => `<span class="pattern-item">${escapeHtml(i.value)}</span>`).join('')}
                ${p.items.length > 8 ? `<span class="pattern-item">+${p.items.length - 8} daha</span>` : ''}
            </div>
        </div>
    `).join('');
}

function initPatternHandlers() {
    document.getElementById('addPatternBtn').addEventListener('click', openAddPatternModal);
    document.getElementById('closePatternModal').addEventListener('click', closePatternModal);
    document.getElementById('cancelPatternBtn').addEventListener('click', closePatternModal);
    document.getElementById('addPatternItemBtn').addEventListener('click', () => addPatternItemField());
    document.getElementById('savePatternBtn').addEventListener('click', savePattern);
    document.getElementById('patternName').addEventListener('input', (e) => {
        document.getElementById('patternNamePreview').textContent = e.target.value || 'kalip';
    });
}

function openAddPatternModal() {
    currentPatternId = null;
    document.getElementById('patternModalTitle').textContent = 'Yeni Kalıp';
    document.getElementById('patternName').value = '';
    document.getElementById('patternNamePreview').textContent = 'kalip';
    document.getElementById('patternItemsContainer').innerHTML = '';
    addPatternItemField();
    document.getElementById('patternModal').classList.add('show');
}

async function editPattern(id) {
    try {
        const patterns = await apiGet('/patterns');
        const pattern = patterns.find(p => p.id === id);
        if (!pattern) return;

        currentPatternId = id;
        document.getElementById('patternModalTitle').textContent = 'Kalıbı Düzenle';
        document.getElementById('patternName').value = pattern.name;
        document.getElementById('patternNamePreview').textContent = pattern.name;

        const container = document.getElementById('patternItemsContainer');
        container.innerHTML = '';
        pattern.items.forEach(i => addPatternItemField(i.value));

        if (pattern.items.length === 0) addPatternItemField();
        document.getElementById('patternModal').classList.add('show');
    } catch (e) {
        showToast('Kalıp yüklenemedi', 'error');
    }
}

function closePatternModal() {
    document.getElementById('patternModal').classList.remove('show');
    currentPatternId = null;
}

function addPatternItemField(value = '') {
    const container = document.getElementById('patternItemsContainer');
    const div = document.createElement('div');
    div.className = 'pattern-item-input';
    div.innerHTML = `
        <input type="text" placeholder="Değer..." value="${escapeHtml(value)}">
        <button class="remove-item" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
}

async function savePattern() {
    const name = document.getElementById('patternName').value.trim();
    const items = [...document.querySelectorAll('#patternItemsContainer input')]
        .map(i => i.value.trim())
        .filter(i => i);

    if (!name) { showToast('Kalıp adı gerekli', 'error'); return; }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) { showToast('Kalıp adı sadece harf, rakam ve alt çizgi içerebilir', 'error'); return; }
    if (items.length === 0) { showToast('En az bir değer gerekli', 'error'); return; }

    try {
        const data = { name, items };
        if (currentPatternId) {
            await apiPut(`/patterns/${currentPatternId}`, data);
            showToast('Kalıp güncellendi');
        } else {
            await apiPost('/patterns', data);
            showToast('Kalıp eklendi');
        }
        closePatternModal();
        loadPatterns();
    } catch (e) {
        showToast('Kaydetme hatası', 'error');
    }
}

async function deletePattern(id) {
    if (!confirm('Bu kalıbı silmek istediğinize emin misiniz?')) return;
    try {
        await apiDelete(`/patterns/${id}`);
        showToast('Kalıp silindi');
        loadPatterns();
    } catch (e) {
        showToast('Silme hatası', 'error');
    }
}

// ==================== SIDEBAR CONTROLS ====================
let enterEnabled = true;

async function loadSettings() {
    try {
        const settings = await apiGet('/settings');
        enterEnabled = settings.enter_enabled !== 'false';
        updateEnterToggleUI();
    } catch (e) {
        console.error('Error loading settings:', e);
    }
}

function initSidebarControls() {
    // Enter toggle
    document.getElementById('enterToggle').addEventListener('click', toggleEnterSend);
}

async function toggleEnterSend() {
    enterEnabled = !enterEnabled;
    updateEnterToggleUI();
    try {
        await apiPut('/settings', { enter_enabled: enterEnabled ? 'true' : 'false' });
        showToast(enterEnabled ? 'Enter ile gönderme açık' : 'Enter ile gönderme kapalı');
    } catch (e) {
        showToast('Kaydetme hatası', 'error');
    }
}

function updateEnterToggleUI() {
    const toggle = document.getElementById('enterToggle');
    if (enterEnabled) {
        toggle.classList.add('active');
        toggle.title = 'Enter ile Gönder: Açık';
    } else {
        toggle.classList.remove('active');
        toggle.title = 'Enter ile Gönder: Kapalı';
    }
}

// ==================== LISTENER ====================
let listenerActive = false;

function initListenerHandlers() {
    document.getElementById('listenerToggle').addEventListener('click', toggleListener);
}

async function loadListenerStatus() {
    try {
        const status = await apiGet('/listener/status');
        listenerActive = status.active;
        updateListenerUI(status.active);
    } catch (e) {
        console.error('Error loading listener status:', e);
    }
}

function updateListenerUI(active) {
    const toggle = document.getElementById('listenerToggle');

    if (active) {
        toggle.classList.add('active');
        toggle.title = 'Dinleyici Aktif - Kapatmak için tıkla';
    } else {
        toggle.classList.remove('active');
        toggle.title = 'Dinleyici Kapalı - Açmak için tıkla';
    }
}

async function toggleListener() {
    try {
        if (listenerActive) {
            const result = await apiPost('/listener/stop', {});
            if (result.success) {
                listenerActive = false;
                updateListenerUI(false);
                showToast('Dinleyici durduruldu', 'warning');
            }
        } else {
            const result = await apiPost('/listener/start', {});
            if (result.success) {
                listenerActive = true;
                updateListenerUI(true);
                showToast('Dinleyici başlatıldı');
            }
        }
    } catch (e) {
        showToast('Dinleyici hatası', 'error');
    }
}

async function refreshListener() {
    try {
        const result = await apiPost('/listener/refresh', {});
        if (result.active !== undefined) {
            listenerActive = result.active;
            updateListenerUI(result.active);
        }
    } catch (e) {
        console.error('Error refreshing listener:', e);
    }
}

// ==================== HELPERS ====================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== DASHBOARD ====================
let currentPeriod = 7;

function initDashboard() {
    // Refresh button - with proper error handling
    const refreshBtn = document.getElementById('refreshDashboardBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.classList.add('spinning');
            try {
                await loadDashboard();
            } finally {
                refreshBtn.classList.remove('spinning');
            }
        });
    }

    // Period selector buttons
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPeriod = parseInt(btn.dataset.period);
            loadPeriodChart();
        });
    });
}

async function loadDashboard() {
    await Promise.all([
        loadStats(),
        loadPeriodChart(),
        loadActivityLog()
    ]);
}

async function loadStats() {
    try {
        const stats = await apiGet('/dashboard/stats');
        document.getElementById('statMessages').textContent = stats.total_messages || 0;

        document.getElementById('statCombinations').textContent = stats.total_combinations || 0;
        document.getElementById('statPatterns').textContent = stats.total_patterns || 0;
        document.getElementById('statTodaySent').textContent = stats.today_sent || 0;
    } catch (e) {
        console.error('Error loading stats:', e);
    }
}

async function loadPeriodChart() {
    const chartEl = document.getElementById('weeklyChart');
    const chartTotalEl = document.getElementById('chartTotal');

    try {
        const response = await apiGet(`/dashboard/period?days=${currentPeriod}`);
        const data = response.stats || [];
        const total = response.total || 0;

        chartTotalEl.textContent = total;

        // Generate chart based on period
        const days = [];
        const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
        const monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

        // Determine number of bars and label format based on period
        let numBars = 7;
        let labelFormat = 'day';

        if (currentPeriod === 1) {
            numBars = 1;
            labelFormat = 'today';
        } else if (currentPeriod <= 7) {
            numBars = currentPeriod;
            labelFormat = 'day';
        } else if (currentPeriod <= 30) {
            numBars = Math.min(currentPeriod, 14);
            labelFormat = 'date';
        } else if (currentPeriod <= 90) {
            numBars = 12; // Weekly aggregation
            labelFormat = 'week';
        } else {
            numBars = 12; // Monthly aggregation
            labelFormat = 'month';
        }

        // Build bars array
        for (let i = numBars - 1; i >= 0; i--) {
            const date = new Date();

            if (labelFormat === 'today') {
                date.setDate(date.getDate());
            } else if (labelFormat === 'day' || labelFormat === 'date') {
                date.setDate(date.getDate() - i);
            } else if (labelFormat === 'week') {
                date.setDate(date.getDate() - (i * 7));
            } else if (labelFormat === 'month') {
                date.setMonth(date.getMonth() - i);
            }

            const dayStr = date.toISOString().split('T')[0];

            let label;
            if (labelFormat === 'today') {
                label = 'Bugün';
            } else if (labelFormat === 'day') {
                label = dayNames[date.getDay()];
            } else if (labelFormat === 'date') {
                label = `${date.getDate()}`;
            } else if (labelFormat === 'week') {
                label = `H${numBars - i}`;
            } else {
                label = monthNames[date.getMonth()];
            }

            // Find matching data
            let count = 0;
            if (labelFormat === 'month') {
                // Sum all days in this month
                const monthStart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                count = data.filter(d => d.day && d.day.startsWith(monthStart)).reduce((acc, d) => acc + d.count, 0);
            } else if (labelFormat === 'week') {
                // Sum days in this week range
                const weekEnd = new Date(date);
                const weekStart = new Date(date);
                weekStart.setDate(weekStart.getDate() - 6);
                count = data.filter(d => {
                    const dDate = new Date(d.day);
                    return dDate >= weekStart && dDate <= weekEnd;
                }).reduce((acc, d) => acc + d.count, 0);
            } else {
                const dayData = data.find(d => d.day === dayStr);
                count = dayData ? dayData.count : 0;
            }

            days.push({ label, count, date: dayStr });
        }

        const maxCount = Math.max(...days.map(d => d.count), 1);

        chartEl.innerHTML = days.map(day => {
            const heightPercent = (day.count / maxCount) * 100;
            return `
                <div class="chart-bar-wrapper">
                    <div class="chart-bar ${day.count === 0 ? 'empty' : ''}" 
                         style="height: ${Math.max(heightPercent, 4)}%" 
                         data-count="${day.count}">
                    </div>
                    <span class="chart-label">${day.label}</span>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Error loading period chart:', e);
        chartTotalEl.textContent = '0';
        chartEl.innerHTML = '<div class="empty-quick"><span>Grafik yüklenemedi</span></div>';
    }
}

async function loadActivityLog() {
    const listEl = document.getElementById('activityList');

    try {
        const logs = await apiGet('/dashboard/logs?limit=20');

        if (!logs || logs.length === 0) {
            listEl.innerHTML = '<div class="empty-activity"><i class="fas fa-inbox"></i><span>Henüz aktivite yok</span></div>';
            return;
        }

        listEl.innerHTML = logs.map(log => {
            const time = formatTime(log.created_at);
            const activityType = log.activity_type || 'sent';
            const itemType = log.item_type || 'message';
            const itemName = escapeHtml(log.item_name || 'Bilinmeyen');

            // Activity type config
            let icon, actionLabel, itemLabel;

            const getItemLabel = (type) => {
                switch (type) {
                    case 'pattern': return 'Kalıp';
                    case 'combination': return 'Kombinasyon';
                    default: return 'Mesaj';
                }
            };

            switch (activityType) {
                case 'sent':
                    icon = itemType === 'combination' ? 'layer-group' : 'paper-plane';
                    actionLabel = 'gönderildi';
                    itemLabel = itemType === 'combination' ? 'Kombinasyon' : '';
                    break;
                case 'created':
                    icon = 'plus';
                    actionLabel = 'oluşturuldu';
                    itemLabel = getItemLabel(itemType);
                    break;
                case 'edited':
                    icon = 'pen';
                    actionLabel = 'düzenlendi';
                    itemLabel = getItemLabel(itemType);
                    break;
                case 'deleted':
                    icon = 'trash-alt';
                    actionLabel = 'silindi';
                    itemLabel = getItemLabel(itemType);
                    break;
                default:
                    icon = 'info';
                    actionLabel = '';
                    itemLabel = '';
            }

            // Details line
            const detailsHtml = log.details
                ? `<div class="activity-meta"><i class="fas fa-window-maximize"></i> ${escapeHtml(log.details.substring(0, 25))}</div>`
                : '';

            return `
                <div class="activity-item ${activityType}">
                    <div class="activity-icon ${activityType}">
                        <i class="fas fa-${icon}"></i>
                    </div>
                    <div class="activity-content">
                        <div class="activity-title">
                            <span class="activity-name">${itemLabel ? itemLabel + ': ' : ''}"${itemName}" ${actionLabel}</span>
                        </div>
                        ${detailsHtml}
                    </div>
                    <span class="activity-time">${time}</span>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Error loading activity log:', e);
        listEl.innerHTML = '<div class="empty-activity"><i class="fas fa-exclamation-circle"></i><span>Yüklenemedi</span></div>';
    }
}

function formatTime(dateStr) {
    if (!dateStr) return '';

    const date = new Date(dateStr + 'Z'); // SQLite UTC olarak kaydeder
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins}dk`;
    if (diffHours < 24) return `${diffHours}sa`;
    if (diffDays < 7) return `${diffDays}g`;

    // Farklı gün ise tarih göster
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

// ==================== COMBINATIONS ====================

async function loadCombinations() {
    try {
        const combinations = await apiGet('/combinations');
        renderCombinations(combinations);

        // Also cache messages for the combination modal
        messagesCache = await apiGet('/messages');
    } catch (e) {
        console.error('Error loading combinations:', e);
    }
}

function renderCombinations(combinations) {
    const tbody = document.getElementById('combinationsBody');
    const empty = document.getElementById('combinationsEmpty');
    const table = document.getElementById('combinationsTable');

    if (combinations.length === 0) {
        table.style.display = 'none';
        empty.classList.add('show');
        return;
    }

    table.style.display = 'table';
    empty.classList.remove('show');

    const triggerKeyDisplay = (key) => {
        if (!key) return '<span class="no-key">—</span>';
        const keys = key.split('+').map(k => `<kbd>${escapeHtml(k)}</kbd>`);
        return `<div class="key-combo">${keys.join('<span class="key-separator">+</span>')}</div>`;
    };

    const messagesList = (items) => {
        if (!items || items.length === 0) return '<span class="no-key">Mesaj yok</span>';
        return items.map(item => escapeHtml(item.message_name)).join(' → ');
    };

    tbody.innerHTML = combinations.map(combo => `
        <tr>
            <td>
                <div class="message-name-cell">
                    <span class="template-badge"><i class="fas fa-layer-group"></i>${combo.items?.length || 0}</span>
                    <div>
                        <strong>${escapeHtml(combo.name)}</strong>
                        <div class="combination-info">
                            <span class="combination-badge"><i class="fas fa-list-ol"></i> ${messagesList(combo.items)}</span>
                            <span class="combination-badge delay"><i class="fas fa-clock"></i> ${combo.delay_ms}ms</span>
                        </div>
                    </div>
                </div>
            </td>
            <td>
                <div class="message-actions-cell">
                    ${triggerKeyDisplay(combo.trigger_key)}
                    <div class="action-btns">
                        <button class="action-btn run" onclick="runCombination(${combo.id})" title="Çalıştır"><i class="fas fa-play"></i></button>
                        <button class="action-btn edit" onclick="editCombination(${combo.id})" title="Düzenle"><i class="fas fa-pen"></i></button>
                        <button class="action-btn delete" onclick="deleteCombination(${combo.id})" title="Sil"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </td>
        </tr>
    `).join('');
}

function initCombinationHandlers() {
    document.getElementById('addCombinationBtn').addEventListener('click', openAddCombinationModal);
    document.getElementById('closeCombinationModal').addEventListener('click', closeCombinationModal);
    document.getElementById('cancelCombinationBtn').addEventListener('click', closeCombinationModal);
    document.getElementById('saveCombinationBtn').addEventListener('click', saveCombination);
    document.getElementById('addCombinationMessageBtn').addEventListener('click', addCombinationMessage);

    // Trigger key handlers for combination
    document.getElementById('combinationTriggerKeyDisplay').addEventListener('click', startCombinationTriggerKeyListen);
    document.getElementById('combinationTriggerClearBtn').addEventListener('click', clearCombinationTriggerKey);

    // Combination Icon Preview
    const iconInput = document.getElementById('combinationIcon');
    const iconPreview = document.getElementById('combinationIconPreview');
    if (iconInput && iconPreview) {
        iconInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            iconPreview.className = val || 'fas fa-layer-group';
        });
    }
}

async function openAddCombinationModal() {
    currentCombinationId = null;
    combinationMessages = [];
    document.getElementById('combinationModalTitle').textContent = 'Yeni Kombinasyon';
    document.getElementById('combinationName').value = '';
    document.getElementById('combinationTriggerKey').value = '';
    document.getElementById('combinationIcon').value = '';
    document.getElementById('combinationIconPreview').className = 'fas fa-layer-group';
    document.getElementById('combinationDelay').value = '500';
    updateCombinationTriggerKeyDisplay('');
    hideCombinationTriggerKeyWarning();
    renderCombinationMessages();
    document.getElementById('combinationModal').classList.add('show');

    // Refresh messages cache to ensure we have latest messages
    try {
        messagesCache = await apiGet('/messages');
    } catch (e) {
        console.error('Failed to refresh messages cache', e);
    }
}

async function editCombination(id) {
    try {
        // Refresh messages cache first
        messagesCache = await apiGet('/messages');

        const combo = await apiGet(`/combinations/${id}`);
        currentCombinationId = id;
        combinationMessages = combo.items.map(item => ({
            id: item.message_id,
            name: item.message_name
        }));

        document.getElementById('combinationModalTitle').textContent = 'Kombinasyonu Düzenle';
        document.getElementById('combinationName').value = combo.name;
        document.getElementById('combinationTriggerKey').value = combo.trigger_key || '';
        document.getElementById('combinationIcon').value = combo.icon || '';
        document.getElementById('combinationIconPreview').className = combo.icon || 'fas fa-layer-group';
        document.getElementById('combinationDelay').value = combo.delay_ms || 500;
        updateCombinationTriggerKeyDisplay(combo.trigger_key || '');
        hideCombinationTriggerKeyWarning();
        renderCombinationMessages();
        document.getElementById('combinationModal').classList.add('show');
    } catch (e) {
        showToast('Kombinasyon yüklenemedi', 'error');
    }
}

function closeCombinationModal() {
    document.getElementById('combinationModal').classList.remove('show');
    currentCombinationId = null;
    combinationMessages = [];
}

function renderCombinationMessages() {
    const container = document.getElementById('combinationMessagesContainer');

    if (combinationMessages.length === 0) {
        container.innerHTML = `
            <div class="combination-empty">
                <i class="fas fa-inbox"></i>
                <span>Mesaj eklemek için aşağıdaki butonu kullanın</span>
            </div>
        `;
        return;
    }

    container.innerHTML = combinationMessages.map((msg, index) => `
        <div class="combination-message-item" data-index="${index}">
            <div class="combination-message-order">${index + 1}</div>
            <div class="combination-message-info">
                <div class="combination-message-name">${escapeHtml(msg.name)}</div>
            </div>
            <div class="combination-message-actions">
                <button class="combination-message-btn move-up" onclick="moveCombinationMessage(${index}, -1)" title="Yukarı" ${index === 0 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-up"></i>
                </button>
                <button class="combination-message-btn move-down" onclick="moveCombinationMessage(${index}, 1)" title="Aşağı" ${index === combinationMessages.length - 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-down"></i>
                </button>
                <button class="combination-message-btn remove" onclick="removeCombinationMessage(${index})" title="Kaldır">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function addCombinationMessage() {
    // Create a dropdown to select message
    const container = document.getElementById('combinationMessagesContainer');

    // Check if there's already a selector open
    if (container.querySelector('.combination-message-select')) {
        return;
    }

    // Refresh messages cache to ensure we have latest messages
    try {
        messagesCache = await apiGet('/messages');
    } catch (e) {
        console.error('Failed to refresh messages cache', e);
    }

    // Filter out already added messages (optional - allow duplicates)
    const availableMessages = messagesCache;

    if (availableMessages.length === 0) {
        showToast('Henüz mesaj eklenmemiş. Önce mesaj oluşturun.', 'warning');
        return;
    }

    const selectHtml = `
        <select class="combination-message-select" id="newMessageSelect">
            <option value="">-- Mesaj Seçin --</option>
            ${availableMessages.map(msg => `<option value="${msg.id}" data-name="${escapeHtml(msg.name)}">${escapeHtml(msg.name)}</option>`).join('')}
        </select>
    `;

    // If empty, replace content; otherwise append before empty
    const emptyEl = container.querySelector('.combination-empty');
    if (emptyEl) {
        emptyEl.remove();
    }

    container.insertAdjacentHTML('beforeend', selectHtml);

    // Focus after a tiny delay to ensure element is in DOM
    setTimeout(() => {
        const select = document.getElementById('newMessageSelect');
        if (select) select.focus();
    }, 10);

    const select = document.getElementById('newMessageSelect'); // Get reference again just in case

    // Event listeners...
    // Note: We need to re-attach listeners because the element is new
    // But since the previous listeners were attached to the specific element created inside the function, 
    // and that element is now part of the DOM string insertion, we need to find it and attach.
    // The previous implementation had logic inside the function scope.

    // Re-implementing the listeners part because replace_file_content replaces the whole block
    const attachListeners = (sel) => {
        sel.addEventListener('change', (e) => {
            const messageId = parseInt(e.target.value);
            const selectedOption = e.target.options[e.target.selectedIndex];
            const messageName = selectedOption.dataset.name;

            if (messageId) {
                combinationMessages.push({ id: messageId, name: messageName });
                renderCombinationMessages();
            } else {
                sel.remove();
                if (combinationMessages.length === 0) {
                    renderCombinationMessages();
                }
            }
        });

        sel.addEventListener('blur', () => {
            setTimeout(() => {
                if (sel.parentNode) {
                    sel.remove();
                    if (combinationMessages.length === 0) {
                        renderCombinationMessages();
                    }
                }
            }, 150);
        });
    };

    // Finding the element again to be sure
    const insertedSelect = document.getElementById('newMessageSelect');
    if (insertedSelect) {
        attachListeners(insertedSelect);
    }
}

function moveCombinationMessage(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= combinationMessages.length) return;

    const temp = combinationMessages[index];
    combinationMessages[index] = combinationMessages[newIndex];
    combinationMessages[newIndex] = temp;

    renderCombinationMessages();
}

function removeCombinationMessage(index) {
    combinationMessages.splice(index, 1);
    renderCombinationMessages();
}

async function saveCombination() {
    const name = document.getElementById('combinationName').value.trim();
    const triggerKey = document.getElementById('combinationTriggerKey').value.trim();
    const delayMs = parseInt(document.getElementById('combinationDelay').value) || 500;
    const icon = document.getElementById('combinationIcon').value.trim();

    if (!name) { showToast('Kombinasyon adı gerekli', 'error'); return; }
    if (combinationMessages.length === 0) { showToast('En az bir mesaj gerekli', 'error'); return; }

    const messageIds = combinationMessages.map(m => m.id);

    try {
        const data = {
            name,
            message_ids: messageIds,
            trigger_key: triggerKey || null,
            delay_ms: delayMs,
            icon: icon || null
        };

        if (currentCombinationId) {
            await apiPut(`/combinations/${currentCombinationId}`, data);
            showToast('Kombinasyon güncellendi');
        } else {
            await apiPost('/combinations', data);
            showToast('Kombinasyon eklendi');
        }

        closeCombinationModal();
        loadCombinations();
        // Notify overlay
        window.electronAPI.notifyUpdate();
    } catch (e) {
        showToast('Kayıt başarısız', 'error');
        console.error(e);
    }
}

async function deleteCombination(id) {
    if (!confirm('Bu kombinasyonu silmek istediğinize emin misiniz?')) return;

    try {
        await apiDelete(`/combinations/${id}`);
        showToast('Kombinasyon silindi');
        loadCombinations();
        // Notify overlay
        window.electronAPI.notifyUpdate();
    } catch (e) {
        showToast('Kombinasyon silinemedi', 'error');
    }
}

async function runCombination(id) {
    try {
        await apiPost(`/send-combination/${id}`, {});
        showToast('Kombinasyon çalıştırılıyor...');
    } catch (e) {
        showToast('Kombinasyon çalıştırılamadı', 'error');
    }
}

// Combination trigger key listening
let combinationTriggerListening = false;

function startCombinationTriggerKeyListen() {
    const box = document.getElementById('combinationTriggerKeyBox');
    const textEl = document.getElementById('combinationTriggerKeyText');

    if (combinationTriggerListening) {
        stopCombinationTriggerKeyListen();
        return;
    }

    combinationTriggerListening = true;
    box.classList.add('listening');
    textEl.textContent = 'Bir tuşa basın...';
    textEl.classList.remove('has-key');

    document.addEventListener('keydown', handleCombinationTriggerKeyPress);
}

async function handleCombinationTriggerKeyPress(e) {
    e.preventDefault();
    e.stopPropagation();

    let keyName = e.key;

    if (keyName === ' ') keyName = 'space';
    if (keyName === 'Escape') {
        stopCombinationTriggerKeyListen();
        return;
    }

    const specialKeys = {
        'Control': 'ctrl',
        'Alt': 'alt',
        'Shift': 'shift',
        'Meta': 'win',
        'ArrowUp': 'up',
        'ArrowDown': 'down',
        'ArrowLeft': 'left',
        'ArrowRight': 'right'
    };

    if (specialKeys[keyName]) {
        keyName = specialKeys[keyName];
    }

    let combo = [];
    if (e.ctrlKey && keyName !== 'ctrl') combo.push('ctrl');
    if (e.altKey && keyName !== 'alt') combo.push('alt');
    if (e.shiftKey && keyName !== 'shift') combo.push('shift');
    combo.push(keyName.toLowerCase());

    const triggerKey = combo.join('+');

    // Check for conflict
    const hasConflict = await checkCombinationTriggerKeyConflict(triggerKey);

    if (hasConflict) {
        stopCombinationTriggerKeyListen();
        return;
    }

    document.getElementById('combinationTriggerKey').value = triggerKey;
    updateCombinationTriggerKeyDisplay(triggerKey);
    stopCombinationTriggerKeyListen();
    showToast(`Tetik tuşu ayarlandı: ${triggerKey}`);
}

function stopCombinationTriggerKeyListen() {
    const box = document.getElementById('combinationTriggerKeyBox');
    const textEl = document.getElementById('combinationTriggerKeyText');
    const currentKey = document.getElementById('combinationTriggerKey').value;

    combinationTriggerListening = false;
    box.classList.remove('listening');

    if (currentKey) {
        updateCombinationTriggerKeyDisplay(currentKey);
    } else {
        textEl.innerHTML = 'Tıklayın ve bir tuşa basın...';
        textEl.classList.remove('has-key');
    }

    document.removeEventListener('keydown', handleCombinationTriggerKeyPress);
}

function updateCombinationTriggerKeyDisplay(triggerKey) {
    const textEl = document.getElementById('combinationTriggerKeyText');

    if (!triggerKey) {
        textEl.innerHTML = 'Tıklayın ve bir tuşa basın...';
        textEl.classList.remove('has-key');
        return;
    }

    const keys = triggerKey.split('+');
    const badges = keys.map(k => `<kbd>${escapeHtml(k)}</kbd>`).join('<span class="key-sep">+</span>');
    textEl.innerHTML = `<span class="key-badge">${badges}</span>`;
    textEl.classList.add('has-key');
}

function clearCombinationTriggerKey() {
    document.getElementById('combinationTriggerKey').value = '';
    updateCombinationTriggerKeyDisplay('');
    hideCombinationTriggerKeyWarning();
    showToast('Tetik tuşu temizlendi');
}

async function checkCombinationTriggerKeyConflict(triggerKey) {
    const warningEl = document.getElementById('combinationTriggerKeyWarning');

    if (!triggerKey) {
        hideCombinationTriggerKeyWarning();
        return false;
    }

    try {
        // Check messages
        const allMessages = await apiGet('/messages');
        const conflictMessage = allMessages.find(msg =>
            msg.trigger_key === triggerKey
        );

        if (conflictMessage) {
            warningEl.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <span>Bu tuş "<span class="conflict-message-name">${escapeHtml(conflictMessage.name)}</span>" mesajında kullanılıyor!</span>
            `;
            warningEl.classList.add('show');
            return true;
        }

        // Check other combinations
        const allCombinations = await apiGet('/combinations');
        const conflictCombo = allCombinations.find(c =>
            c.trigger_key === triggerKey && c.id !== currentCombinationId
        );

        if (conflictCombo) {
            warningEl.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <span>Bu tuş "<span class="conflict-message-name">${escapeHtml(conflictCombo.name)}</span>" kombinasyonunda kullanılıyor!</span>
            `;
            warningEl.classList.add('show');
            return true;
        }

        hideCombinationTriggerKeyWarning();
        return false;
    } catch (e) {
        console.error('Error checking trigger key conflict:', e);
        return false;
    }
}

function hideCombinationTriggerKeyWarning() {
    const warningEl = document.getElementById('combinationTriggerKeyWarning');
    warningEl.classList.remove('show');
    warningEl.innerHTML = '';
}

