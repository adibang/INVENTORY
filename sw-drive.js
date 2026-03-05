// ==================== SERVICE WORKER REGISTRATION & INSTALL PROMPT ====================
let deferredPrompt;
const installButton = document.createElement('button');
installButton.id = 'install-app-btn';
installButton.style.cssText = `
    position: fixed;
    bottom: 90px;
    right: 20px;
    z-index: 1000;
    background: #006B54;
    color: white;
    border: none;
    border-radius: 30px;
    padding: 12px 20px;
    font-weight: 600;
    box-shadow: 0 4px 15px rgba(0,107,84,0.4);
    cursor: pointer;
    display: none;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    border: 1px solid white;
    transition: transform 0.2s;
`;
installButton.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    Install Aplikasi
`;
installButton.onmouseover = () => installButton.style.transform = 'scale(1.05)';
installButton.onmouseout = () => installButton.style.transform = 'scale(1)';
installButton.onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    deferredPrompt = null;
    installButton.style.display = 'none';
};
document.body.appendChild(installButton);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(function(registration) {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
            
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                console.log('Service worker update found!');
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        if (confirm('Update baru tersedia! Muat ulang untuk menerapkan?')) {
                            window.location.reload();
                        }
                    }
                });
            });
        }).catch(function(error) {
            console.log('ServiceWorker registration failed: ', error);
        });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('Controller changed, new service worker activated.');
    });
} else {
    console.log('Service workers are not supported.');
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(() => {
        if (deferredPrompt) {
            installButton.style.display = 'flex';
        }
    }, 2000);
});

window.addEventListener('appinstalled', (evt) => {
    console.log('App was installed.');
    installButton.style.display = 'none';
    deferredPrompt = null;
});

// ==================== DEFINISI STORES DAN VERSI DATABASE ====================
const STORES = {
    SETTINGS: 'settings',
    APP_STATE: 'appState',
    KASIR_CATEGORIES: 'kasirCategories',
    KASIR_ITEMS: 'kasirItems',
    KASIR_SATUAN: 'kasirSatuan',
    CUSTOMERS: 'customers',
    SUPPLIERS: 'suppliers',
    PENDING_TRANSACTIONS: 'pendingTransactions',
    SALES: 'sales',
    PURCHASES: 'purchases',
    USERS: 'users',
    ROLES: 'roles',
    BUNDLES: 'bundles'
};

// Versi database (harus sama dengan di app.js)
const DB_VERSION = 20;

// ==================== GOOGLE DRIVE BACKUP CONFIGURATION ====================
const DRIVE_CONFIG = {
    CLIENT_ID: '408769468812-550ik05h5nahcpq2kb749jso2gkokccq.apps.googleusercontent.com',
    API_KEY: '',
    SCOPES: 'https://www.googleapis.com/auth/drive.file',
    DISCOVERY_DOCS: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    FOLDER_NAME: 'POS Backup'
};

let tokenClient;
let gapiInited = false;
let gisInited = false;
let driveBackupInterval = null;
let backupList = [];

// Fungsi notifikasi fallback (menggunakan alert jika showNotification tidak tersedia)
function safeNotify(message, type = 'info') {
    if (typeof showNotification === 'function') {
        showNotification(message, type);
    } else {
        alert(message);
    }
}

// Fungsi loading fallback
function safeLoading(message) {
    if (typeof showLoading === 'function') {
        showLoading(message);
    }
}

function safeHideLoading() {
    if (typeof hideLoading === 'function') {
        hideLoading();
    }
}

// Fungsi play sound fallback (diam saja jika tidak ada)
function safePlaySuccess() {
    if (typeof playSuccessSound === 'function') playSuccessSound();
}
function safePlayError() {
    if (typeof playErrorSound === 'function') playErrorSound();
}

// ==================== GOOGLE API LOAD ====================
function loadGoogleAPI() {
    console.log('Loading Google API...');
    const script1 = document.createElement('script');
    script1.src = 'https://apis.google.com/js/api.js';
    script1.onload = initializeGapiClient;
    script1.onerror = () => {
        console.error('Gagal memuat api.js');
        safeNotify('Gagal memuat Google API. Periksa koneksi internet.', 'error');
    };
    document.head.appendChild(script1);

    const script2 = document.createElement('script');
    script2.src = 'https://accounts.google.com/gsi/client';
    script2.onload = initializeGisClient;
    script2.onerror = () => {
        console.error('Gagal memuat gsi/client');
        safeNotify('Gagal memuat Google Identity Services.', 'error');
    };
    document.head.appendChild(script2);
}

async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: DRIVE_CONFIG.API_KEY,
            discoveryDocs: DRIVE_CONFIG.DISCOVERY_DOCS,
        });
        gapiInited = true;
        console.log('GAPI client initialized');
        checkSavedToken();
    } catch (error) {
        console.error('GAPI init error:', error);
        safeNotify('Gagal inisialisasi Google API: ' + error.message, 'error');
    }
}

function initializeGisClient() {
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: DRIVE_CONFIG.CLIENT_ID,
            scope: DRIVE_CONFIG.SCOPES,
            callback: '', // akan diisi saat connect
        });
        gisInited = true;
        console.log('GIS client initialized');
    } catch (error) {
        console.error('GIS init error:', error);
        safeNotify('Gagal inisialisasi Google Identity: ' + error.message, 'error');
    }
}

function saveTokenToStorage(response) {
    const token = {
        access_token: response.access_token,
        expires_in: response.expires_in,
        token_type: response.token_type,
        scope: response.scope,
        expiry_time: Date.now() + (response.expires_in * 1000)
    };
    localStorage.setItem('googleDriveToken', JSON.stringify(token));
    getUserInfo(response.access_token);
}

function getSavedToken() {
    const tokenStr = localStorage.getItem('googleDriveToken');
    if (!tokenStr) return null;
    try {
        const token = JSON.parse(tokenStr);
        if (token.expiry_time && Date.now() > token.expiry_time) {
            localStorage.removeItem('googleDriveToken');
            return null;
        }
        return token;
    } catch (e) {
        return null;
    }
}

function checkSavedToken() {
    const token = getSavedToken();
    if (token && gapi.client) {
        gapi.client.setToken(token);
        updateDriveUI(true, token);
        loadBackupList();
        startAutoBackup();
    }
}

// ==================== FUNGSI UTAMA ====================
function connectGoogleDrive() {
    console.log('connectGoogleDrive dipanggil');
    // Ubah teks tombol sebagai feedback
    const connectBtn = document.getElementById('drive-connect-btn');
    if (connectBtn) {
        connectBtn.disabled = true;
        connectBtn.innerHTML = 'Menghubungkan...';
    }

    if (!gapiInited || !gisInited) {
        safeNotify('Google API masih loading, tunggu sebentar...', 'warning');
        console.log('gapiInited:', gapiInited, 'gisInited:', gisInited);
        // Kembalikan tombol
        if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.innerHTML = 'Hubungkan';
        }
        return;
    }

    tokenClient.callback = async (response) => {
        console.log('OAuth callback', response);
        if (response.error) {
            safeNotify('Gagal connect: ' + response.error, 'error');
            if (connectBtn) {
                connectBtn.disabled = false;
                connectBtn.innerHTML = 'Hubungkan';
            }
            return;
        }
        
        saveTokenToStorage(response);
        gapi.client.setToken(response);
        await createBackupFolder();
        updateDriveUI(true, response);
        loadBackupList();
        startAutoBackup();
        safeNotify('Berhasil terhubung ke Google Drive', 'success');
        safePlaySuccess();
        // Tombol akan disembunyikan oleh updateDriveUI
    };

    try {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (error) {
        console.error('Error requestAccessToken:', error);
        safeNotify('Gagal meminta token: ' + error.message, 'error');
        if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.innerHTML = 'Hubungkan';
        }
    }
}

function disconnectGoogleDrive() {
    if (confirm('Putuskan koneksi Google Drive?')) {
        localStorage.removeItem('googleDriveToken');
        localStorage.removeItem('driveSettings');
        localStorage.removeItem('driveFolderId');
        localStorage.removeItem('lastBackup');
        if (gapi.client) gapi.client.setToken(null);
        updateDriveUI(false);
        stopAutoBackup();
        safeNotify('Koneksi Google Drive diputuskan', 'info');
    }
}

async function getUserInfo(accessToken) {
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const user = await response.json();
        const userInfoEl = document.getElementById('drive-user-info');
        if (userInfoEl) {
            userInfoEl.textContent = `📧 ${user.email}`;
        }
    } catch (error) {
        console.error('Error getting user info:', error);
    }
}

function updateDriveUI(connected, token = null) {
    const statusEl = document.getElementById('drive-connection-status');
    const connectBtn = document.getElementById('drive-connect-btn');
    const disconnectBtn = document.getElementById('drive-disconnect-btn');
    const settingsDiv = document.getElementById('drive-settings');
    const userInfoEl = document.getElementById('drive-user-info');
    const lastBackupEl = document.getElementById('last-backup-info');
    const backupListEl = document.getElementById('backup-list');
    
    if (connected) {
        if (statusEl) {
            statusEl.innerHTML = '🟢 Terhubung ke Google Drive';
            statusEl.style.color = '#006B54';
        }
        if (connectBtn) connectBtn.style.display = 'none';
        if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';
        if (settingsDiv) {
            settingsDiv.style.opacity = '1';
            settingsDiv.style.pointerEvents = 'all';
        }
        loadDriveSettings();
        const lastBackup = localStorage.getItem('lastBackup');
        if (lastBackup && lastBackupEl) {
            try {
                const info = JSON.parse(lastBackup);
                lastBackupEl.innerHTML = `📁 ${info.fileName}<br>🕒 ${info.time} • 💾 ${info.size}`;
            } catch (e) {}
        }
    } else {
        if (statusEl) {
            statusEl.innerHTML = '🔴 Tidak terhubung';
            statusEl.style.color = '#999';
        }
        if (connectBtn) {
            connectBtn.style.display = 'inline-flex';
            connectBtn.disabled = false;
            connectBtn.innerHTML = 'Hubungkan';
        }
        if (disconnectBtn) disconnectBtn.style.display = 'none';
        if (settingsDiv) {
            settingsDiv.style.opacity = '0.5';
            settingsDiv.style.pointerEvents = 'none';
        }
        if (userInfoEl) userInfoEl.textContent = '';
        if (lastBackupEl) lastBackupEl.innerHTML = 'Belum pernah backup';
        if (backupListEl) backupListEl.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">Hubungkan Google Drive untuk melihat backup</div>';
    }
}

async function createBackupFolder() {
    try {
        const response = await gapi.client.drive.files.list({
            q: `name='${DRIVE_CONFIG.FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        if (response.result.files.length > 0) {
            localStorage.setItem('driveFolderId', response.result.files[0].id);
            return response.result.files[0].id;
        } else {
            const fileMetadata = {
                name: DRIVE_CONFIG.FOLDER_NAME,
                mimeType: 'application/vnd.google-apps.folder'
            };
            const folder = await gapi.client.drive.files.create({
                resource: fileMetadata,
                fields: 'id'
            });
            localStorage.setItem('driveFolderId', folder.result.id);
            return folder.result.id;
        }
    } catch (error) {
        console.error('Error creating folder:', error);
        safeNotify('Gagal membuat folder backup: ' + error.message, 'error');
        return null;
    }
}

