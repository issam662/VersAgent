// @ts-nocheck — This runs in the renderer (browser context)

const api = window.agentAPI;

// Timer Interval ref
let scanInterval = null;
let isScanning = false;

// === Password Protection ===
const authOverlay = document.getElementById('auth-overlay');
const authPassword = document.getElementById('auth-password');
const authSubmit = document.getElementById('auth-submit');
const authError = document.getElementById('auth-error');
const mainTabs = document.querySelector('.tabs');
const mainContent = document.querySelector('.content');

let isAuthenticated = false;

function handleLogin() {
    if (authPassword.value === 'Aptiv@2026') {
        isAuthenticated = true;
        authOverlay.style.display = 'none';
        mainTabs.style.display = 'flex';
        mainContent.style.display = 'block';
        loadSystemInfo(); // load initially now that auth is passed
    } else {
        authError.style.display = 'block';
        authPassword.value = '';
        authPassword.focus();
    }
}

authSubmit.addEventListener('click', handleLogin);
authPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
});

// === Tab switching ===
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const tabId = tab.getAttribute('data-tab');
        document.getElementById('tab-' + tabId).classList.add('active');

        // Cancel scanner UI if leaving network tab (optional, but cleaner)
        if (tabId !== 'network' && isScanning) {
            // keep the scan running in background, but maybe hide the UI or keep it?
            // User requested: "shows as scanning and stays like that".
            // Let's keep state if we return.
        }

        if (tabId === 'system') loadSystemInfo();
        if (tabId === 'network') loadNetworkInfo();
        if (tabId === 'apps') loadApps();
        if (tabId === 'scanner') loadScannerConfig();
        if (tabId === 'info') loadInfoPage();
        if (tabId === 'settings') loadSettings();
    });
});

// === Titlebar buttons ===
document.getElementById('btn-close').addEventListener('click', () => api.closeWindow());
document.getElementById('btn-minimize').addEventListener('click', () => api.minimizeWindow());

// === Agent version ===
api.getAgentVersion().then(v => {
    document.getElementById('agent-version').textContent = 'v' + v;
});

// v1.0.80: Strict Lock Implementation
api.onLockUI(() => {
    console.log('[RENDERER] Received lock-ui event');
    isAuthenticated = false;
    authOverlay.style.display = 'flex';
    authPassword.value = '';
    mainTabs.style.display = 'none';
    mainContent.style.display = 'none';
});

// v1.1.7: PC Block / Lock Screen Implementation
api.onShowLockScreen((data) => {
    const isPrimary = data ? data.isPrimary : true;
    const reason = data ? data.reason : '';

    console.log('[RENDERER] Received show-lock-screen event. Primary:', isPrimary);
    
    // Show reason if provided (or default)
    const reasonSubtitle = document.getElementById('lock-reason');
    if (reasonSubtitle) {
        reasonSubtitle.textContent = reason || 'This PC is blocked. Please contact the IT department on 0532675111.';
    }

    // Hide everything else
    const titlebar = document.getElementById('titlebar');
    if (titlebar) titlebar.style.display = 'none';
    authOverlay.style.display = 'none';
    mainTabs.style.display = 'none';
    mainContent.style.display = 'none';
    
    // Show the Stark Red Lock Screen
    const lockScreen = document.getElementById('lock-screen');
    if (lockScreen) {
        lockScreen.style.display = 'flex';
    }
    document.body.style.overflow = 'hidden';

    if (!isPrimary) {
        const inputGroup = document.querySelector('.lock-input-group');
        if (inputGroup) inputGroup.style.display = 'none';
        const errDiv = document.getElementById('lock-error');
        if (errDiv) errDiv.style.display = 'none';
    }
});

document.getElementById('btn-unlock').addEventListener('click', async () => {
    const pwInput = document.getElementById('lock-password');
    const errDiv = document.getElementById('lock-error');
    errDiv.style.display = 'none';
    
    const success = await api.submitUnlockPassword(pwInput.value);
    if (success) {
        // If successful, the AgentEvents in main.ts will destroy the lock window automatically,
        // but just in case, we can restore normal view or close.
        api.closeWindow(); 
    } else {
        errDiv.style.display = 'block';
        pwInput.value = '';
        pwInput.focus();
    }
});

