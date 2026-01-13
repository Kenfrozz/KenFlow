// window-selection.js - Hedef pencere seçim penceresi
const API_URL = 'http://127.0.0.1:5000/api';

let selectedWindows = [];
let allWindows = [];

// Load theme
function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
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

async function loadWindows() {
    const list = document.getElementById('windowList');
    list.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i></div>';
    
    try {
        const [winRes, setRes] = await Promise.all([
            apiCall('/windows'),
            apiCall('/settings')
        ]);
        
        if (winRes.error) throw new Error(winRes.error);
        
        allWindows = winRes.windows || [];
        
        // Load current targets
        const currentTargets = JSON.parse(setRes.target_windows || '[]');
        selectedWindows = currentTargets;
        
        updateUI();
        renderWindowList();
        
    } catch (e) {
        list.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Pencereler yüklenemedi</p></div>';
    }
}

function updateUI() {
    const allBtn = document.getElementById('allWindowsBtn');
    const countBadge = document.getElementById('windowCount');
    
    // All windows button state
    if (selectedWindows.length === 0) {
        allBtn.classList.add('active');
    } else {
        allBtn.classList.remove('active');
    }
    
    // Count badge
    countBadge.textContent = allWindows.length;
}

function renderWindowList() {
    const list = document.getElementById('windowList');
    list.innerHTML = '';
    
    if (allWindows.length === 0) {
        list.innerHTML = '<div class="empty-state"><i class="fas fa-window-maximize"></i><p>Açık pencere bulunamadı</p></div>';
        return;
    }
    
    allWindows.forEach((winTitle, index) => {
        if (!winTitle) return;
        
        const isSelected = selectedWindows.includes(winTitle);
        
        const item = document.createElement('div');
        item.className = `window-item ${isSelected ? 'selected' : ''}`;
        item.style.animationDelay = `${index * 0.03}s`;
        item.dataset.title = winTitle;
        
        item.innerHTML = `
            <div class="window-info">
                <i class="fas fa-window-maximize window-item-icon"></i>
                <span class="window-name">${winTitle}</span>
            </div>
            <i class="fas fa-check window-check"></i>
        `;
        
        item.addEventListener('click', () => toggleWindow(winTitle));
        list.appendChild(item);
    });
}

function toggleWindow(title) {
    if (selectedWindows.includes(title)) {
        selectedWindows = selectedWindows.filter(t => t !== title);
    } else {
        selectedWindows.push(title);
    }
    updateUI();
    renderWindowList();
}

function selectAllWindows() {
    selectedWindows = [];
    updateUI();
    renderWindowList();
}

async function saveAndClose() {
    try {
        await apiCall('/settings', 'POST', { 
            target_windows: JSON.stringify(selectedWindows) 
        });
        window.electronAPI.notifyUpdate();
        window.electronAPI.closeWindowSelectionWindow();
    } catch (e) {
        console.error('Save error:', e);
    }
}

// Event Listeners
document.getElementById('closeBtn').addEventListener('click', saveAndClose);
document.getElementById('saveBtn').addEventListener('click', saveAndClose);
document.getElementById('refreshBtn').addEventListener('click', loadWindows);
document.getElementById('allWindowsBtn').addEventListener('click', selectAllWindows);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        saveAndClose();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        saveAndClose();
    }
    if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        loadWindows();
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
    loadWindows();
});