async function manualBackup() {
    safeLoading('Menyiapkan backup...');
    try {
        await performBackup();
        safeNotify('Backup berhasil disimpan ke Google Drive!', 'success');
        safePlaySuccess();
        refreshBackupList();
    } catch (error) {
        console.error('Backup error:', error);
        safeNotify('Gagal backup: ' + error.message, 'error');
        safePlayError();
    } finally {
        safeHideLoading();
    }
}

async function performBackup() {
    // Pastikan fungsi dbGetAll ada
    if (typeof dbGetAll !== 'function') {
        throw new Error('Fungsi database tidak tersedia');
    }

    const backupData = {
        kasirCategories: await dbGetAll(STORES.KASIR_CATEGORIES),
        kasirItems: await dbGetAll(STORES.KASIR_ITEMS),
        kasirSatuan: await dbGetAll(STORES.KASIR_SATUAN),
        customers: await dbGetAll(STORES.CUSTOMERS),
        suppliers: await dbGetAll(STORES.SUPPLIERS),
        pendingTransactions: await dbGetAll(STORES.PENDING_TRANSACTIONS),
        sales: await dbGetAll(STORES.SALES),
        purchases: await dbGetAll(STORES.PURCHASES),
        users: await dbGetAll(STORES.USERS),
        roles: await dbGetAll(STORES.ROLES),
        bundles: await dbGetAll(STORES.BUNDLES),
        settings: await dbGetAll(STORES.SETTINGS),
        backupDate: new Date().toISOString(),
        version: DB_VERSION
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    const folderId = await createBackupFolder();
    if (!folderId) throw new Error('Tidak bisa mengakses folder backup');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `pos-backup-${timestamp}.json`;

    const fileMetadata = {
        name: fileName,
        parents: [folderId],
        mimeType: 'application/json'
    };

    const media = {
        mimeType: 'application/json',
        body: blob
    };

    const response = await gapi.client.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, size, createdTime'
    });

    const lastBackup = {
        fileName: response.result.name,
        time: new Date().toLocaleString('id-ID'),
        size: formatFileSize(response.result.size)
    };
    localStorage.setItem('lastBackup', JSON.stringify(lastBackup));
    updateLastBackupInfo(lastBackup);

    await cleanupOldBackups(folderId);

    return response.result;
}

