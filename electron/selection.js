// selection.js - Mesaj ve Kombinasyon seçim penceresi
const API_URL = 'http://127.0.0.1:5000/api';

let selectedMessageIds = [];
let selectedCombinationIds = [];
let allMessages = [];
let allCombinations = [];

// Load theme
function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

// Load saved selections
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

async function loadData() {
    const list = document.getElementById('selectionList');
    list.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i></div>';

    try {
        const [messages, combinations] = await Promise.all([
            apiCall('/messages'),
            apiCall('/combinations')
        ]);

        if (messages && !messages.error) {
            allMessages = messages;
        }
        if (combinations && !combinations.error) {
            allCombinations = combinations;
        }

        renderSelectionList();
    } catch (e) {
        list.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Hata oluştu</p></div>';
    }
}

// Update count badge
function updateCount() {
    const total = selectedMessageIds.length + selectedCombinationIds.length;
    document.getElementById('selectedCount').textContent = total;
}

// Drag & Drop variables
let dragSrcEl = null;
let dragType = null; // 'message' or 'combination'

function renderSelectionList() {
    const list = document.getElementById('selectionList');
    list.innerHTML = '';
    updateCount();

    // SEÇİLİ MESAJLAR
    selectedMessageIds.forEach((id, index) => {
        const msg = allMessages.find(m => String(m.id) === String(id));
        if (!msg) return;

        const item = document.createElement('div');
        item.className = 'message-item selected';
        item.setAttribute('draggable', 'true');
        item.setAttribute('data-id', id);
        item.setAttribute('data-type', 'message');
        item.style.animationDelay = `${index * 0.03}s`;

        // Drag Events
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('dragleave', handleDragLeave);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);

        const keyBadge = msg.trigger_key
            ? `<span class="message-key">${msg.trigger_key}</span>`
            : '';

        item.innerHTML = `
            <div class="message-info">
                <i class="fas fa-grip-vertical drag-handle"></i>
                ${keyBadge}
                <span class="message-name">${msg.name}</span>
            </div>
            <button class="message-action remove" data-id="${id}" data-type="message" title="Kaldır">
                <i class="fas fa-minus"></i>
            </button>
        `;
        list.appendChild(item);
    });

    // SEÇİLİ KOMBİNASYONLAR
    selectedCombinationIds.forEach((id, index) => {
        const combo = allCombinations.find(c => String(c.id) === String(id));
        if (!combo) return;

        const item = document.createElement('div');
        item.className = 'message-item selected combination';
        item.setAttribute('draggable', 'true');
        item.setAttribute('data-id', id);
        item.setAttribute('data-type', 'combination');
        item.style.animationDelay = `${(selectedMessageIds.length + index) * 0.03}s`;

        // Drag Events
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('dragleave', handleDragLeave);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);

        const keyBadge = combo.trigger_key
            ? `<span class="message-key">${combo.trigger_key}</span>`
            : '';

        item.innerHTML = `
            <div class="message-info">
                <i class="fas fa-grip-vertical drag-handle"></i>
                <i class="fas fa-layer-group" style="color: var(--accent-secondary); font-size: 11px; margin-right: 6px;"></i>
                ${keyBadge}
                <span class="message-name">${combo.name}</span>
                <span style="font-size:10px; color:var(--text-muted); margin-left:4px;">(${combo.items?.length || 0})</span>
            </div>
            <button class="message-action remove" data-id="${id}" data-type="combination" title="Kaldır">
                <i class="fas fa-minus"></i>
            </button>
        `;
        list.appendChild(item);
    });

    // AYIRICI - Seçilmemiş Mesajlar
    const availableMessages = allMessages.filter(m => !selectedMessageIds.includes(String(m.id)));
    const availableCombinations = allCombinations.filter(c => !selectedCombinationIds.includes(String(c.id)));

    if ((availableMessages.length > 0 || availableCombinations.length > 0) &&
        (selectedMessageIds.length > 0 || selectedCombinationIds.length > 0)) {
        const divider = document.createElement('div');
        divider.className = 'list-divider';
        divider.innerHTML = '<span>Kütüphane</span>';
        list.appendChild(divider);
    }

    // SEÇİLMEMİŞ MESAJLAR
    availableMessages.forEach((msg, index) => {
        const item = document.createElement('div');
        item.className = 'message-item';
        item.style.animationDelay = `${(selectedMessageIds.length + selectedCombinationIds.length + index) * 0.03}s`;

        const keyBadge = msg.trigger_key
            ? `<span class="message-key">${msg.trigger_key}</span>`
            : '';

        item.innerHTML = `
            <div class="message-info">
                ${keyBadge}
                <span class="message-name">${msg.name}</span>
            </div>
            <button class="message-action add" data-id="${msg.id}" data-type="message" title="Ekle">
                <i class="fas fa-plus"></i>
            </button>
        `;
        list.appendChild(item);
    });

    // SEÇİLMEMİŞ KOMBİNASYONLAR
    availableCombinations.forEach((combo, index) => {
        const item = document.createElement('div');
        item.className = 'message-item combination';
        item.style.animationDelay = `${(selectedMessageIds.length + selectedCombinationIds.length + availableMessages.length + index) * 0.03}s`;

        const keyBadge = combo.trigger_key
            ? `<span class="message-key">${combo.trigger_key}</span>`
            : '';

        item.innerHTML = `
            <div class="message-info">
                <i class="fas fa-layer-group" style="color: var(--accent-secondary); font-size: 11px; margin-right: 6px;"></i>
                ${keyBadge}
                <span class="message-name">${combo.name}</span>
                <span style="font-size:10px; color:var(--text-muted); margin-left:4px;">(${combo.items?.length || 0})</span>
            </div>
            <button class="message-action add" data-id="${combo.id}" data-type="combination" title="Ekle">
                <i class="fas fa-plus"></i>
            </button>
        `;
        list.appendChild(item);
    });

    if (allMessages.length === 0 && allCombinations.length === 0) {
        list.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Hiç mesaj veya kombinasyon bulunamadı</p></div>';
    }

    // Add click handlers
    list.querySelectorAll('.message-action.remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleItem(btn.dataset.id, btn.dataset.type, false);
        });
    });
    list.querySelectorAll('.message-action.add').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleItem(btn.dataset.id, btn.dataset.type, true);
        });
    });

    // Click on item to toggle
    list.querySelectorAll('.message-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.message-action') || e.target.closest('.drag-handle')) return;
            const id = item.dataset.id || item.querySelector('.message-action').dataset.id;
            const type = item.dataset.type || item.querySelector('.message-action').dataset.type;
            const isSelected = item.classList.contains('selected');
            toggleItem(id, type, !isSelected);
        });
    });
}