document.getElementById('lock-password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-unlock').click();
});

// === System Info (Tab 1) ===
async function loadSystemInfo() {
    const loading = document.getElementById('system-loading');
    const container = document.getElementById('system-info');
    loading.style.display = 'flex';
    container.style.display = 'none';

    try {
        const info = await api.getSystemInfo();
        const cards = [
            { label: 'Hostname', value: info.hostname },
            { label: 'Serial Number', value: info.serialNumber },
            { label: 'Operating System', value: info.osName },
            { label: 'OS Build', value: info.osBuild },
            { label: 'CPU', value: info.cpu, fullWidth: true },
            { label: 'Memory', value: info.totalMemoryGB + ' GB' },
            { label: 'Domain', value: info.domain || 'N/A' },
        ];

        renderCards(container, cards);
        loading.style.display = 'none';
        container.style.display = 'grid';

        // v1.1.6: Load live metadata from DB
        loadMetadata();
    } catch (err) {
        loading.innerHTML = '<span style="color:#ef4444;">Failed to load system info</span>';
    }
}

// === v1.1.6: Metadata (PC Details) ===
const metaSection = document.getElementById('metadata-section');
const btnEditMeta = document.getElementById('btn-edit-meta');
const btnSaveMeta = document.getElementById('btn-save-meta');
const btnCancelMeta = document.getElementById('btn-cancel-meta');
const metaStatus = document.getElementById('meta-status');

const metaFields = ['category', 'department', 'location', 'family'];
let currentMeta = {};

async function loadMetadata() {
    try {
        const meta = await api.getMetadata();
        if (meta) {
            currentMeta = meta;
            metaFields.forEach(f => {
                const display = document.getElementById(`meta-${f}-display`);
                if (display) display.textContent = meta[f] || '—';
            });
            metaSection.style.display = 'block';
        } else {
            metaSection.style.display = 'none';
        }
    } catch (e) {
        console.error('[RENDERER] Failed to load metadata:', e);
        metaSection.style.display = 'none';
    }
}

function enterEditMode() {
    metaFields.forEach(f => {
        document.getElementById(`meta-${f}-display`).style.display = 'none';
        const input = document.getElementById(`meta-${f}-input`);
        input.style.display = 'block';
        input.value = currentMeta[f] || '';
    });
    btnEditMeta.style.display = 'none';
    btnSaveMeta.style.display = 'inline-block';
    btnCancelMeta.style.display = 'inline-block';
    metaStatus.textContent = '';
    metaStatus.className = 'meta-status';
}

function exitEditMode() {
    metaFields.forEach(f => {
        document.getElementById(`meta-${f}-display`).style.display = 'flex';
        document.getElementById(`meta-${f}-input`).style.display = 'none';
    });
    btnEditMeta.style.display = 'inline-block';
    btnSaveMeta.style.display = 'none';
    btnCancelMeta.style.display = 'none';
}

async function saveMetadata() {
    const data = {};
    metaFields.forEach(f => {
        data[f] = document.getElementById(`meta-${f}-input`).value.trim();
    });

    btnSaveMeta.disabled = true;
    btnSaveMeta.textContent = 'Saving...';
    metaStatus.textContent = '';

    try {
        const ok = await api.updateMetadata(data);
        if (ok) {
            currentMeta = { ...data };
            metaFields.forEach(f => {
                document.getElementById(`meta-${f}-display`).textContent = data[f] || '—';
            });
            exitEditMode();
            metaStatus.textContent = '✓ Saved successfully';
            metaStatus.className = 'meta-status success';
            setTimeout(() => { metaStatus.textContent = ''; }, 3000);
        } else {
            metaStatus.textContent = '✗ Failed to save — no connection to DB';
            metaStatus.className = 'meta-status error';
        }
    } catch (e) {
        metaStatus.textContent = '✗ Error: ' + e.message;
        metaStatus.className = 'meta-status error';
    } finally {
        btnSaveMeta.disabled = false;
        btnSaveMeta.textContent = 'Save';
    }
}