async function cleanupOldBackups(folderId) {
    try {
        const response = await gapi.client.drive.files.list({
            q: `'${folderId}' in parents and name contains 'pos-backup-' and trashed=false`,
            fields: 'files(id, name, createdTime)',
            orderBy: 'createdTime desc',
            pageSize: 100
        });

        const files = response.result.files;
        if (files.length > 10) {
            const filesToDelete = files.slice(10);
            for (const file of filesToDelete) {
                await gapi.client.drive.files.delete({ fileId: file.id });
                console.log('Deleted old backup:', file.name);
            }
        }
    } catch (error) {
        console.error('Error cleaning up old backups:', error);
    }
}

async function loadBackupList() {
    try {
        const folderId = localStorage.getItem('driveFolderId');
        if (!folderId) {
            const newFolderId = await createBackupFolder();
            if (!newFolderId) return;
        }

        const response = await gapi.client.drive.files.list({
            q: `'${folderId}' in parents and name contains 'pos-backup-' and trashed=false`,
            fields: 'files(id, name, size, createdTime, modifiedTime)',
            orderBy: 'createdTime desc',
            pageSize: 20
        });

        backupList = response.result.files || [];
        renderBackupList(backupList);
    } catch (error) {
        console.error('Error loading backup list:', error);
        const backupListEl = document.getElementById('backup-list');
        if (backupListEl) {
            backupListEl.innerHTML = `<div style="text-align:center; padding:20px; color:red;">Gagal memuat: ${error.message}</div>`;
        }
    }
}