// Drag & Drop Handlers
function handleDragStart(e) {
    dragSrcEl = this;
    dragType = this.getAttribute('data-type');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    this.classList.add('dragging');
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    this.classList.add('drag-over');
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();

    if (dragSrcEl !== this && dragType === this.getAttribute('data-type')) {
        const srcId = dragSrcEl.getAttribute('data-id');
        const targetId = this.getAttribute('data-id');
        const type = dragType;

        const list = type === 'message' ? selectedMessageIds : selectedCombinationIds;
        const srcIndex = list.indexOf(srcId);
        const targetIndex = list.indexOf(targetId);

        if (srcIndex > -1 && targetIndex > -1) {
            const [movedItem] = list.splice(srcIndex, 1);
            list.splice(targetIndex, 0, movedItem);
            renderSelectionList();
        }
    }
    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.message-item').forEach(item => {
        item.classList.remove('drag-over');
    });
}

function toggleItem(id, type, shouldAdd) {
    id = String(id);
    const list = type === 'combination' ? selectedCombinationIds : selectedMessageIds;

    if (shouldAdd) {
        if (!list.includes(id)) {
            list.push(id);
        }
    } else {
        const index = list.indexOf(id);
        if (index > -1) {
            list.splice(index, 1);
        }
    }

    if (type === 'combination') {
        selectedCombinationIds = list;
    } else {
        selectedMessageIds = list;
    }

    renderSelectionList();
}

function saveAndClose() {
    localStorage.setItem('overlay_messages', JSON.stringify(selectedMessageIds));
    localStorage.setItem('overlay_combinations', JSON.stringify(selectedCombinationIds));
    window.electronAPI.notifyUpdate();
    window.electronAPI.closeSelectionWindow();
}

// Event Listeners
document.getElementById('closeBtn').addEventListener('click', saveAndClose);
document.getElementById('saveBtn').addEventListener('click', saveAndClose);

// Keyboard shortcut
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        saveAndClose();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        saveAndClose();
    }
});

// Listen for theme updates
if (window.electronAPI && window.electronAPI.onUpdate) {
    window.electronAPI.onUpdate(() => {
        loadTheme();
    });
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    loadData();
});