btnEditMeta.addEventListener('click', enterEditMode);
btnCancelMeta.addEventListener('click', exitEditMode);
btnSaveMeta.addEventListener('click', saveMetadata);

// === Network Info (Tab 2) ===
// === Network Info (Tab 2) ===
async function loadNetworkInfo() {
    const container = document.getElementById('network-info');

    // Only refresh data, do not reset scanner UI if scanning
    if (isScanning) {
        console.log('[RENDERER] Scan in progress, not refreshing network grid yet.');
        return;
    }

    // Load adapters if not loaded or empty (simple cache check)
    const select = document.getElementById('network-select');
    if (select && select.options.length <= 2 && select.options[1] && select.options[1].disabled) {
        loadAdapters();
    }

    try {
        const info = await api.getSystemInfo();
        const cards = [
            {
                label: 'IP Addresses',
                value: info.ipAddresses.map(ip => `<span class="tag">${ip}</span>`).join('') || 'N/A',
                fullWidth: true,
                html: true,
            },
            {
                label: 'MAC Addresses',
                value: info.macAddresses.map(mac => `<span class="tag">${mac}</span>`).join('') || 'N/A',
                fullWidth: true,
                html: true,
            },
            { label: 'VLAN ID', value: (isScanning || info.vlanId === 'Scanning...' ? 'Scanning...' : (info.vlanId || '-')) },
            { label: 'Switch Port', value: (isScanning || info.switchPort === 'Scanning...' ? 'Scanning...' : (info.switchPort || '-')) },
            { label: 'Switch Name', value: (isScanning || info.switchName === 'Scanning...' ? 'Scanning...' : (info.switchName || '-')) },
            { label: 'Switch IP', value: (isScanning || info.switchIp === 'Scanning...' ? 'Scanning...' : (info.switchIp || '-')) },
            { label: 'Switch Platform', value: (isScanning || info.switchPlatform === 'Scanning...' ? 'Scanning...' : (info.switchPlatform || '-')) },
            { label: 'Default Gateway', value: info.defaultGateway || 'N/A' },
            {
                label: 'DNS Servers',
                value: info.dnsServers.map(dns => `<span class="tag">${dns}</span>`).join('') || 'N/A',
                fullWidth: true,
                html: true,
            },
        ];
        renderCards(container, cards);
    } catch (err) {
        container.innerHTML = '<span style="color:#ef4444;">Failed to load network info</span>';
    }
}

async function loadAdapters() {
    const select = document.getElementById('network-select');
    try {
        let adapters = await api.getNetworkInterfaces();
        // v1.0.69 FIX: Ensure we have an array even if backend returns a single object
        if (adapters && !Array.isArray(adapters)) {
            adapters = [adapters];
        }

        // Keep first option (Auto-Detect)
        select.innerHTML = '<option value="">Auto-Detect Adapter</option>';

        if (adapters && adapters.length > 0) {
            adapters.forEach(adapter => {
                const opt = document.createElement('option');
                opt.value = adapter.name;
                // Truncate description if too long
                const desc = adapter.description.length > 40 ? adapter.description.substring(0, 37) + '...' : adapter.description;
                opt.textContent = desc; // Use description which is more friendly than name (GUID) usually
                select.appendChild(opt);
            });
        } else {
            const opt = document.createElement('option');
            opt.disabled = true;
            opt.textContent = "No adapters found";
            select.appendChild(opt);
        }
    } catch (e) {
        console.error("Failed to load adapters", e);
        select.innerHTML = '<option value="">Auto-Detect Adapter</option><option disabled>Error loading adapters</option>';
    }
}

function renderCards(container, cards) {
    container.innerHTML = cards.map(card => `
        <div class="info-card ${card.fullWidth ? 'full-width' : ''}">
            <div class="info-card-label">${card.label}</div>
            <div class="info-card-value${card.fullWidth ? ' small' : ''}">${card.html ? card.value : escapeHtml(card.value)}</div>
        </div>
    `).join('');
}