function renderBackupList(files) {
    const container = document.getElementById('backup-list');
    if (!container) return;
    
    if (!files || files.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">Belum ada backup</div>';
        return;
    }

    let html = '';
    files.forEach(file => {
        const date = new Date(file.createdTime).toLocaleString('id-ID');
        const size = formatFileSize(file.size);
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
                <div style="flex:1;">
                    <div style="font-weight:600; font-size:0.9rem;">${file.name}</div>
                    <div style="font-size:0.75rem; color:#666;">${date} • ${size}</div>
                </div>
                <div>
                    <button class="action-btn edit-btn" style="width:36px; height:36px;" onclick="restoreBackup('${file.id}', '${file.name}')" title="Restore">
                        <svg viewBox="0 0 24 24" width="18" height="18">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                            <path d="M3 3v5h5"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
    
    if (files.length > 0) {
        const lastBackup = {
            fileName: files[0].name,
            time: new Date(files[0].createdTime).toLocaleString('id-ID'),
            size: formatFileSize(files[0].size)
        };
        updateLastBackupInfo(lastBackup);
    }
}

async function restoreBackup(fileId, fileName) {
    if (!confirm(`Yakin ingin merestore data dari backup "${fileName}"?\nData yang ada sekarang akan ditimpa!`)) {
        return;
    }

    safeLoading('Mendownload backup...');
    try {
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });

        const backupData = response.result;
        
        if (!backupData.kasirItems || !backupData.customers) {
            throw new Error('File backup tidak valid');
        }

        safeLoading('Merestore data...');

        if (typeof dbClear !== 'function' || typeof dbPut !== 'function') {
            throw new Error('Fungsi database tidak tersedia');
        }

        await dbClear(STORES.KASIR_CATEGORIES);
        await dbClear(STORES.KASIR_ITEMS);
        await dbClear(STORES.KASIR_SATUAN);
        await dbClear(STORES.CUSTOMERS);
        await dbClear(STORES.SUPPLIERS);
        await dbClear(STORES.PENDING_TRANSACTIONS);
        await dbClear(STORES.SALES);
        await dbClear(STORES.PURCHASES);
        await dbClear(STORES.USERS);
        await dbClear(STORES.ROLES);
        await dbClear(STORES.BUNDLES);
        await dbClear(STORES.SETTINGS);

        const putAll = async (storeName, items) => {
            if (!items || !Array.isArray(items)) return;
            for (const item of items) {
                await dbPut(storeName, item);
            }
        };

        await putAll(STORES.KASIR_CATEGORIES, backupData.kasirCategories);
        await putAll(STORES.KASIR_ITEMS, backupData.kasirItems);
        await putAll(STORES.KASIR_SATUAN, backupData.kasirSatuan);
        await putAll(STORES.CUSTOMERS, backupData.customers);
        await putAll(STORES.SUPPLIERS, backupData.suppliers);
        await putAll(STORES.PENDING_TRANSACTIONS, backupData.pendingTransactions);
        await putAll(STORES.SALES, backupData.sales);
        await putAll(STORES.PURCHASES, backupData.purchases);
        await putAll(STORES.USERS, backupData.users);
        await putAll(STORES.ROLES, backupData.roles);
        await putAll(STORES.BUNDLES, backupData.bundles);
        await putAll(STORES.SETTINGS, backupData.settings);

        // Panggil fungsi refresh dari app.js jika ada
        if (typeof loadKasirCategories === 'function') await loadKasirCategories();
        if (typeof loadKasirItems === 'function') await loadKasirItems();
        if (typeof loadKasirSatuan === 'function') await loadKasirSatuan();
        if (typeof loadCustomers === 'function') await loadCustomers();
        if (typeof loadSuppliers === 'function') await loadSuppliers();
        if (typeof loadPendingTransactions === 'function') await loadPendingTransactions();
        if (typeof loadUsers === 'function') await loadUsers();
        if (typeof loadRoles === 'function') await loadRoles();
        if (typeof loadBundles === 'function') await loadBundles();
        if (typeof updateDashboard === 'function') await updateDashboard();

        safeNotify('Restore berhasil! Aplikasi akan direfresh.', 'success');
        setTimeout(() => window.location.reload(), 2000);

    } catch (error) {
        console.error('Error restoring backup:', error);
        safeNotify('Gagal restore: ' + error.message, 'error');
    } finally {
        safeHideLoading();
    }
}