// === Rescan Logic ===
const btnRescan = document.getElementById('btn-rescan');
const statusContainer = document.getElementById('scan-status-container');
const timerText = document.getElementById('scan-timer');
const scanMessage = document.getElementById('scan-message');
const networkSelect = document.getElementById('network-select');

btnRescan.addEventListener('click', () => {
    startRescan();
});

function startRescan() {
    console.log('[RENDERER] Starting Network Rescan UI...');
    if (scanInterval) clearInterval(scanInterval);

    // Get selected adapter
    const selectedAdapter = networkSelect ? networkSelect.value : '';

    // UI State
    isScanning = true;
    btnRescan.disabled = true;
    if (networkSelect) networkSelect.disabled = true;
    btnRescan.textContent = 'Scanning...';

    // Reset Status Area
    statusContainer.style.display = 'flex';
    timerText.textContent = '0s';
    scanMessage.textContent = selectedAdapter ? 'Scanning Selected Adapter...' : 'Scanning Auto-Detected Network...';
    scanMessage.classList.remove('complete');

    // Trigger Backend Scan
    api.rescanNetwork(selectedAdapter);

    // Timer Animation (Count UP)
    let secondsElapsed = 0;
    scanInterval = setInterval(() => {
        secondsElapsed++;
        timerText.textContent = `${secondsElapsed}s`;
    }, 1000);
}

function stopRescanUI() {
    if (scanInterval) clearInterval(scanInterval);
    scanInterval = null;
    isScanning = false;

    // Show Completion State
    scanMessage.textContent = 'Scan Complete';
    scanMessage.classList.add('complete');

    btnRescan.disabled = false;
    if (networkSelect) networkSelect.disabled = false;
    btnRescan.textContent = 'Rescan Network';

    // Refresh the grid to show new VLAN ID
    loadNetworkInfo();

    // Completely hide UI after 2 seconds
    setTimeout(() => {
        if (!isScanning) {
            statusContainer.style.display = 'none';
        }
    }, 2000);
}

function resetRescanUI() {
    isScanning = false;
    btnRescan.disabled = false;
    if (networkSelect) networkSelect.disabled = false;
    btnRescan.textContent = 'Rescan Network';
    statusContainer.style.display = 'none';
}

// === Installed Apps ===
let allApps = [];

async function loadApps() {
    const loading = document.getElementById('apps-loading');
    const container = document.getElementById('app-list');
    loading.style.display = 'flex';
    container.style.display = 'none';

    try {
        allApps = await api.getInstalledApps();
        document.getElementById('app-count').textContent = allApps.length + ' apps';
        renderApps(allApps);
        loading.style.display = 'none';
        container.style.display = 'flex';
    } catch (err) {
        loading.innerHTML = '<span style="color:#ef4444;">Failed to load applications</span>';
    }
}

function renderApps(apps) {
    const container = document.getElementById('app-list');
    if (apps.length === 0) {
        container.innerHTML = '<div class="info-empty">No applications found</div>';
        return;
    }
    container.innerHTML = apps.map(app => `
        <div class="app-item">
            <span class="app-name" title="${escapeHtml(app.name)}">${escapeHtml(app.name)}</span>
            <span class="app-version">${escapeHtml(app.version || '—')}</span>
            <span class="app-publisher" title="${escapeHtml(app.publisher || '')}">${escapeHtml(app.publisher || '')}</span>
        </div>
    `).join('');
}

// Search filter
document.getElementById('app-search').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = allApps.filter(app =>
        app.name.toLowerCase().includes(query) ||
        (app.publisher && app.publisher.toLowerCase().includes(query))
    );
    document.getElementById('app-count').textContent = filtered.length + ' / ' + allApps.length + ' apps';
    renderApps(filtered);
});

// === Info Page ===
async function loadInfoPage() {
    const loading = document.getElementById('info-loading');
    const container = document.getElementById('info-page-content');
    loading.style.display = 'flex';
    container.style.display = 'none';

    try {
        const data = await api.getInfoPage();
        if (!data || !data.content) {
            container.innerHTML = '<div class="info-empty">No info page content available.<br>Ask your administrator to set it up.</div>';
        } else {
            const content = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
            renderInfoPage(content, container);
        }
        loading.style.display = 'none';
        container.style.display = 'block';
    } catch (err) {
        container.innerHTML = '<div class="info-empty">Failed to load info page</div>';
        loading.style.display = 'none';
        container.style.display = 'block';
    }
}

function renderInfoPage(content, container) {
    let html = '';

    // Render tables
    if (content.tables && content.tables.length > 0) {
        for (const table of content.tables) {
            html += `<div class="info-section">`;
            html += `<div class="info-section-title">${escapeHtml(table.title || 'Table')}</div>`;
            html += `<table class="info-table">`;
            if (table.headers && table.headers.length > 0) {
                html += '<thead><tr>' + table.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('') + '</tr></thead>';
            }
            html += '<tbody>';
            if (table.rows && table.rows.length > 0) {
                for (const row of table.rows) {
                    html += '<tr>' + row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('') + '</tr>';
                }
            }
            html += '</tbody></table></div>';
        }
    }

    // Render notes
    if (content.notes) {
        html += `<div class="info-section">`;
        html += `<div class="info-section-title">Notes</div>`;
        html += `<div class="info-notes">${escapeHtml(content.notes)}</div>`;
        html += `</div>`;
    }

    if (!html) {
        html = '<div class="info-empty">No content configured</div>';
    }

    container.innerHTML = html;
}

// === Helpers ===
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// === Auto-load removed (wait for auth) ===
// loadSystemInfo();

// === Listen for background updates ===
api.onSystemInfoUpdated((info) => {
    console.log('[RENDERER] System info updated in background.');

    if (isScanning && info.vlanId !== 'Scanning...' && info.vlanId !== '') {
        console.log('[RENDERER] Scan finished (VLAN found or timeout). Stopping timer.');
        stopRescanUI();
    } else if (!isScanning && isAuthenticated) {
        // Normal refresh
        const activeTab = document.querySelector('.tab.active')?.getAttribute('data-tab');
        if (activeTab === 'system') loadSystemInfo();
        if (activeTab === 'network') loadNetworkInfo();
    }
});

// === Settings Tab (v1.0.88) ===
const toggleStatus = document.getElementById('toggle-status');
const toggleAwake = document.getElementById('toggle-awake');
const chkTanium = document.getElementById('chk-tanium');
const chkCrowdstrike = document.getElementById('chk-crowdstrike');
const chkMcafee = document.getElementById('chk-mcafee');


async function loadSettings() {
    try {
        const settings = await api.getOverlaySettings();

        if (toggleStatus) {
            toggleStatus.checked = settings.enabled;
            updateCheckboxState(settings.enabled);
        }

        if (toggleAwake) {
            toggleAwake.checked = settings.keepAwake || false;
        }

        if (chkTanium) chkTanium.checked = settings.tanium;
        if (chkCrowdstrike) chkCrowdstrike.checked = settings.crowdstrike;
        if (chkMcafee) chkMcafee.checked = settings.mcafee;

    } catch (e) {
        console.error('[RENDERER] Failed to load settings:', e);
    }
}

function updateCheckboxState(enabled) {
    const group = document.querySelector('.settings-checkbox-group');
    if (group) {
        group.style.opacity = enabled ? '1' : '0.5';
        group.style.pointerEvents = enabled ? 'auto' : 'none';
    }
}

toggleStatus.addEventListener('change', async () => {
    const enabled = toggleStatus.checked;
    updateCheckboxState(enabled);
    await api.toggleOverlay(enabled);
});

if (toggleAwake) {
    toggleAwake.addEventListener('change', async () => {
        await api.updateOptimizationSettings({
            keepAwake: toggleAwake.checked
        });
    });
}