function refreshBackupList() {
    loadBackupList();
}

function saveDriveSettings() {
    const autoBackupCheck = document.getElementById('auto-backup-transaction');
    const intervalSelect = document.getElementById('backup-interval');
    
    if (!autoBackupCheck || !intervalSelect) return;
    
    const settings = {
        autoBackupTransaction: autoBackupCheck.checked,
        backupInterval: parseInt(intervalSelect.value)
    };
    localStorage.setItem('driveSettings', JSON.stringify(settings));
    
    stopAutoBackup();
    startAutoBackup();
    
    safeNotify('Pengaturan backup disimpan', 'success');
}

function loadDriveSettings() {
    const saved = localStorage.getItem('driveSettings');
    const autoBackupCheck = document.getElementById('auto-backup-transaction');
    const intervalSelect = document.getElementById('backup-interval');
    
    if (saved && autoBackupCheck && intervalSelect) {
        try {
            const settings = JSON.parse(saved);
            autoBackupCheck.checked = settings.autoBackupTransaction || false;
            intervalSelect.value = settings.backupInterval || 1;
        } catch (e) {}
    } else {
        if (autoBackupCheck) autoBackupCheck.checked = false;
        if (intervalSelect) intervalSelect.value = 1;
    }
}

function updateLastBackupInfo(info) {
    const lastBackupEl = document.getElementById('last-backup-info');
    if (lastBackupEl) {
        lastBackupEl.innerHTML = `
            <div>📁 ${info.fileName}</div>
            <div>🕒 ${info.time} • 💾 ${info.size}</div>
        `;
    }
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return size.toFixed(2) + ' ' + units[unitIndex];
}

function openDriveFolder() {
    const folderId = localStorage.getItem('driveFolderId');
    if (folderId) {
        window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
    } else {
        safeNotify('Folder backup belum dibuat', 'warning');
    }
}

function startAutoBackup() {
    stopAutoBackup();
    
    const settings = localStorage.getItem('driveSettings');
    if (!settings) return;
    
    try {
        const { backupInterval } = JSON.parse(settings);
        const intervalMs = backupInterval * 60 * 60 * 1000;
        
        driveBackupInterval = setInterval(async () => {
            console.log('Running auto backup...');
            const token = getSavedToken();
            if (!token) {
                console.log('No token, skipping auto backup');
                return;
            }
            try {
                await performBackup();
                console.log('Auto backup successful');
            } catch (error) {
                console.error('Auto backup failed:', error);
            }
        }, intervalMs);
    } catch (e) {}
}

function stopAutoBackup() {
    if (driveBackupInterval) {
        clearInterval(driveBackupInterval);
        driveBackupInterval = null;
    }
}

// Override processPayment untuk auto backup
if (typeof window.processPayment === 'function') {
    const originalProcessPayment = window.processPayment;
    window.processPayment = async function(...args) {
        const result = await originalProcessPayment(...args);
        
        const settings = localStorage.getItem('driveSettings');
        if (settings) {
            try {
                const { autoBackupTransaction } = JSON.parse(settings);
                const token = getSavedToken();
                if (autoBackupTransaction && token) {
                    setTimeout(() => {
                        performBackup().catch(console.error);
                    }, 1500);
                }
            } catch (e) {}
        }
        
        return result;
    };
}

// Muat Google API segera setelah skrip ini dijalankan
loadGoogleAPI();

// Ekspos fungsi ke global
window.connectGoogleDrive = connectGoogleDrive;
window.disconnectGoogleDrive = disconnectGoogleDrive;
window.manualBackup = manualBackup;
window.refreshBackupList = refreshBackupList;
window.restoreBackup = restoreBackup;
window.openDriveFolder = openDriveFolder;
window.saveDriveSettings = saveDriveSettings;
window.getSavedToken = getSavedToken;
window.updateDriveUI = updateDriveUI;
window.loadDriveSettings = loadDriveSettings;
window.loadBackupList = loadBackupList;