function sendCheckUpdates() {
    api.updateOverlayChecks({
        tanium: chkTanium.checked,
        crowdstrike: chkCrowdstrike.checked,
        mcafee: chkMcafee.checked
    });
}

chkTanium.addEventListener('change', sendCheckUpdates);
chkCrowdstrike.addEventListener('change', sendCheckUpdates);
chkMcafee.addEventListener('change', sendCheckUpdates);

// === Scanner Integration ===
let userRules = [];
let systemRules = [];

function getActionColor(action) {
    if(action === 'system-restart' || action === 'system-shutdown') return 'tag-system';
    if(action === 'start') return 'tag-start';
    if(action === 'restart') return 'tag-restart';
    if(action === 'focus') return 'tag-focus';
    return '';
}

function renderRulesTable() {
    const tbody = document.getElementById('rulesTable');
    if (!tbody) return;
    
    let html = '';
    
    // System Rules
    systemRules.forEach(rule => {
        html += `
            <tr>
                <td><span class="scan-code">${escapeHtml(rule.text)}</span></td>
                <td style="color:var(--text-secondary)">${escapeHtml(rule.path)}</td>
                <td><span class="scanner-tag ${getActionColor(rule.action)}">${escapeHtml(rule.action.replace('-',' '))}</span></td>
                <td style="text-align:center;"><div class="lock-icon">🔒</div></td>
            </tr>
        `;
    });

    // User Rules
    userRules.forEach((rule, idx) => {
        html += `
            <tr>
                <td><span class="scan-code">${escapeHtml(rule.text)}</span></td>
                <td>${escapeHtml(rule.path)}</td>
                <td><span class="scanner-tag ${getActionColor(rule.action)}">${escapeHtml(rule.action)}</span></td>
                <td style="text-align:center;"><button class="btn-delete" data-idx="${idx}">Delete</button></td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    // Attach delete listeners
    tbody.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            userRules.splice(idx, 1);
            await api.saveScannerRules(userRules);
            renderRulesTable();
            showScannerStatus('Rule deleted successfully.', 'var(--success)');
        });
    });
}

function showScannerStatus(msg, color) {
    const statusEl = document.getElementById('scanner-status');
    if(!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.display = 'inline-block';
    statusEl.style.color = color;
    statusEl.style.backgroundColor = color.replace(')', ', 0.15)').replace('rgb', 'rgba'); // Hacky transparent bg
    statusEl.style.border = `1px solid ${color.replace(')', ', 0.3)').replace('rgb', 'rgba')}`;
    setTimeout(() => { statusEl.style.display = 'none'; }, 4000);
}

async function loadScannerConfig() {
    try {
        const data = await api.loadScannerRules();
        systemRules = data.system;
        userRules = data.user;
        renderRulesTable();
    } catch (e) {
        console.error('Failed to load scanner rules', e);
    }
}

document.getElementById('addRule')?.addEventListener('click', async () => {
    const textEl = document.getElementById('scanText');
    const pathEl = document.getElementById('scanPath');
    const actionEl = document.getElementById('scanAction');
    
    const text = textEl.value.trim().toUpperCase();
    const action = actionEl.value;
    const appPath = pathEl.value.trim();

    if (!text || !appPath) {
        showScannerStatus('Scan code and application path are required.', 'var(--danger)');
        return;
    }
    if (['SYS_RES','SYS_DWN'].includes(text)) {
        showScannerStatus('SYS_RES and SYS_DWN are reserved.', 'var(--danger)');
        return;
    }

    userRules.push({ text, action, path: appPath });
    await api.saveScannerRules(userRules);

    textEl.value = '';
    pathEl.value = '';
    
    loadScannerConfig();
    showScannerStatus(`Rule added successfully.`, 'var(--success)');
});

api.onScanExecuted((data) => {
    console.log('[RENDERER] Scan Executed Event:', data);
    if (!data.success) {
        showScannerStatus(`Unrecognized barcode: ${data.text}`, 'var(--warning)');
    } else {
        showScannerStatus(`Executed: ${data.action} -> ${data.text}`, 'var(--success)');
    }
});

