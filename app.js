// ==================== GLOBAL VARIABLES ====================
let db = null;
let barcodeConfig = {
    flexLength: 2,
    flexValue: '11',
    productLength: 6,
    weightLength: 5
};
let receiptConfig = {
    paperWidth: 32,
    header: "TOKO LOKABUMBU\nTAN KES \n PURB\nTelp: 082",
    footer: "Terima kasih\nSelamat berbelanja kembali\nDelivery Order Via WhatsApp 082",
    showDateTime: true,
    showTransactionNumber: true,
    showCashier: false
};
let kasirCategories = [];
let kasirItems = [];
let kasirSatuan = [];
let customers = [];
let suppliers = [];
let pendingTransactions = [];
let users = [];
let roles = [];
let bundles = [];
let currentUser = null;
let editingKasirCategoryId = null;
let editingKasirItemId = null;
let editingSatuanId = null;
let selectedCustomer = null;
let tempUnitConversions = [];
let editingConversionIndex = -1;
let currentFilteredItems = [];
let cart = [];
let productViewMode = 'list';
let lastTransactionData = null;
let printerPort = null;
let pendingPayments = [];
let pendingTotalPaid = 0;

// ==================== VARIABEL INVENTORY BARU ====================
let warehouses = [];                // daftar gudang
let itemStocks = [];                // stok per item per gudang
let itemBatches = [];               // batch per item per gudang
let itemSerials = [];               // serial number per item
let stockMovements = [];            // riwayat pergerakan stok
let transfers = [];                 // transfer antar gudang
let stocktakes = [];                // stok opname
let consignments = [];              // konsinyasi
let productions = [];               // produksi
let billOfMaterials = [];            // Bill of Materials

// Gudang yang sedang dipilih saat transaksi (default ambil yang pertama)
let selectedWarehouseId = null;

// Instance Chart.js untuk grafik
let salesChartInstance = null;

// Daftar semua menu yang tersedia (untuk permission)
const ALL_MENUS = [
    { id: 'menu-master', label: 'Master Data' },
    { id: 'menu-transaksi', label: 'Transaksi' },
    { id: 'menu-pembelian', label: 'Pembelian' },
    { id: 'menu-inventory', label: 'Inventory' },
    { id: 'menu-cust', label: 'Cust & Supl' },
    { id: 'menu-laporan', label: 'Laporan' },
    { id: 'menu-sistem', label: 'Sistem' },
    { id: 'menu-bundle', label: 'Bundle' },
    // Tambahan menu baru (akan ditampilkan jika user punya akses)
    { id: 'menu-warehouse', label: 'Gudang' },
    { id: 'menu-production', label: 'Produksi' },
    { id: 'menu-consignment', label: 'Konsinyasi' }
];

const icons = {
    edit: `<svg class="icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    delete: `<svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    add: `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    upload: `<svg class="icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
    download: `<svg class="icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
};

// ==================== FUNGSI NOTIFIKASI ====================
function showNotification(message, type = 'info') {
    console.log(`[${type}] ${message}`);
    const notification = document.getElementById('notification');
    if (!notification) {
        alert(message);
        return;
    }
    notification.textContent = message;
    notification.style.backgroundColor = 
        type === 'error' ? '#dc3545' : 
        type === 'success' ? '#28a745' : 
        type === 'warning' ? '#ffc107' : '#006B54';
    notification.style.display = 'block';
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// ==================== FUNGSI CEK STOK BUNDLE (DENGAN GUDANG) ====================
function checkBundleStock(bundle, qty, warehouseId = selectedWarehouseId) {
    if (!bundle.components || !Array.isArray(bundle.components)) return false;
    for (let comp of bundle.components) {
        const item = kasirItems.find(i => i.id === comp.itemId);
        if (!item) return false;
        let needed = comp.qty * qty;
        if (comp.unitConversionId) {
            const conv = item.unitConversions?.find(u => u.id == comp.unitConversionId);
            if (!conv) return false;
            needed *= conv.value;
        }
        // Cek stok di gudang yang dipilih
        const stock = getItemStock(item.id, warehouseId);
        if (stock < needed) return false;
    }
    return true;
}

// ==================== FUNGSI UNTUK SUBMENU SIDEBAR ====================
function toggleSubMenu(header) {
    const subMenu = header.nextElementSibling;
    if (subMenu && subMenu.classList.contains('sub-menu')) {
        document.querySelectorAll('.sub-menu').forEach(sm => sm.style.display = 'none');
        document.querySelectorAll('.menu-header').forEach(h => h.classList.remove('open'));
        if (subMenu.style.display !== 'block') {
            subMenu.style.display = 'block';
            header.classList.add('open');
        } else {
            subMenu.style.display = 'none';
        }
    }
}

function closeSubMenu(button) {
    const subMenu = button.closest('.sub-menu');
    if (subMenu) {
        subMenu.style.display = 'none';
        const header = subMenu.previousElementSibling;
        if (header && header.classList.contains('menu-header')) {
            header.classList.remove('open');
        }
    }
}

function closeDrawer() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('show');
    document.querySelectorAll('.sub-menu').forEach(sm => sm.style.display = 'none');
    document.querySelectorAll('.menu-header').forEach(h => h.classList.remove('open'));
}

function toggleDrawer() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('drawer-overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
}

// ==================== AUDIO NOTIFICATION SYSTEM ====================
let audioContext = null;
let audioInitialized = false;

function initAudioSystem() {
    if (audioInitialized) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioInitialized = true;
        console.log("Audio system initialized");
        createFallbackSounds();
    } catch (error) {
        console.log("AudioContext not supported, using fallback:", error);
        createFallbackSounds();
    }
}

function createFallbackSounds() {
    const successAudio = document.getElementById('notification-success');
    if (successAudio) successAudio.src = createBeepSound(800, 0.3);
    const warningAudio = document.getElementById('notification-warning');
    if (warningAudio) warningAudio.src = createBeepSound(600, 0.2);
    const errorAudio = document.getElementById('notification-error');
    if (errorAudio) errorAudio.src = createBeepSound(400, 0.5);
    const buttonClickAudio = document.getElementById('button-click-sound');
    if (buttonClickAudio) buttonClickAudio.src = createBeepSound(600, 0.1);
}

function createBeepSound(frequency, duration) {
    const sampleRate = 44100;
    const channels = 1;
    const samples = Math.floor(sampleRate * duration);
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples * 2, true);
    const amplitude = 0.3;
    for (let i = 0; i < samples; i++) {
        const time = i / sampleRate;
        const sample = Math.sin(2 * Math.PI * frequency * time) * amplitude;
        const intSample = Math.max(-1, Math.min(1, sample)) * 32767;
        view.setInt16(44 + i * 2, intSample, true);
    }
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return 'data:audio/wav;base64,' + btoa(binary);
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
}

function playClickSound() {
    try {
        if (!audioInitialized) initAudioSystem();
        if (audioContext && audioContext.state === 'suspended') audioContext.resume();
        if (audioContext && audioContext.state === 'running') {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.value = 600;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
            oscillator.onended = () => {
                oscillator.disconnect();
                gainNode.disconnect();
            };
        } else {
            const buttonClickAudio = document.getElementById('button-click-sound');
            if (buttonClickAudio) {
                buttonClickAudio.currentTime = 0;
                buttonClickAudio.play().catch(e => console.log("Audio play failed:", e));
            }
        }
    } catch (error) { console.log("Click sound play failed:", error); }
}

function playSuccessSound() {
    try {
        if (!audioInitialized) initAudioSystem();
        if (audioContext && audioContext.state === 'suspended') audioContext.resume();
        if (audioContext && audioContext.state === 'running') {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
            oscillator.onended = () => {
                oscillator.disconnect();
                gainNode.disconnect();
            };
        } else {
            const successAudio = document.getElementById('notification-success');
            if (successAudio) {
                successAudio.currentTime = 0;
                successAudio.play().catch(e => console.log("Audio play failed:", e));
            }
        }
    } catch (error) { console.log("Sound play failed:", error); }
}

function playWarningSound() {
    try {
        if (!audioInitialized) initAudioSystem();
        if (audioContext && audioContext.state === 'suspended') audioContext.resume();
        if (audioContext && audioContext.state === 'running') {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.value = 600;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + 0.2);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.35);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.35);
            oscillator.onended = () => {
                oscillator.disconnect();
                gainNode.disconnect();
            };
        } else {
            const warningAudio = document.getElementById('notification-warning');
            if (warningAudio) {
                warningAudio.currentTime = 0;
                warningAudio.play().catch(e => console.log("Audio play failed:", e));
            }
        }
    } catch (error) { console.log("Warning sound failed:", error); }
}

function playErrorSound() {
    try {
        if (!audioInitialized) initAudioSystem();
        if (audioContext && audioContext.state === 'suspended') audioContext.resume();
        if (audioContext && audioContext.state === 'running') {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.value = 400;
            oscillator.type = 'sawtooth';
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.6);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.6);
            oscillator.onended = () => {
                oscillator.disconnect();
                gainNode.disconnect();
            };
        } else {
            const errorAudio = document.getElementById('notification-error');
            if (errorAudio) {
                errorAudio.currentTime = 0;
                errorAudio.play().catch(e => console.log("Audio play failed:", e));
            }
        }
    } catch (error) { console.log("Error sound failed:", error); }
}

document.addEventListener('click', function initAudioOnInteraction() {
    if (!audioInitialized) {
        initAudioSystem();
        document.removeEventListener('click', initAudioOnInteraction);
    }
}, { once: true });

// ==================== LOADING STATE FUNCTIONS ====================
let loadingNotificationTimeout = null;

function showLoading(message = 'Memproses...') {
    const notif = document.getElementById('notification');
    if (notif) {
        notif.textContent = message;
        notif.style.backgroundColor = '#006B54';
        notif.style.display = 'block';
        if (loadingNotificationTimeout) clearTimeout(loadingNotificationTimeout);
    }
}

function hideLoading() {
    const notif = document.getElementById('notification');
    if (notif) {
        notif.style.display = 'none';
    }
    if (loadingNotificationTimeout) {
        clearTimeout(loadingNotificationTimeout);
        loadingNotificationTimeout = null;
    }
}

function showError(message) {
    const errorState = document.getElementById('error-state');
    const errorMessage = document.getElementById('error-message');
    const mainContent = document.querySelector('.main-content');
    if (errorState && errorMessage) {
        errorMessage.textContent = message;
        errorState.style.display = 'block';
    }
    if (mainContent) mainContent.style.display = 'none';
}

function hideError() {
    const errorState = document.getElementById('error-state');
    const mainContent = document.querySelector('.main-content');
    if (errorState) errorState.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';
}

// ==================== DATABASE CONFIGURATION ====================
const DB_NAME = 'POSKasirDB';
const DB_VERSION = 21; // Dinaikkan untuk menambah store baru
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
    BUNDLES: 'bundles',
    // ========== STORE BARU ==========
    WAREHOUSES: 'warehouses',
    ITEM_STOCKS: 'item_stocks',
    ITEM_BATCHES: 'item_batches',
    ITEM_SERIALS: 'item_serials',
    STOCK_MOVEMENTS: 'stock_movements',
    TRANSFERS: 'transfers',
    TRANSFER_ITEMS: 'transfer_items',
    STOCKTAKES: 'stocktakes',
    STOCKTAKE_ITEMS: 'stocktake_items',
    CONSIGNMENTS: 'consignments',
    CONSIGNMENT_ITEMS: 'consignment_items',
    BILL_OF_MATERIALS: 'bill_of_materials',
    PRODUCTIONS: 'productions',
    PRODUCTION_ITEMS: 'production_items'
};

// ==================== DATABASE FUNCTIONS ====================
async function initDatabase() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            const error = "Browser tidak mendukung IndexedDB. Gunakan Chrome, Edge, atau Firefox versi terbaru.";
            console.error(error);
            showError(error);
            reject(new Error(error));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (event) => {
            console.error('Database error:', event.target.error);
            showError('Gagal membuka database: ' + event.target.error);
            reject(event.target.error);
        };
        request.onblocked = () => {
            console.warn('Database blocked. Tutup tab lain yang menggunakan aplikasi ini.');
            showError('Database diblokir. Tutup tab lain dan refresh halaman.');
            reject(new Error('Database blocked'));
        };
        request.onsuccess = (event) => {
            db = event.target.result;
            db.onerror = (event) => {
                console.error('Database error:', event.target.error);
                showNotification('Error database: ' + event.target.error, 'error');
            };
            db.onversionchange = (event) => {
                console.log('Database version changed, closing...');
                db.close();
                showNotification('Database diperbarui, silakan refresh halaman.', 'info');
            };
            console.log('Database initialized successfully');
            resolve();
        };
        request.onupgradeneeded = (event) => {
            console.log('Upgrading database from version', event.oldVersion, 'to', event.newVersion);
            const db = event.target.result;
            
            // Store yang sudah ada (dari versi sebelumnya)
            if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(STORES.APP_STATE)) {
                db.createObjectStore(STORES.APP_STATE, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(STORES.KASIR_CATEGORIES)) {
                const kasirCatStore = db.createObjectStore(STORES.KASIR_CATEGORIES, { keyPath: 'id', autoIncrement: true });
                kasirCatStore.createIndex('name', 'name', { unique: true });
            }
            if (!db.objectStoreNames.contains(STORES.KASIR_ITEMS)) {
                const kasirItemStore = db.createObjectStore(STORES.KASIR_ITEMS, { keyPath: 'id', autoIncrement: true });
                kasirItemStore.createIndex('code', 'code', { unique: true });
                kasirItemStore.createIndex('categoryId', 'categoryId', { unique: false });
            } else {
                // Migrasi: tambahkan field minStock jika belum ada (dari versi sebelumnya)
                const transaction = event.target.transaction;
                const store = transaction.objectStore(STORES.KASIR_ITEMS);
                store.openCursor().onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        const item = cursor.value;
                        if (item.minStock === undefined) {
                            item.minStock = 5;
                            cursor.update(item);
                        }
                        cursor.continue();
                    }
                };
            }
            if (!db.objectStoreNames.contains(STORES.KASIR_SATUAN)) {
                const satuanStore = db.createObjectStore(STORES.KASIR_SATUAN, { keyPath: 'id', autoIncrement: true });
                satuanStore.createIndex('name', 'name', { unique: true });
            }
            if (!db.objectStoreNames.contains(STORES.CUSTOMERS)) {
                const customerStore = db.createObjectStore(STORES.CUSTOMERS, { keyPath: 'id', autoIncrement: true });
                customerStore.createIndex('name', 'name', { unique: false });
            }
            if (!db.objectStoreNames.contains(STORES.SUPPLIERS)) {
                const supplierStore = db.createObjectStore(STORES.SUPPLIERS, { keyPath: 'id', autoIncrement: true });
                supplierStore.createIndex('name', 'name', { unique: false });
            }
            if (!db.objectStoreNames.contains(STORES.PENDING_TRANSACTIONS)) {
                const pendingStore = db.createObjectStore(STORES.PENDING_TRANSACTIONS, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(STORES.SALES)) {
                const salesStore = db.createObjectStore(STORES.SALES, { keyPath: 'id', autoIncrement: true });
                salesStore.createIndex('date', 'date', { unique: false });
                salesStore.createIndex('transactionNumber', 'transactionNumber', { unique: true });
            }
            if (!db.objectStoreNames.contains(STORES.PURCHASES)) {
                const purchaseStore = db.createObjectStore(STORES.PURCHASES, { keyPath: 'id', autoIncrement: true });
                purchaseStore.createIndex('date', 'date', { unique: false });
                purchaseStore.createIndex('supplierId', 'supplierId', { unique: false });
                purchaseStore.createIndex('purchaseNumber', 'purchaseNumber', { unique: true });
            }
            if (!db.objectStoreNames.contains(STORES.USERS)) {
                const userStore = db.createObjectStore(STORES.USERS, { keyPath: 'id', autoIncrement: true });
                userStore.createIndex('username', 'username', { unique: true });
            }
            if (!db.objectStoreNames.contains(STORES.ROLES)) {
                const roleStore = db.createObjectStore(STORES.ROLES, { keyPath: 'id', autoIncrement: true });
                roleStore.createIndex('name', 'name', { unique: true });
            }
            if (!db.objectStoreNames.contains(STORES.BUNDLES)) {
                db.createObjectStore(STORES.BUNDLES, { keyPath: 'id', autoIncrement: true });
            }

            // ========== STORE BARU UNTUK INVENTORY ==========
            if (!db.objectStoreNames.contains(STORES.WAREHOUSES)) {
                const warehouseStore = db.createObjectStore(STORES.WAREHOUSES, { keyPath: 'id', autoIncrement: true });
                warehouseStore.createIndex('code', 'code', { unique: true });
            }
            if (!db.objectStoreNames.contains(STORES.ITEM_STOCKS)) {
                const stockStore = db.createObjectStore(STORES.ITEM_STOCKS, { keyPath: 'id', autoIncrement: true });
                stockStore.createIndex('item_warehouse', ['itemId', 'warehouseId'], { unique: true });
            }
            if (!db.objectStoreNames.contains(STORES.ITEM_BATCHES)) {
                const batchStore = db.createObjectStore(STORES.ITEM_BATCHES, { keyPath: 'id', autoIncrement: true });
                batchStore.createIndex('item_warehouse', ['itemId', 'warehouseId']);
                batchStore.createIndex('expiry', 'expiryDate');
            }
            if (!db.objectStoreNames.contains(STORES.ITEM_SERIALS)) {
                const serialStore = db.createObjectStore(STORES.ITEM_SERIALS, { keyPath: 'id', autoIncrement: true });
                serialStore.createIndex('serial', 'serialNumber', { unique: true });
                serialStore.createIndex('status', 'status');
                serialStore.createIndex('item_warehouse', ['itemId', 'warehouseId']);
            }
            if (!db.objectStoreNames.contains(STORES.STOCK_MOVEMENTS)) {
                const movementStore = db.createObjectStore(STORES.STOCK_MOVEMENTS, { keyPath: 'id', autoIncrement: true });
                movementStore.createIndex('itemId', 'itemId');
                movementStore.createIndex('warehouseId', 'warehouseId');
                movementStore.createIndex('date', 'createdAt');
                movementStore.createIndex('reference', ['referenceType', 'referenceId']);
            }
            if (!db.objectStoreNames.contains(STORES.TRANSFERS)) {
                const transferStore = db.createObjectStore(STORES.TRANSFERS, { keyPath: 'id', autoIncrement: true });
                transferStore.createIndex('number', 'transferNumber', { unique: true });
            }
            if (!db.objectStoreNames.contains(STORES.TRANSFER_ITEMS)) {
                db.createObjectStore(STORES.TRANSFER_ITEMS, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(STORES.STOCKTAKES)) {
                const stocktakeStore = db.createObjectStore(STORES.STOCKTAKES, { keyPath: 'id', autoIncrement: true });
                stocktakeStore.createIndex('number', 'stocktakeNumber', { unique: true });
            }
            if (!db.objectStoreNames.contains(STORES.STOCKTAKE_ITEMS)) {
                db.createObjectStore(STORES.STOCKTAKE_ITEMS, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(STORES.CONSIGNMENTS)) {
                const consignmentStore = db.createObjectStore(STORES.CONSIGNMENTS, { keyPath: 'id', autoIncrement: true });
                consignmentStore.createIndex('number', 'consignmentNumber', { unique: true });
            }
            if (!db.objectStoreNames.contains(STORES.CONSIGNMENT_ITEMS)) {
                db.createObjectStore(STORES.CONSIGNMENT_ITEMS, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(STORES.BILL_OF_MATERIALS)) {
                db.createObjectStore(STORES.BILL_OF_MATERIALS, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(STORES.PRODUCTIONS)) {
                const productionStore = db.createObjectStore(STORES.PRODUCTIONS, { keyPath: 'id', autoIncrement: true });
                productionStore.createIndex('number', 'productionNumber', { unique: true });
            }
            if (!db.objectStoreNames.contains(STORES.PRODUCTION_ITEMS)) {
                db.createObjectStore(STORES.PRODUCTION_ITEMS, { keyPath: 'id', autoIncrement: true });
            }

            event.target.transaction.oncomplete = () => console.log('Database upgrade completed');
        };
    });
}

async function dbGetAll(storeName) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('Database not initialized')); return; }
        try {
            const transaction = db.transaction([storeName], 'readonly');
            const objectStore = transaction.objectStore(storeName);
            const request = objectStore.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        } catch (error) { reject(error); }
    });
}

async function dbGet(storeName, key) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('Database not initialized')); return; }
        try {
            const transaction = db.transaction([storeName], 'readonly');
            const objectStore = transaction.objectStore(storeName);
            const request = objectStore.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        } catch (error) { reject(error); }
    });
}

async function dbAdd(storeName, data) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('Database not initialized')); return; }
        try {
            const transaction = db.transaction([storeName], 'readwrite');
            const objectStore = transaction.objectStore(storeName);
            const request = objectStore.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => {
                console.error(`Error adding to ${storeName}:`, data, e.target.error);
                if (e.target.error.name === 'ConstraintError') {
                    reject(new Error(`Data dengan key yang sama sudah ada di ${storeName}`));
                } else { reject(e.target.error); }
            };
        } catch (error) { reject(error); }
    });
}

async function dbPut(storeName, data) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('Database not initialized')); return; }
        try {
            const transaction = db.transaction([storeName], 'readwrite');
            const objectStore = transaction.objectStore(storeName);
            const request = objectStore.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        } catch (error) { reject(error); }
    });
}

async function dbDelete(storeName, key) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('Database not initialized')); return; }
        try {
            const transaction = db.transaction([storeName], 'readwrite');
            const objectStore = transaction.objectStore(storeName);
            const request = objectStore.delete(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        } catch (error) { reject(error); }
    });
}

async function dbClear(storeName) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('Database not initialized')); return; }
        try {
            const transaction = db.transaction([storeName], 'readwrite');
            const objectStore = transaction.objectStore(storeName);
            const request = objectStore.clear();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        } catch (error) { reject(error); }
    });
}

// ==================== FUNGSI UNTUK USERS DAN ROLES ====================
async function loadUsers() {
    try { users = await dbGetAll(STORES.USERS); } 
    catch (error) { console.error('Error loading users:', error); users = []; }
}

async function loadRoles() {
    try { roles = await dbGetAll(STORES.ROLES); } 
    catch (error) { console.error('Error loading roles:', error); roles = []; }
}

async function hashPassword(password) {
    if (window.crypto && window.crypto.subtle) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(password);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) { console.warn('Crypto digest failed, using fallback', e); }
    }
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return hash.toString(16);
}

async function getUserPermissions(user) {
    if (!user || !user.roleId) return [];
    const role = await dbGet(STORES.ROLES, user.roleId);
    return role ? role.permissions : [];
}

// ==================== LOGIN & LOGOUT ====================
function showLoginScreen() {
    const overlay = document.getElementById('login-overlay');
    overlay.style.display = 'flex';

    document.getElementById('login-btn').onclick = loginHandler;
    document.getElementById('import-login-btn').onclick = async () => {
        const success = await importData(true);
        if (success) {
            await loadUsers();
            showNotification('Data berhasil diimpor. Silakan login.', 'success');
        }
    };

    if (users.length === 0) {
        let tapCount = 0;
        overlay.addEventListener('click', function tapHandler(e) {
            if (e.target.closest('.login-container')) return;
            tapCount++;
            if (tapCount >= 10) {
                overlay.removeEventListener('click', tapHandler);
                openCreateAdminModal();
            }
        });
    }
}

async function loginHandler() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    if (!username || !password) {
        showNotification('Isi username dan password', 'error');
        return;
    }
    const hashed = await hashPassword(password);
    const user = users.find(u => u.username === username && u.password === hashed);
    if (user) {
        currentUser = user;
        const permissions = await getUserPermissions(user);
        currentUser.permissions = permissions;
        sessionStorage.setItem('currentUser', JSON.stringify({ 
            id: user.id, 
            roleId: user.roleId, 
            name: user.name,
            permissions: permissions 
        }));
        document.getElementById('login-overlay').style.display = 'none';
        updateSidebarByPermissions(permissions);
        document.getElementById('user-name-display').textContent = user.name;
        showNotification(`Selamat datang, ${user.name}`, 'success');
    } else {
        document.getElementById('login-error').style.display = 'block';
        setTimeout(() => document.getElementById('login-error').style.display = 'none', 2000);
    }
}

function logout() {
    if (!confirm('Apakah Anda yakin ingin keluar?')) {
        return;
    }
    currentUser = null;
    sessionStorage.removeItem('currentUser');
    document.getElementById('user-name-display').textContent = '';
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.querySelector('.main-content').style.display = 'block';
    document.getElementById('transaksi-page').style.display = 'none';
    document.getElementById('cart-page').style.display = 'none';
    document.getElementById('payment-page').style.display = 'none';
    closeDrawer();
}

function updateSidebarByPermissions(permissions) {
    ALL_MENUS.forEach(menu => {
        const el = document.getElementById(menu.id);
        if (el) el.style.display = 'none';
    });
    permissions.forEach(permId => {
        const el = document.getElementById(permId);
        if (el) el.style.display = 'block';
    });
}

function bypassLogin() {
    currentUser = { id: 'bypass', username: 'owner', roleId: null, name: 'Owner', permissions: ALL_MENUS.map(m => m.id) };
    sessionStorage.setItem('currentUser', JSON.stringify({ id: 'bypass', roleId: null, name: 'Owner', permissions: ALL_MENUS.map(m => m.id) }));
    document.getElementById('login-overlay').style.display = 'none';
    updateSidebarByPermissions(ALL_MENUS.map(m => m.id));
    document.getElementById('user-name-display').textContent = 'Owner';
    showNotification('Mode owner (bypass)', 'info');
}

// ==================== FUNGSI UNTUK ADMIN PERTAMA ====================
function openCreateAdminModal() {
    document.getElementById('create-admin-modal').style.display = 'flex';
}

function closeCreateAdminModal() {
    document.getElementById('create-admin-modal').style.display = 'none';
}

async function saveFirstAdmin() {
    const username = document.getElementById('admin-username').value.trim();
    const password = document.getElementById('admin-password').value.trim();
    const name = document.getElementById('admin-name').value.trim();
    if (!username || !password || !name) {
        showNotification('Semua field harus diisi', 'error');
        return;
    }
    if (users.some(u => u.username === username)) {
        showNotification('Username sudah digunakan', 'error');
        return;
    }
    const hashed = await hashPassword(password);
    const now = new Date().toISOString();

    let adminRole = roles.find(r => r.name === 'Admin');
    if (!adminRole) {
        adminRole = { name: 'Admin', permissions: ALL_MENUS.map(m => m.id) };
        const roleId = await dbAdd(STORES.ROLES, adminRole);
        adminRole.id = roleId;
        roles.push(adminRole);
    }

    const newUser = {
        username,
        password: hashed,
        roleId: adminRole.id,
        name,
        createdAt: now,
        updatedAt: now
    };
    try {
        showLoading();
        const id = await dbAdd(STORES.USERS, newUser);
        newUser.id = id;
        users.push(newUser);
        showNotification('Admin berhasil dibuat, silakan login', 'success');
        closeCreateAdminModal();
    } catch (error) {
        showNotification('Gagal menyimpan: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// ==================== FUNGSI SETTINGS MODAL ====================
async function exportData(skipAuth = false) {
    if (!skipAuth && (!currentUser || !currentUser.permissions || !currentUser.permissions.includes('menu-sistem'))) {
        showNotification('Anda tidak memiliki akses ke menu ini', 'error');
        return false;
    }
    try {
        showLoading('Mengekspor data...');
        const exportData = {
            kasirCategories: await dbGetAll(STORES.KASIR_CATEGORIES),
            kasirItems: await dbGetAll(STORES.KASIR_ITEMS),
            kasirSatuan: await dbGetAll(STORES.KASIR_SATUAN),
            customers: await dbGetAll(STORES.CUSTOMERS),
            suppliers: await dbGetAll(STORES.SUPPLIERS),
            pendingTransactions: await dbGetAll(STORES.PENDING_TRANSACTIONS),
            settings: await dbGetAll(STORES.SETTINGS),
            users: await dbGetAll(STORES.USERS),
            roles: await dbGetAll(STORES.ROLES),
            bundles: await dbGetAll(STORES.BUNDLES),
            // Data inventory baru
            warehouses: await dbGetAll(STORES.WAREHOUSES),
            itemStocks: await dbGetAll(STORES.ITEM_STOCKS),
            itemBatches: await dbGetAll(STORES.ITEM_BATCHES),
            itemSerials: await dbGetAll(STORES.ITEM_SERIALS),
            stockMovements: await dbGetAll(STORES.STOCK_MOVEMENTS),
            transfers: await dbGetAll(STORES.TRANSFERS),
            transferItems: await dbGetAll(STORES.TRANSFER_ITEMS),
            stocktakes: await dbGetAll(STORES.STOCKTAKES),
            stocktakeItems: await dbGetAll(STORES.STOCKTAKE_ITEMS),
            consignments: await dbGetAll(STORES.CONSIGNMENTS),
            consignmentItems: await dbGetAll(STORES.CONSIGNMENT_ITEMS),
            billOfMaterials: await dbGetAll(STORES.BILL_OF_MATERIALS),
            productions: await dbGetAll(STORES.PRODUCTIONS),
            productionItems: await dbGetAll(STORES.PRODUCTION_ITEMS),
            exportDate: new Date().toISOString(),
            version: DB_VERSION
        };
        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const exportFileName = `pos-backup-${new Date().toISOString().split('T')[0]}.json`;
        const link = document.createElement('a');
        link.href = url;
        link.download = exportFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showNotification('Data berhasil dieksport!', 'success');
        return true;
    } catch (error) {
        console.error('Error exporting data:', error);
        showNotification('Gagal mengeksport data: ' + error.message, 'error');
        return false;
    } finally {
        hideLoading();
    }
}

async function importData(skipAuth = false) {
    if (!skipAuth && (!currentUser || !currentUser.permissions || !currentUser.permissions.includes('menu-sistem'))) {
        showNotification('Anda tidak memiliki akses ke menu ini', 'error');
        return false;
    }
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) { resolve(false); return; }
            showLoading('Mengimpor data...');
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    
                    // Validasi struktur data
                    const requiredStores = [
                        'kasirCategories', 'kasirItems', 'kasirSatuan',
                        'customers', 'suppliers', 'pendingTransactions',
                        'settings', 'users', 'roles', 'bundles',
                        'warehouses', 'itemStocks', 'itemBatches', 'itemSerials',
                        'stockMovements', 'transfers', 'transferItems',
                        'stocktakes', 'stocktakeItems', 'consignments',
                        'consignmentItems', 'billOfMaterials', 'productions',
                        'productionItems'
                    ];
                    for (const store of requiredStores) {
                        if (!importedData[store]) {
                            throw new Error(`File tidak valid: properti "${store}" tidak ditemukan.`);
                        }
                    }

                    const putAll = async (storeName, items) => {
                        const errors = [];
                        if (!items || !Array.isArray(items)) return errors;
                        for (const item of items) {
                            try {
                                await dbPut(storeName, item);
                            } catch (error) {
                                errors.push({ item, error: error.message });
                                console.warn(`Gagal mengupdate item di ${storeName}:`, item, error);
                            }
                        }
                        return errors;
                    };

                    const allErrors = [];
                    allErrors.push(...await putAll(STORES.KASIR_CATEGORIES, importedData.kasirCategories));
                    allErrors.push(...await putAll(STORES.KASIR_ITEMS, importedData.kasirItems));
                    allErrors.push(...await putAll(STORES.KASIR_SATUAN, importedData.kasirSatuan));
                    allErrors.push(...await putAll(STORES.CUSTOMERS, importedData.customers));
                    allErrors.push(...await putAll(STORES.SUPPLIERS, importedData.suppliers));
                    allErrors.push(...await putAll(STORES.PENDING_TRANSACTIONS, importedData.pendingTransactions));
                    allErrors.push(...await putAll(STORES.SETTINGS, importedData.settings));
                    allErrors.push(...await putAll(STORES.USERS, importedData.users));
                    allErrors.push(...await putAll(STORES.ROLES, importedData.roles));
                    allErrors.push(...await putAll(STORES.BUNDLES, importedData.bundles));
                    allErrors.push(...await putAll(STORES.WAREHOUSES, importedData.warehouses));
                    allErrors.push(...await putAll(STORES.ITEM_STOCKS, importedData.itemStocks));
                    allErrors.push(...await putAll(STORES.ITEM_BATCHES, importedData.itemBatches));
                    allErrors.push(...await putAll(STORES.ITEM_SERIALS, importedData.itemSerials));
                    allErrors.push(...await putAll(STORES.STOCK_MOVEMENTS, importedData.stockMovements));
                    allErrors.push(...await putAll(STORES.TRANSFERS, importedData.transfers));
                    allErrors.push(...await putAll(STORES.TRANSFER_ITEMS, importedData.transferItems));
                    allErrors.push(...await putAll(STORES.STOCKTAKES, importedData.stocktakes));
                    allErrors.push(...await putAll(STORES.STOCKTAKE_ITEMS, importedData.stocktakeItems));
                    allErrors.push(...await putAll(STORES.CONSIGNMENTS, importedData.consignments));
                    allErrors.push(...await putAll(STORES.CONSIGNMENT_ITEMS, importedData.consignmentItems));
                    allErrors.push(...await putAll(STORES.BILL_OF_MATERIALS, importedData.billOfMaterials));
                    allErrors.push(...await putAll(STORES.PRODUCTIONS, importedData.productions));
                    allErrors.push(...await putAll(STORES.PRODUCTION_ITEMS, importedData.productionItems));

                    await loadKasirCategories();
                    await loadKasirItems();
                    await loadKasirSatuan();
                    await loadCustomers();
                    await loadSuppliers();
                    await loadPendingTransactions();
                    await loadUsers();
                    await loadRoles();
                    await loadBundles();
                    await loadWarehouses();
                    await loadItemStocks();
                    await loadItemBatches();
                    await loadItemSerials();
                    await loadStockMovements();
                    await loadTransfers();
                    await loadStocktakes();
                    await loadConsignments();
                    await loadBOMs();
                    await loadProductions();
                    await loadCartFromLocalStorage();
                    await updateDashboard();

                    if (allErrors.length > 0) {
                        console.warn('Beberapa item gagal diimpor:', allErrors);
                        showNotification(`Import selesai dengan ${allErrors.length} error. Lihat konsol.`, 'warning');
                    } else {
                        showNotification('Data berhasil diimport (merge)!', 'success');
                    }
                    resolve(true);
                } catch (error) {
                    console.error('Error importing data:', error);
                    showNotification('Gagal mengimport data: ' + error.message, 'error');
                    resolve(false);
                } finally { hideLoading(); }
            };
            reader.onerror = () => { showNotification('Gagal membaca file', 'error'); hideLoading(); resolve(false); };
            reader.readAsText(file);
        };
        input.click();
    });
}

async function clearAllData() {
    if (confirm('Apakah Anda yakin ingin menghapus SEMUA data?\nTindakan ini tidak dapat dibatalkan!')) {
        try {
            showLoading();
            await dbClear(STORES.KASIR_CATEGORIES);
            await dbClear(STORES.KASIR_ITEMS);
            await dbClear(STORES.KASIR_SATUAN);
            await dbClear(STORES.CUSTOMERS);
            await dbClear(STORES.SUPPLIERS);
            await dbClear(STORES.PENDING_TRANSACTIONS);
            await dbClear(STORES.SETTINGS);
            await dbClear(STORES.APP_STATE);
            await dbClear(STORES.USERS);
            await dbClear(STORES.ROLES);
            await dbClear(STORES.BUNDLES);
            await dbClear(STORES.WAREHOUSES);
            await dbClear(STORES.ITEM_STOCKS);
            await dbClear(STORES.ITEM_BATCHES);
            await dbClear(STORES.ITEM_SERIALS);
            await dbClear(STORES.STOCK_MOVEMENTS);
            await dbClear(STORES.TRANSFERS);
            await dbClear(STORES.TRANSFER_ITEMS);
            await dbClear(STORES.STOCKTAKES);
            await dbClear(STORES.STOCKTAKE_ITEMS);
            await dbClear(STORES.CONSIGNMENTS);
            await dbClear(STORES.CONSIGNMENT_ITEMS);
            await dbClear(STORES.BILL_OF_MATERIALS);
            await dbClear(STORES.PRODUCTIONS);
            await dbClear(STORES.PRODUCTION_ITEMS);

            kasirCategories = [];
            kasirItems = [];
            kasirSatuan = [];
            customers = [];
            suppliers = [];
            pendingTransactions = [];
            users = [];
            roles = [];
            bundles = [];
            warehouses = [];
            itemStocks = [];
            itemBatches = [];
            itemSerials = [];
            stockMovements = [];
            transfers = [];
            stocktakes = [];
            consignments = [];
            billOfMaterials = [];
            productions = [];

            updatePendingBadge();
            await updateDashboard();
            showNotification('Semua data berhasil dihapus!', 'success');
        } catch (error) {
            console.error('Error clearing data:', error);
            showNotification('Gagal menghapus data: ' + error.message, 'error');
        } finally { hideLoading(); }
    }
}

async function forceResetDatabase() {
    if (confirm('Yakin ingin reset database? Semua data akan hilang dan aplikasi akan direfresh!')) {
        try {
            showLoading();
            if (db) db.close();
            const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
            deleteRequest.onsuccess = () => {
                console.log('Database deleted successfully');
                showNotification('Database direset. Halaman akan direfresh...', 'success');
                setTimeout(() => location.reload(), 2000);
            };
            deleteRequest.onerror = (event) => {
                console.error('Error deleting database:', event.target.error);
                showNotification('Gagal mereset database: ' + event.target.error, 'error');
                hideLoading();
            };
            deleteRequest.onblocked = () => {
                showNotification('Database diblokir. Tutup tab lain dan coba lagi.', 'error');
                hideLoading();
            };
        } catch (error) {
            console.error('Error in force reset:', error);
            showNotification('Error: ' + error.message, 'error');
            hideLoading();
        }
    }
}

async function loadReceiptConfig() {
    try {
        const transaction = db.transaction([STORES.SETTINGS], 'readonly');
        const store = transaction.objectStore(STORES.SETTINGS);
        const request = store.get('receiptConfig');
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                if (request.result) {
                    receiptConfig = request.result.value;
                } else {
                    receiptConfig = {
                        paperWidth: 32,
                        header: "TOKO LOKABUMBU\nTAN KES \n PURB \nTelp: 082",
                        footer: "Terima kasih\nSelamat berbelanja kembali \n Delivery Order Via WhatsApp \n 082",
                        showDateTime: true,
                        showTransactionNumber: true,
                        showCashier: false
                    };
                }
                resolve();
            };
            request.onerror = (e) => reject(e.target.error);
        });
    } catch (error) {
        console.error('Error loading receipt config:', error);
        receiptConfig = {
            paperWidth: 32,
            header: "TOKO LOKABUMBU\nTAN KES \n PURB \nTelp: 082",
            footer: "Terima kasih\nSelamat berbelanja kembali \n Delivery Order Via WhatsApp \n 082",
            showDateTime: true,
            showTransactionNumber: true,
            showCashier: false
        };
    }
}

async function saveReceiptConfig() {
    const paperWidth = parseInt(document.getElementById('receipt-paper-width').value);
    if (isNaN(paperWidth) || paperWidth < 10) {
        showNotification('Lebar kertas minimal 10 karakter', 'error');
        return;
    }

    const headerRaw = document.getElementById('receipt-header').value;
    const footerRaw = document.getElementById('receipt-footer').value;
    const header = headerRaw.replace(/\\n/g, '\n');
    const footer = footerRaw.replace(/\\n/g, '\n');

    const showDateTime = document.getElementById('receipt-show-datetime').checked;
    const showTransactionNumber = document.getElementById('receipt-show-transnum').checked;
    const showCashier = document.getElementById('receipt-show-cashier').checked;

    const newConfig = {
        paperWidth,
        header,
        footer,
        showDateTime,
        showTransactionNumber,
        showCashier
    };

    try {
        showLoading();
        const transaction = db.transaction([STORES.SETTINGS], 'readwrite');
        const store = transaction.objectStore(STORES.SETTINGS);
        const data = { key: 'receiptConfig', value: newConfig };
        await new Promise((resolve, reject) => {
            const request = store.put(data);
            request.onsuccess = () => {
                receiptConfig = newConfig;
                resolve();
            };
            request.onerror = (e) => reject(e.target.error);
        });
        showNotification('Pengaturan struk tersimpan', 'success');
        closeSettingsModal();
    } catch (error) {
        showNotification('Gagal menyimpan: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// ==================== TAMBAHAN: EXPORT/IMPORT HARGA ====================
async function exportPrices() {
    if (!currentUser || !currentUser.permissions || !currentUser.permissions.includes('menu-sistem')) {
        showNotification('Anda tidak memiliki akses', 'error');
        return;
    }
    try {
        const items = kasirItems.map(item => ({
            id: item.id,
            code: item.code,
            name: item.name,
            hargaDasar: item.hargaDasar || 0,
            hargaJual: item.hargaJual || 0,
            unitConversions: item.unitConversions ? item.unitConversions.map(u => ({
                id: u.id,
                unit: u.unit,
                value: u.value,
                basePrice: u.basePrice || 0,
                sellPrice: u.sellPrice || 0
            })) : []
        }));
        const dataStr = JSON.stringify(items, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `harga-produk-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showNotification('Data harga berhasil diekspor', 'success');
    } catch (error) {
        showNotification('Gagal ekspor: ' + error.message, 'error');
    }
}

async function importPrices() {
    if (!currentUser || !currentUser.permissions || !currentUser.permissions.includes('menu-sistem')) {
        showNotification('Anda tidak memiliki akses', 'error');
        return;
    }
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) { resolve(false); return; }
            showLoading('Mengimpor harga...');
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const imported = JSON.parse(event.target.result);
                    if (!Array.isArray(imported)) {
                        throw new Error('File tidak valid: bukan array');
                    }
                    let updatedCount = 0;
                    for (const imp of imported) {
                        // Cari item berdasarkan id, jika tidak ada cari berdasarkan code
                        let item = null;
                        if (imp.id) {
                            item = kasirItems.find(i => i.id == imp.id);
                        }
                        if (!item && imp.code) {
                            item = kasirItems.find(i => i.code === imp.code);
                        }
                        if (item) {
                            // Update harga dasar dan jual
                            if (imp.hargaDasar !== undefined) item.hargaDasar = imp.hargaDasar;
                            if (imp.hargaJual !== undefined) item.hargaJual = imp.hargaJual;

                            // Update konversi satuan jika ada
                            if (imp.unitConversions && Array.isArray(imp.unitConversions) && item.unitConversions) {
                                for (const impUnit of imp.unitConversions) {
                                    const targetUnit = item.unitConversions.find(u => u.id == impUnit.id);
                                    if (targetUnit) {
                                        if (impUnit.basePrice !== undefined) targetUnit.basePrice = impUnit.basePrice;
                                        if (impUnit.sellPrice !== undefined) targetUnit.sellPrice = impUnit.sellPrice;
                                    }
                                }
                            }
                            item.updatedAt = new Date().toISOString();
                            await dbPut(STORES.KASIR_ITEMS, item);
                            updatedCount++;
                        }
                    }
                    await loadKasirItems();
                    if (document.getElementById('transaksi-page').style.display === 'block') {
                        renderProductList();
                    }
                    showNotification(`Harga diupdate untuk ${updatedCount} item`, 'success');
                    resolve(true);
                } catch (error) {
                    showNotification('Gagal import: ' + error.message, 'error');
                    resolve(false);
                } finally {
                    hideLoading();
                }
            };
            reader.onerror = () => {
                showNotification('Gagal membaca file', 'error');
                hideLoading();
                resolve(false);
            };
            reader.readAsText(file);
        };
        input.click();
    });
}

// Expose ke global
window.exportPrices = exportPrices;
window.importPrices = importPrices;
// ==================== AKHIR TAMBAHAN ====================

function showSettingsModal() {
    if (!currentUser || !currentUser.permissions || !currentUser.permissions.includes('menu-master')) {
        showNotification('Anda tidak memiliki akses ke pengaturan', 'error');
        return;
    }
    const settingsContent = document.getElementById('settings-content');
    settingsContent.innerHTML = `
        <div style="margin-bottom:20px;">
            <div style="color:#333333;margin-bottom:10px;font-weight:600;font-size:1rem;display:flex;align-items:center;gap:8px;">
                <svg class="icon icon-sm" viewBox="0 0 24 24" style="color:#006B54;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Manajemen Data
            </div>
            <button style="width:100%;padding:12px;border:none;border-radius:15px;background:#006B54;color:white;font-weight:600;margin-bottom:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid #006B54;" onclick="exportData()">${icons.upload} Export Data</button>
            <button style="width:100%;padding:12px;border:none;border-radius:15px;background:#006B54;color:white;font-weight:600;margin-bottom:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid #006B54;" onclick="importData()">${icons.download} Import Data</button>
            <button style="width:100%;padding:12px;border:none;border-radius:15px;background:#ff6b6b;color:white;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid #ff6b6b;" onclick="clearAllData()">${icons.delete} Hapus Semua Data</button>
            <button style="width:100%;padding:12px;border:none;border-radius:15px;background:#dc3545;color:white;font-weight:600;margin-top:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid #dc3545;" onclick="forceResetDatabase()"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg> Force Reset Database</button>
        </div>

        <div style="margin-bottom:20px; border-top:1px solid #ddd; padding-top:20px;">
            <div style="color:#333333;margin-bottom:15px;font-weight:600;font-size:1rem;display:flex;align-items:center;gap:8px;">
                <svg class="icon icon-sm" viewBox="0 0 24 24" style="color:#006B54;"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> Konfigurasi Barcode Timbangan
            </div>
            <div style="margin-bottom:10px;">
                <label style="display:block; margin-bottom:5px;">Panjang Digit Flex</label>
                <input type="number" id="barcode-flex-length" class="form-input" value="${barcodeConfig.flexLength}" min="1" max="5">
            </div>
            <div style="margin-bottom:10px;">
                <label style="display:block; margin-bottom:5px;">Nilai Flex (misal 11)</label>
                <input type="text" id="barcode-flex-value" class="form-input" value="${barcodeConfig.flexValue}" maxlength="5">
            </div>
            <div style="margin-bottom:10px;">
                <label style="display:block; margin-bottom:5px;">Panjang Digit Kode Item</label>
                <input type="number" id="barcode-product-length" class="form-input" value="${barcodeConfig.productLength}" min="1" max="10">
            </div>
            <div style="margin-bottom:15px;">
                <label style="display:block; margin-bottom:5px;">Panjang Digit Berat</label>
                <input type="number" id="barcode-weight-length" class="form-input" value="${barcodeConfig.weightLength}" min="1" max="10">
            </div>
            <div style="color:#666; font-size:0.85rem; margin-bottom:10px;">Total panjang harus 13 digit. Saat ini: <span id="total-digits-display">${barcodeConfig.flexLength + barcodeConfig.productLength + barcodeConfig.weightLength}</span></div>
            <button class="form-button-primary" style="width:100%;" onclick="saveBarcodeConfigFromUI()">Simpan Konfigurasi Barcode</button>
        </div>

        <div style="margin-bottom:20px; border-top:1px solid #ddd; padding-top:20px;">
            <div style="color:#333333;margin-bottom:15px;font-weight:600;font-size:1rem;display:flex;align-items:center;gap:8px;">
                <svg class="icon icon-sm" viewBox="0 0 24 24" style="color:#006B54;"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3h12v6"/><rect x="6" y="15" width="12" height="6" rx="2"/></svg> Pengaturan Struk
            </div>
            <div style="margin-bottom:10px;">
                <label style="display:block; margin-bottom:5px;">Lebar Kertas (jumlah karakter)</label>
                <input type="number" id="receipt-paper-width" class="form-input" value="${receiptConfig.paperWidth}" min="20" max="80">
            </div>
            <div style="margin-bottom:10px;">
                <label style="display:block; margin-bottom:5px;">Header (pisahkan baris dengan \\n)</label>
                <textarea id="receipt-header" class="form-input" rows="3">${receiptConfig.header.replace(/\n/g, '\\n')}</textarea>
                <small style="color:#666;">Gunakan \\n untuk baris baru</small>
            </div>
            <div style="margin-bottom:10px;">
                <label style="display:block; margin-bottom:5px;">Footer (pisahkan baris dengan \\n)</label>
                <textarea id="receipt-footer" class="form-input" rows="3">${receiptConfig.footer.replace(/\n/g, '\\n')}</textarea>
                <small style="color:#666;">Gunakan \\n untuk baris baru</small>
            </div>
            <div style="margin-bottom:10px;">
                <label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="receipt-show-datetime" ${receiptConfig.showDateTime ? 'checked' : ''}> Tampilkan Tanggal & Waktu
                </label>
            </div>
            <div style="margin-bottom:10px;">
                <label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="receipt-show-transnum" ${receiptConfig.showTransactionNumber ? 'checked' : ''}> Tampilkan Nomor Transaksi
                </label>
            </div>
            <div style="margin-bottom:10px;">
                <label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="receipt-show-cashier" ${receiptConfig.showCashier ? 'checked' : ''}> Tampilkan Nama Kasir
                </label>
            </div>
            <button class="form-button-primary" style="width:100%;" onclick="saveReceiptConfig()">Simpan Pengaturan Struk</button>
        </div>

        <div style="margin-bottom:20px; border-top:1px solid #ddd; padding-top:20px;">
            <div style="color:#333;margin-bottom:15px;font-weight:600;display:flex;align-items:center;gap:8px;">
                <svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/></svg> Manajemen Pengguna
            </div>
            <div id="user-list-container" style="max-height:200px; overflow-y:auto; margin-bottom:10px;"></div>
            <button class="form-button-primary" style="width:100%;" onclick="openAddUserModal()">Tambah Pengguna</button>
        </div>

        <div style="margin-top:20px;">
            <button class="form-button-primary" style="width:100%;" onclick="window.location.href='admin-panel.html'">
                <svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/></svg>
                Admin Panel
            </button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px; margin-top:20px;">
            <button class="form-button-secondary" onclick="closeSettingsModal()"><svg class="icon icon-sm" viewBox="0 0 24 24" style="color:#333333;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> TUTUP</button>
        </div>
    `;

    const flexLen = document.getElementById('barcode-flex-length');
    const prodLen = document.getElementById('barcode-product-length');
    const weightLen = document.getElementById('barcode-weight-length');
    const totalSpan = document.getElementById('total-digits-display');
    function updateTotal() {
        const total = (parseInt(flexLen.value) || 0) + (parseInt(prodLen.value) || 0) + (parseInt(weightLen.value) || 0);
        totalSpan.textContent = total;
        totalSpan.style.color = total === 13 ? 'green' : 'red';
    }
    flexLen.addEventListener('input', updateTotal);
    prodLen.addEventListener('input', updateTotal);
    weightLen.addEventListener('input', updateTotal);
    
    renderUserListSettings();
    document.getElementById('settings-modal').style.display = 'flex';
    closeDrawer();
}

function renderUserListSettings() {
    const container = document.getElementById('user-list-container');
    if (!container) return;
    if (!users || users.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:10px; color:#666;">Belum ada pengguna.</div>';
        return;
    }
    let html = '';
    users.forEach(user => {
        const roleName = roles.find(r => r.id === user.roleId)?.name || 'Tanpa Role';
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #eee;">
                <div>
                    <strong>${user.name}</strong> (${user.username})<br>
                    <span style="font-size:0.8rem;">Role: ${roleName}</span>
                </div>
                <div>
                    <button class="action-btn edit-btn" style="padding:4px 8px; min-height:30px;" onclick="openEditUserModal(${user.id})">${icons.edit}</button>
                    ${user.roleId ? `<button class="action-btn delete-btn" style="padding:4px 8px; min-height:30px;" onclick="deleteUser(${user.id})">${icons.delete}</button>` : ''}
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function renderUserList() {
    renderUserListSettings();
}

let editingUserId = null;

function openAddUserModal() {
    editingUserId = null;
    document.getElementById('user-modal-username').value = '';
    document.getElementById('user-modal-password').value = '';
    document.getElementById('user-modal-confirm-password').value = '';
    document.getElementById('user-modal-name').value = '';
    const roleSelect = document.getElementById('user-modal-role');
    roleSelect.innerHTML = '<option value="">-- Pilih Role --</option>';
    roles.forEach(role => {
        roleSelect.innerHTML += `<option value="${role.id}">${role.name}</option>`;
    });
    document.getElementById('user-modal-title').innerHTML = `
        <svg class="icon icon-primary" viewBox="0 0 24 24" width="24" height="24">
            <circle cx="12" cy="8" r="4"/>
            <path d="M5 20v-2a7 7 0 0 1 14 0v2"/>
        </svg> Tambah Pengguna
    `;
    document.getElementById('user-modal').style.display = 'flex';
}

function openEditUserModal(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    editingUserId = userId;
    document.getElementById('user-modal-username').value = user.username;
    document.getElementById('user-modal-password').value = '';
    document.getElementById('user-modal-confirm-password').value = '';
    document.getElementById('user-modal-name').value = user.name;
    const roleSelect = document.getElementById('user-modal-role');
    roleSelect.innerHTML = '<option value="">-- Pilih Role --</option>';
    roles.forEach(role => {
        roleSelect.innerHTML += `<option value="${role.id}" ${user.roleId === role.id ? 'selected' : ''}>${role.name}</option>`;
    });
    document.getElementById('user-modal-title').innerHTML = `
        <svg class="icon icon-primary" viewBox="0 0 24 24" width="24" height="24">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg> Edit Pengguna
    `;
    document.getElementById('user-modal').style.display = 'flex';
}

function closeUserModal() {
    document.getElementById('user-modal').style.display = 'none';
    editingUserId = null;
}

// ==================== FUNGSI TOGGLE PASSWORD ====================
function togglePasswordVisibility(inputId, toggleElement) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);

    const svg = toggleElement.querySelector('svg');
    if (type === 'text') {
        svg.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
    } else {
        svg.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
    }
}

async function saveUser() {
    const username = document.getElementById('user-modal-username').value.trim();
    const password = document.getElementById('user-modal-password').value.trim();
    const confirmPassword = document.getElementById('user-modal-confirm-password').value.trim();
    const name = document.getElementById('user-modal-name').value.trim();
    const roleId = parseInt(document.getElementById('user-modal-role').value);

    if (!username || !name || !roleId) {
        showNotification('Username, Nama, dan Role harus diisi', 'error');
        return;
    }

    if (!editingUserId && !password) {
        showNotification('Password harus diisi untuk pengguna baru', 'error');
        return;
    }

    if (password !== '') {
        if (password !== confirmPassword) {
            showNotification('Password dan konfirmasi password tidak cocok', 'error');
            return;
        }
    }

    if (editingUserId) {
        const existing = users.find(u => u.username === username && u.id !== editingUserId);
        if (existing) {
            showNotification('Username sudah digunakan', 'error');
            return;
        }
    } else {
        if (users.some(u => u.username === username)) {
            showNotification('Username sudah digunakan', 'error');
            return;
        }
    }

    try {
        showLoading();
        const now = new Date().toISOString();
        if (editingUserId) {
            const user = users.find(u => u.id === editingUserId);
            if (user) {
                user.username = username;
                if (password) {
                    user.password = await hashPassword(password);
                }
                user.name = name;
                user.roleId = roleId;
                user.updatedAt = now;
                await dbPut(STORES.USERS, user);
            }
        } else {
            const hashed = await hashPassword(password);
            const newUser = {
                username,
                password: hashed,
                name,
                roleId,
                createdAt: now,
                updatedAt: now
            };
            const id = await dbAdd(STORES.USERS, newUser);
            newUser.id = id;
            users.push(newUser);
        }
        await loadUsers();
        renderUserList();
        showNotification('Pengguna berhasil disimpan', 'success');
        closeUserModal();
    } catch (error) {
        showNotification('Gagal menyimpan: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function deleteUser(userId) {
    if (!confirm('Hapus pengguna ini?')) return;
    try {
        showLoading();
        await dbDelete(STORES.USERS, userId);
        users = users.filter(u => u.id !== userId);
        renderUserList();
        showNotification('Pengguna dihapus', 'success');
    } catch (error) {
        showNotification('Gagal hapus: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function loadBarcodeConfig() {
    try {
        const transaction = db.transaction([STORES.SETTINGS], 'readonly');
        const store = transaction.objectStore(STORES.SETTINGS);
        const request = store.get('barcodeConfig');
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                if (request.result) {
                    barcodeConfig = request.result.value;
                } else {
                    barcodeConfig = { flexLength: 2, flexValue: '11', productLength: 6, weightLength: 5 };
                }
                resolve();
            };
            request.onerror = (e) => reject(e.target.error);
        });
    } catch (error) {
        console.error('Error loading barcode config:', error);
        barcodeConfig = { flexLength: 2, flexValue: '11', productLength: 6, weightLength: 5};
    }
}

async function saveBarcodeConfig(config) {
    try {
        const transaction = db.transaction([STORES.SETTINGS], 'readwrite');
        const store = transaction.objectStore(STORES.SETTINGS);
        const data = { key: 'barcodeConfig', value: config };
        const request = store.put(data);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                barcodeConfig = config;
                resolve();
            };
            request.onerror = (e) => reject(e.target.error);
        });
    } catch (error) {
        console.error('Error saving barcode config:', error);
        throw error;
    }
}

async function saveBarcodeConfigFromUI() {
    const flexLength = parseInt(document.getElementById('barcode-flex-length').value);
    const flexValue = document.getElementById('barcode-flex-value').value.trim();
    const productLength = parseInt(document.getElementById('barcode-product-length').value);
    const weightLength = parseInt(document.getElementById('barcode-weight-length').value);

    if (isNaN(flexLength) || flexLength < 1) { showNotification('Panjang Flex harus angka positif', 'error'); return; }
    if (!flexValue) { showNotification('Nilai Flex harus diisi', 'error'); return; }
    if (isNaN(productLength) || productLength < 1) { showNotification('Panjang Kode Item harus angka positif', 'error'); return; }
    if (isNaN(weightLength) || weightLength < 1) { showNotification('Panjang Berat harus angka positif', 'error'); return; }

    const total = flexLength + productLength + weightLength;
    if (total !== 13) {
        showNotification(`Total panjang harus 13 digit, saat ini ${total}`, 'error');
        return;
    }

    const newConfig = { flexLength, flexValue, productLength, weightLength };
    try {
        showLoading();
        await saveBarcodeConfig(newConfig);
        showNotification('Konfigurasi barcode tersimpan', 'success');
        closeSettingsModal();
    } catch (error) {
        showNotification('Gagal menyimpan: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function closeSettingsModal() {
    document.getElementById('settings-modal').style.display = 'none';
}

// ==================== LOCALSTORAGE CART ====================
const CART_STORAGE_KEY = 'pos_cart';
const CUSTOMER_STORAGE_KEY = 'pos_selected_customer';

function saveCartToLocalStorage() {
    try {
        const cartData = cart.map(c => ({
            itemId: c.item.id,
            qty: c.qty,
            unitConversion: c.unitConversion ? { 
                unit: c.unitConversion.unit, 
                value: c.unitConversion.value,
                barcode: c.unitConversion.barcode,
                sellPrice: c.unitConversion.sellPrice 
            } : null,
            weightGram: c.weightGram || 0,
            pricePerUnit: c.pricePerUnit,
            subtotal: c.subtotal,
            isOutstanding: c.isOutstanding || false,
            customerId: c.customerId,
            isBundle: c.isBundle || false,
            bundleId: c.bundleId,
            components: c.components,
            // Data baru untuk inventory
            warehouseId: c.warehouseId || selectedWarehouseId,
            batchId: c.batchId || null,
            serialId: c.serialId || null
        }));
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartData));
        
        if (selectedCustomer) {
            localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify({
                id: selectedCustomer.id,
                name: selectedCustomer.name
            }));
        } else {
            localStorage.removeItem(CUSTOMER_STORAGE_KEY);
        }
    } catch (e) {
        console.error('Gagal menyimpan cart ke localStorage:', e);
    }
}

async function loadCartFromLocalStorage() {
    try {
        const customerData = localStorage.getItem(CUSTOMER_STORAGE_KEY);
        if (customerData) {
            const { id } = JSON.parse(customerData);
            const customer = customers.find(c => c.id === id);
            if (customer) {
                selectedCustomer = customer;
                const badge = document.getElementById('customer-badge');
                if (badge) {
                    badge.textContent = customer.name.charAt(0).toUpperCase();
                    badge.style.display = 'flex';
                }
            } else {
                localStorage.removeItem(CUSTOMER_STORAGE_KEY);
            }
        }

        const cartData = localStorage.getItem(CART_STORAGE_KEY);
        if (!cartData) return;

        const parsed = JSON.parse(cartData);
        if (!Array.isArray(parsed)) return;

        const newCart = [];
        for (let c of parsed) {
            if (c.isOutstanding) {
                const cust = customers.find(cust => cust.id === c.customerId);
                if (cust) {
                    const item = {
                        id: 'outstanding-' + cust.id,
                        name: 'Piutang ' + cust.name,
                        stock: Infinity
                    };
                    newCart.push({
                        item: item,
                        qty: c.qty,
                        unitConversion: null,
                        weightGram: 0,
                        pricePerUnit: c.pricePerUnit,
                        subtotal: c.subtotal,
                        isOutstanding: true,
                        customerId: cust.id,
                        warehouseId: c.warehouseId,
                        batchId: null,
                        serialId: null
                    });
                } else {
                    console.warn('Customer tidak ditemukan untuk item piutang');
                }
                continue;
            }

            if (c.isBundle) {
                const bundle = bundles.find(b => b.id == c.bundleId);
                if (!bundle) {
                    console.warn('Bundle tidak ditemukan, lewati');
                    continue;
                }
                const item = {
                    id: 'bundle-' + bundle.id,
                    name: bundle.name,
                    stock: Infinity
                };
                newCart.push({
                    item,
                    qty: c.qty,
                    unitConversion: null,
                    weightGram: 0,
                    pricePerUnit: c.pricePerUnit,
                    subtotal: c.subtotal,
                    isBundle: true,
                    bundleId: bundle.id,
                    components: c.components || bundle.components,
                    warehouseId: c.warehouseId,
                    batchId: null,
                    serialId: null
                });
                continue;
            }

            const item = kasirItems.find(i => i.id === c.itemId);
            if (!item) continue;

            let pricePerUnit;
            if (c.unitConversion) {
                const conv = item.unitConversions?.find(u => u.barcode === c.unitConversion.barcode);
                if (conv) {
                    pricePerUnit = conv.sellPrice;
                    c.unitConversion = conv;
                } else {
                    pricePerUnit = getPriceForQty(item, c.qty);
                    c.unitConversion = null;
                }
            } else {
                pricePerUnit = getPriceForQty(item, c.qty);
            }

            newCart.push({
                item,
                qty: c.qty,
                unitConversion: c.unitConversion || null,
                weightGram: c.weightGram || 0,
                pricePerUnit,
                subtotal: c.qty * pricePerUnit,
                warehouseId: c.warehouseId,
                batchId: c.batchId || null,
                serialId: c.serialId || null
            });
        }

        cart = newCart;
        renderCartPage();
        if (document.getElementById('transaksi-page').style.display === 'block') {
            renderProductList();
        }
    } catch (e) {
        console.error('Gagal memuat cart dari localStorage:', e);
        localStorage.removeItem(CART_STORAGE_KEY);
        localStorage.removeItem(CUSTOMER_STORAGE_KEY);
    }
}

// ==================== FUNGSI LOAD DATA ====================
async function loadKasirCategories() {
    try { kasirCategories = await dbGetAll(STORES.KASIR_CATEGORIES); kasirCategories.sort((a,b) => a.name.localeCompare(b.name)); } catch (error) { console.error('Error loading kasir categories:', error); kasirCategories = []; }
}

async function loadKasirItems() {
    try { 
        kasirItems = await dbGetAll(STORES.KASIR_ITEMS); 
        kasirItems.forEach(item => { 
            if (item.stock === undefined) item.stock = 0;
            if (item.minStock === undefined) item.minStock = 5;
        });
        kasirItems.sort((a,b) => a.name.localeCompare(b.name)); 
    } catch (error) { console.error('Error loading kasir items:', error); kasirItems = []; }
}

async function loadKasirSatuan() {
    try { kasirSatuan = await dbGetAll(STORES.KASIR_SATUAN); kasirSatuan.sort((a,b) => a.name.localeCompare(b.name)); } catch (error) { console.error('Error loading satuan:', error); kasirSatuan = []; }
}

async function loadCustomers() {
    try { 
        customers = await dbGetAll(STORES.CUSTOMERS); 
        customers.forEach(c => { if (c.outstanding === undefined) c.outstanding = 0; });
        customers.sort((a,b) => a.name.localeCompare(b.name)); 
    } catch (error) { console.error('Error loading customers:', error); customers = []; }
}

async function loadSuppliers() {
    try { suppliers = await dbGetAll(STORES.SUPPLIERS); suppliers.sort((a,b) => a.name.localeCompare(b.name)); } catch (error) { console.error('Error loading suppliers:', error); suppliers = []; }
}

async function loadPendingTransactions() {
    try { 
        pendingTransactions = await dbGetAll(STORES.PENDING_TRANSACTIONS); 
        updatePendingBadge();
    } catch (error) { 
        console.error('Error loading pending transactions:', error); 
        pendingTransactions = []; 
        updatePendingBadge();
    }
}

// ==================== FUNGSI BUNDLE ====================
async function loadBundles() {
    try {
        bundles = await dbGetAll(STORES.BUNDLES);
        bundles.sort((a,b) => a.name.localeCompare(b.name));
        return bundles;
    } catch (error) {
        console.error('Error loading bundles:', error);
        bundles = [];
        return bundles;
    }
}

async function saveBundle(bundleData, id = null) {
    const now = new Date().toISOString();
    if (id) {
        const bundle = await dbGet(STORES.BUNDLES, id);
        if (bundle) {
            Object.assign(bundle, bundleData);
            bundle.updatedAt = now;
            await dbPut(STORES.BUNDLES, bundle);
        }
    } else {
        const newBundle = { ...bundleData, createdAt: now, updatedAt: now };
        await dbAdd(STORES.BUNDLES, newBundle);
    }
    await loadBundles();
}

async function deleteBundle(id) {
    await dbDelete(STORES.BUNDLES, id);
    await loadBundles();
}

// ==================== FUNGSI UI BUNDLE ====================
async function openBundleModal() {
    console.log('openBundleModal dipanggil');
    const modal = document.getElementById('bundle-modal');
    if (!modal) {
        console.error('Modal bundle tidak ditemukan');
        return;
    }
    try {
        await loadAndRenderBundles();
        modal.style.display = 'flex';
        closeDrawer();
    } catch (error) {
        console.error('Gagal membuka modal bundle:', error);
        const container = document.getElementById('bundle-list-container');
        if (container) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:red;">Gagal memuat data bundle: ' + error.message + '</div>';
        }
        modal.style.display = 'flex';
    }
}

function closeBundleModal() {
    document.getElementById('bundle-modal').style.display = 'none';
}

async function loadAndRenderBundles() {
    const container = document.getElementById('bundle-list-container');
    if (!container) return;
    try {
        await loadBundles();
        const now = new Date().toISOString();
        const activeBundles = bundles.filter(b => 
            b.active && 
            (!b.startDate || b.startDate <= now) && 
            (!b.endDate || b.endDate >= now)
        );

        if (activeBundles.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px;">Tidak ada bundle aktif. <br><button class="form-button-primary" onclick="window.location.href=\'master-data.html\'">Buat Bundle</button></div>';
            return;
        }

        let html = '';
        for (let bundle of activeBundles) {
            let available = false;
            try {
                available = checkBundleStock(bundle, 1, selectedWarehouseId);
            } catch (e) {
                console.error('Error checking stock for bundle', bundle.id, e);
                available = false;
            }
            const statusText = available ? 'Tersedia' : 'Stok Kurang';
            html += `
                <div class="bundle-item" style="border:1px solid #ddd; border-radius:15px; padding:15px; margin-bottom:10px; ${available ? '' : 'opacity:0.5;'}">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <h3 style="margin:0; color:#006B54;">${bundle.name}</h3>
                            <p style="margin:5px 0;">${bundle.description || ''}</p>
                            <p style="margin:5px 0;">Harga: ${formatRupiah(bundle.price)}</p>
                            <p style="margin:5px 0;">Status: <span style="color:${available ? 'green' : 'red'}">${statusText}</span></p>
                        </div>
                        <button class="form-button-primary select-bundle-btn" data-bundle-id="${bundle.id}" ${!available ? 'disabled' : ''}>Pilih</button>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;

        if (container._bundleClickListener) {
            container.removeEventListener('click', container._bundleClickListener);
        }
        container._bundleClickListener = function(e) {
            const btn = e.target.closest('button.select-bundle-btn');
            if (btn && !btn.disabled) {
                e.stopPropagation();
                const bundleId = btn.getAttribute('data-bundle-id');
                addBundleToCart(bundleId);
            }
        };
        container.addEventListener('click', container._bundleClickListener);
    } catch (error) {
        console.error('Error di loadAndRenderBundles:', error);
        container.innerHTML = '<div style="text-align:center; padding:20px; color:red;">Gagal memuat bundle: ' + error.message + '</div>';
    }
}

async function addBundleToCart(bundleId) {
    console.log('addBundleToCart dipanggil dengan bundleId:', bundleId, 'tipe:', typeof bundleId);
    
    if (!bundleId) {
        showNotification('ID Bundle tidak valid', 'error');
        return;
    }
    
    await loadBundles(); // muat ulang data terbaru
    const bundle = bundles.find(b => b.id == bundleId);
    console.log('Bundle ditemukan:', bundle);
    
    if (!bundle) {
        showNotification('Bundle tidak ditemukan', 'error');
        return;
    }
    
    // Cek apakah bundle sudah ada di keranjang
    const existingBundleInCart = cart.find(c => c.isBundle && c.bundleId == bundleId);
    if (existingBundleInCart) {
        showNotification('Bundle ini sudah ada di keranjang', 'warning');
        return;
    }
    
    const qtyBundle = 1;
    if (!checkBundleStock(bundle, qtyBundle, selectedWarehouseId)) {
        showNotification('Stok komponen bundle tidak cukup', 'error');
        return;
    }
    
    if (typeof bundle.price !== 'number' || bundle.price <= 0) {
        console.error('Harga bundle tidak valid:', bundle.price);
        showNotification('Harga bundle tidak valid', 'error');
        return;
    }
    
    const bundleCartItem = {
        item: {
            id: 'bundle-' + bundle.id,
            name: bundle.name,
            stock: Infinity
        },
        qty: qtyBundle,
        pricePerUnit: bundle.price,
        subtotal: bundle.price * qtyBundle,
        isBundle: true,
        bundleId: bundle.id,
        components: bundle.components,
        warehouseId: selectedWarehouseId,
        batchId: null,
        serialId: null
    };
    
    cart.push(bundleCartItem);
    renderCartPage();
    saveCartToLocalStorage();
    closeBundleModal();
    showNotification(`Bundle "${bundle.name}" ditambahkan`, 'success');
    playSuccessSound();
}

// ==================== FUNGSI TRANSAKSI KASIR ====================
function openTransaksiPage() {
    document.querySelector('.main-content').style.display = 'none';
    document.getElementById('transaksi-page').style.display = 'block';
    document.getElementById('cart-page').style.display = 'none';
    document.getElementById('payment-page').style.display = 'none';
    
    // Tampilkan dropdown pemilihan gudang jika belum ada
    ensureWarehouseSelector();
    
    currentFilteredItems = [...kasirItems];
    renderProductList(currentFilteredItems);
    document.getElementById('barcode-input').value = '';
    
    renderCartPage();
    updatePiutangButtonCart();
    setTimeout(() => document.getElementById('barcode-input').focus(), 100);
    closeDrawer();
}

function closeTransaksiPage() {
    document.getElementById('transaksi-page').style.display = 'none';
    document.querySelector('.main-content').style.display = 'block';
}

// Fungsi untuk memastikan ada dropdown gudang di halaman transaksi
function ensureWarehouseSelector() {
    const header = document.querySelector('.transaksi-header-right');
    if (!header) return;
    // Cek apakah sudah ada
    if (document.getElementById('warehouse-select')) return;
    const select = document.createElement('select');
    select.id = 'warehouse-select';
    select.className = 'form-input';
    select.style.width = '150px';
    select.style.marginRight = '10px';
    select.onchange = (e) => {
        selectedWarehouseId = parseInt(e.target.value);
        // Refresh daftar produk (stok akan disesuaikan dengan gudang)
        renderProductList();
    };
    // Isi opsi gudang
    warehouses.forEach(w => {
        const option = document.createElement('option');
        option.value = w.id;
        option.textContent = w.name;
        if (w.id === selectedWarehouseId) option.selected = true;
        select.appendChild(option);
    });
    // Masukkan di sebelah tombol customer
    const customerBtn = document.getElementById('customer-select-btn');
    if (customerBtn) {
        header.insertBefore(select, customerBtn);
    } else {
        header.prepend(select);
    }
}

function getPriceForQty(item, qty) {
    if (!item.priceLevels || item.priceLevels.length === 0) {
        return item.hargaJual;
    }
    const sorted = [...item.priceLevels].sort((a, b) => b.minQty - a.minQty);
    for (let level of sorted) {
        if (qty >= level.minQty) {
            return level.price;
        }
    }
    return item.hargaJual;
}

// Fungsi untuk mendapatkan stok item di gudang tertentu
function getItemStock(itemId, warehouseId = selectedWarehouseId) {
    if (!warehouseId) return 0;
    const stock = itemStocks.find(s => s.itemId === itemId && s.warehouseId === warehouseId);
    return stock ? stock.quantity : 0;
}

// Fungsi untuk mendapatkan batch yang tersedia (FIFO) untuk item di gudang tertentu
function getAvailableBatches(itemId, warehouseId = selectedWarehouseId) {
    return itemBatches.filter(b => 
        b.itemId === itemId && 
        b.warehouseId === warehouseId && 
        b.quantity > 0
    ).sort((a, b) => new Date(a.expiryDate || '2099-12-31') - new Date(b.expiryDate || '2099-12-31'));
}

// Fungsi untuk mengurangi stok dari batch secara FIFO
async function reduceStockFromBatches(itemId, qtyNeeded, warehouseId = selectedWarehouseId, reference = {}) {
    let remaining = qtyNeeded;
    const batches = getAvailableBatches(itemId, warehouseId);
    const usedBatches = [];
    for (let batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, batch.quantity);
        batch.quantity -= take;
        batch.updatedAt = new Date().toISOString();
        await dbPut(STORES.ITEM_BATCHES, batch);
        usedBatches.push({ batchId: batch.id, qty: take });
        remaining -= take;
    }
    if (remaining > 0) {
        throw new Error(`Stok tidak cukup untuk item ${itemId} di gudang ${warehouseId}`);
    }
    // Update item_stocks
    const stock = itemStocks.find(s => s.itemId === itemId && s.warehouseId === warehouseId);
    if (stock) {
        stock.quantity -= qtyNeeded;
        stock.updatedAt = new Date().toISOString();
        await dbPut(STORES.ITEM_STOCKS, stock);
    }
    // Catat stock movement untuk setiap batch
    for (let ub of usedBatches) {
        await dbAdd(STORES.STOCK_MOVEMENTS, {
            movementType: 'sale',
            itemId: itemId,
            warehouseId: warehouseId,
            quantity: -ub.qty,
            referenceId: reference.id,
            referenceType: reference.type,
            batchId: ub.batchId,
            unitCost: 0, // nanti diisi
            createdAt: new Date().toISOString(),
            createdBy: currentUser ? currentUser.name : 'Admin',
            notes: reference.notes || ''
        });
    }
    return usedBatches;
}

function addToCart(item, qty, unitConversion, weightGram, selectedBatch = null, selectedSerial = null) {
    let requiredStock;
    if (weightGram > 0) {
        requiredStock = qty;
    } else if (unitConversion) {
        requiredStock = qty * unitConversion.value;
    } else {
        requiredStock = qty;
    }
    
    const currentStock = getItemStock(item.id, selectedWarehouseId);
    if (currentStock < requiredStock) {
        showNotification(`Stok ${item.name} tidak cukup di gudang terpilih. Tersedia: ${currentStock}`, 'error');
        return;
    }
    
    // Jika item dilacak batch dan tidak dipilih batch secara eksplisit, ambil batch tertua
    let batchId = selectedBatch ? selectedBatch.id : null;
    if (!batchId && itemBatches.some(b => b.itemId === item.id && b.warehouseId === selectedWarehouseId)) {
        const batches = getAvailableBatches(item.id, selectedWarehouseId);
        if (batches.length > 0) {
            batchId = batches[0].id;
        } else {
            showNotification('Tidak ada batch tersedia untuk item ini', 'error');
            return;
        }
    }
    
    let pricePerUnit;
    if (unitConversion) {
        pricePerUnit = unitConversion.sellPrice;
    } else if (weightGram > 0) {
        pricePerUnit = getPriceForQty(item, qty);
    } else {
        pricePerUnit = getPriceForQty(item, qty);
    }

    const existingIndex = cart.findIndex(c => 
        c.item.id === item.id && 
        c.unitConversion?.barcode === unitConversion?.barcode &&
        c.weightGram === weightGram &&
        c.batchId === batchId &&
        c.serialId === selectedSerial?.id
    );

    if (existingIndex >= 0) {
        const existing = cart[existingIndex];
        const newQty = existing.qty + qty;

        let newPricePerUnit;
        if (unitConversion) {
            newPricePerUnit = unitConversion.sellPrice;
        } else if (weightGram > 0) {
            newPricePerUnit = getPriceForQty(item, newQty);
        } else {
            newPricePerUnit = getPriceForQty(item, newQty);
        }

        existing.qty = newQty;
        existing.pricePerUnit = newPricePerUnit;
        existing.subtotal = newQty * newPricePerUnit;
    } else {
        cart.push({
            item,
            qty,
            unitConversion,
            weightGram,
            pricePerUnit,
            subtotal: qty * pricePerUnit,
            warehouseId: selectedWarehouseId,
            batchId,
            serialId: selectedSerial ? selectedSerial.id : null
        });
    }
    renderCartPage();
    saveCartToLocalStorage();
}

function processBarcode() {
    const input = document.getElementById('barcode-input');
    const barcode = input.value.trim();
    if (!barcode) return;

    console.log('Processing barcode:', barcode);
    const barcodeLower = barcode.toLowerCase();

    // Cari item berdasarkan kode atau barcode (case insensitive)
    let item = kasirItems.find(i => 
        (i.code && i.code.toLowerCase() === barcodeLower) || 
        (i.barcode && i.barcode.toLowerCase() === barcodeLower)
    );

    if (item) {
        // Jika item memiliki batch, tampilkan modal pilih batch
        const batches = getAvailableBatches(item.id, selectedWarehouseId);
        if (batches.length > 0) {
            showBatchSelectionModal(item, batches);
        } else {
            addToCart(item, 1, null, 0);
        }
        input.value = '';
        filterProductList('');
        return;
    }

    // Cari di konversi satuan (unitConversions)
    for (let it of kasirItems) {
        if (it.unitConversions && Array.isArray(it.unitConversions)) {
            const conv = it.unitConversions.find(c => 
                c.barcode && c.barcode.toLowerCase() === barcodeLower
            );
            if (conv) {
                const batches = getAvailableBatches(it.id, selectedWarehouseId);
                if (batches.length > 0) {
                    showBatchSelectionModal(it, batches, conv);
                } else {
                    addToCart(it, 1, conv, 0);
                }
                input.value = '';
                filterProductList('');
                return;
            }
        }
    }

    // Jika barcode 13 digit (format timbangan), parsing seperti biasa
    if (barcode.length === 13) {
        const flex = barcode.substr(0, barcodeConfig.flexLength);
        if (flex !== barcodeConfig.flexValue) {
            showNotification('Barcode tidak dikenal (flex tidak cocok)', 'error');
            input.value = '';
            filterProductList('');
            return;
        }

        const productCode = barcode.substr(barcodeConfig.flexLength, barcodeConfig.productLength);
        const weightStr = barcode.substr(barcodeConfig.flexLength + barcodeConfig.productLength, barcodeConfig.weightLength);
        const weightGram = parseInt(weightStr, 10);

        if (!isNaN(weightGram) && weightGram > 0) {
            item = kasirItems.find(i => i.code === productCode && i.isWeighable === true);
            if (item) {
                const qtyKg = weightGram / 1000;
                const batches = getAvailableBatches(item.id, selectedWarehouseId);
                if (batches.length > 0) {
                    showBatchSelectionModal(item, batches, null, weightGram);
                } else {
                    addToCart(item, qtyKg, null, weightGram);
                }
                input.value = '';
                filterProductList('');
                return;
            } else {
                showNotification('Produk dengan kode ' + productCode + ' tidak ditemukan atau bukan produk timbangan', 'error');
                input.value = '';
                filterProductList('');
                return;
            }
        }
    }

    showNotification('Produk tidak ditemukan', 'error');
    input.value = '';
    filterProductList('');
}

// Modal untuk memilih batch
function showBatchSelectionModal(item, batches, unitConversion = null, weightGram = 0) {
    const modal = document.getElementById('select-batch-modal') || createBatchModal();
    const container = document.getElementById('batch-list-container');
    let html = `<h3>Pilih Batch untuk ${item.name}</h3>`;
    batches.forEach(batch => {
        const expiry = batch.expiryDate ? ` (Exp: ${new Date(batch.expiryDate).toLocaleDateString('id-ID')})` : '';
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
                <div>
                    <strong>${batch.batchNumber}</strong>${expiry}<br>
                    Stok: ${batch.quantity}
                </div>
                <button class="form-button-primary" onclick="selectBatchForCart(${item.id}, ${batch.id}, '${unitConversion ? JSON.stringify(unitConversion).replace(/"/g, '&quot;') : ''}', ${weightGram})">Pilih</button>
            </div>
        `;
    });
    container.innerHTML = html;
    modal.style.display = 'flex';
}

function createBatchModal() {
    const modal = document.createElement('div');
    modal.id = 'select-batch-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:500px;">
            <div class="modal-header">
                <h2>Pilih Batch</h2>
                <button class="close-btn" onclick="this.closest('.modal-overlay').style.display='none'">&times;</button>
            </div>
            <div class="modal-body" id="batch-list-container"></div>
            <div class="modal-footer">
                <button class="form-button-secondary" onclick="this.closest('.modal-overlay').style.display='none'">Batal</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

window.selectBatchForCart = function(itemId, batchId, unitConversionStr, weightGram) {
    const item = kasirItems.find(i => i.id === itemId);
    if (!item) return;
    const unitConversion = unitConversionStr ? JSON.parse(unitConversionStr) : null;
    const batch = itemBatches.find(b => b.id === batchId);
    closeBatchModal();
    addToCart(item, 1, unitConversion, weightGram, batch);
};

function closeBatchModal() {
    const modal = document.getElementById('select-batch-modal');
    if (modal) modal.style.display = 'none';
}

// ==================== FUNGSI PILIH CUSTOMER ====================
function openSelectCustomerModal() {
    const modal = document.getElementById('select-customer-modal');
    renderCustomerListForSelect();
    modal.style.display = 'flex';
    closeDrawer();
}

function closeSelectCustomerModal() {
    document.getElementById('select-customer-modal').style.display = 'none';
}

function renderCustomerListForSelect() {
    const container = document.getElementById('select-customer-list');
    if (!container) return;

    if (!customers || customers.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px;">Belum ada pelanggan. <br><button class="form-button-primary" onclick="window.location.href=\'relasi.html#customer-add\'; closeSelectCustomerModal();">Tambah Pelanggan</button></div>';
        return;
    }

    let html = '';
    customers.forEach(cust => {
        html += `
            <div class="customer-select-item" onclick="selectCustomer(${cust.id})" style="padding:15px; border-bottom:1px solid #eee; cursor:pointer; hover:background:#f5f5f5;">
                <strong>${cust.name}</strong><br>
                <span style="font-size:0.9rem;">Piutang: ${formatRupiah(cust.outstanding || 0)}</span>
            </div>
        `;
    });
    container.innerHTML = html;
}

function selectCustomer(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
        selectedCustomer = customer;
        const badge = document.getElementById('customer-badge');
        if (badge) {
            badge.textContent = customer.name.charAt(0).toUpperCase();
            badge.style.display = 'flex';
        }
        try {
            localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify({
                id: customer.id,
                name: customer.name
            }));
        } catch (e) {}
        showNotification(`Pelanggan ${customer.name} dipilih`, 'success');
        updatePiutangButtonCart();
    }
    closeSelectCustomerModal();
}

function openCartPage() {
    document.querySelector('.main-content').style.display = 'none';
    document.getElementById('transaksi-page').style.display = 'none';
    document.getElementById('cart-page').style.display = 'block';
    document.getElementById('payment-page').style.display = 'none';
    renderCartPage();
    updatePiutangButtonCart();
}

function closeCartPage() {
    document.getElementById('cart-page').style.display = 'none';
    document.getElementById('transaksi-page').style.display = 'block';
}

function renderCartPage() {
    const tbody = document.getElementById('cart-items-page');
    const totalEl = document.getElementById('cart-total-page');
    const cartCount = document.getElementById('cart-count');
    if (!tbody) return;
    tbody.innerHTML = '';
    let total = 0;
    cart.forEach((c, idx) => {
        const row = document.createElement('tr');
        let nama = c.item.name;
        if (c.isBundle) nama += ' (Bundle)';
        let satuanTeks = '';
        if (c.unitConversion) {
            const unitName = kasirSatuan.find(s => s.id == c.unitConversion.unit)?.name || '?';
            satuanTeks = `${unitName} (${c.qty})`;
        } else if (c.weightGram > 0) {
            satuanTeks = `${c.weightGram} g (${c.qty.toFixed(3)} kg)`;
        } else {
            satuanTeks = `${c.qty}`;
        }
        // Tambah info batch jika ada
        if (c.batchId) {
            const batch = itemBatches.find(b => b.id === c.batchId);
            if (batch) satuanTeks += ` Batch:${batch.batchNumber}`;
        }
        const hargaSatuan = formatRupiah(c.pricePerUnit);
        const subtotalStr = formatRupiah(c.subtotal);
        row.innerHTML = `
            <td>${nama}</td>
            <td>${satuanTeks}</td>
            <td>${hargaSatuan}</td>
            <td>${subtotalStr}</td>
            <td><button class="action-btn delete-btn" onclick="removeFromCart(${idx})">${icons.delete}</button></td>
        `;
        tbody.appendChild(row);
        total += c.subtotal;
    });
    totalEl.textContent = formatRupiah(total);
    cartCount.textContent = cart.length;
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCartPage();
    saveCartToLocalStorage();
    if (document.getElementById('payment-page').style.display === 'block') {
        const total = cart.reduce((sum, c) => sum + c.subtotal, 0);
        document.getElementById('payment-total').textContent = formatRupiah(total);
        updatePaymentSummary();
    }
}

function formatRupiah(angka) {
    return 'Rp ' + angka.toLocaleString('id-ID');
}

// ==================== FUNGSI PIUTANG ====================
function updatePiutangButtonCart() {
    const btn = document.getElementById('piutang-btn-cart');
    if (!btn) return;
    if (selectedCustomer && selectedCustomer.outstanding > 0) {
        btn.classList.add('active');
        btn.style.background = '#dc3545';
    } else {
        btn.classList.remove('active');
        btn.style.background = '#ccc';
    }
}

function addOutstandingToCart() {
    if (!selectedCustomer || selectedCustomer.outstanding <= 0) {
        showNotification('Tidak ada piutang untuk ditambahkan', 'warning');
        return;
    }
    const existing = cart.find(c => c.isOutstanding === true);
    if (existing) {
        showNotification('Piutang sudah ada di keranjang', 'info');
        return;
    }
    const outstandingItem = {
        item: {
            id: 'outstanding-' + selectedCustomer.id,
            name: 'Piutang ' + selectedCustomer.name,
            stock: Infinity
        },
        qty: 1,
        pricePerUnit: selectedCustomer.outstanding,
        subtotal: selectedCustomer.outstanding,
        isOutstanding: true,
        customerId: selectedCustomer.id,
        warehouseId: selectedWarehouseId,
        batchId: null,
        serialId: null
    };
    cart.push(outstandingItem);
    renderCartPage();
    saveCartToLocalStorage();
    updatePiutangButtonCart();
    showNotification('Piutang ditambahkan ke keranjang', 'success');
}

// ==================== FUNGSI PEMBAYARAN (REVISI) ====================
function resetPaymentPage() {
    document.getElementById('payment-cash').value = '0';
    document.getElementById('payment-card').value = '0';
    document.getElementById('payment-transfer').value = '0';
    document.getElementById('payment-ewallet').value = '0';
    document.getElementById('payment-total').textContent = 'Rp 0';
    document.getElementById('payment-grand-total').textContent = 'Rp 0';
    document.getElementById('change-amount').textContent = 'Kembalian: Rp 0';
    document.getElementById('shortage-display').style.display = 'none';
}

function setPaymentInputsDisabled(disabled) {
    const inputs = ['payment-cash', 'payment-card', 'payment-transfer', 'payment-ewallet'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = disabled;
    });
}

function openPaymentPage() {
    console.log('openPaymentPage dipanggil, cart length:', cart.length);
    if (cart.length === 0) {
        showNotification('Keranjang masih kosong', 'warning');
        return;
    }
    document.getElementById('cart-page').style.display = 'none';
    document.getElementById('payment-page').style.display = 'block';

    resetPaymentPage();

    const total = cart.reduce((sum, c) => sum + c.subtotal, 0);
    const paymentTotalEl = document.getElementById('payment-total');
    if (paymentTotalEl) paymentTotalEl.textContent = formatRupiah(total);
    updatePaymentSummary();
}

function closePaymentPage() {
    document.getElementById('payment-page').style.display = 'none';
    document.getElementById('cart-page').style.display = 'block';
    document.getElementById('confirm-piutang-modal').style.display = 'none';
    resetPaymentPage();
    setPaymentInputsDisabled(false);
    pendingPayments = [];
    pendingTotalPaid = 0;
    renderCartPage();
}

function updatePaymentSummary() {
    console.log('updatePaymentSummary dipanggil');
    const total = cart.reduce((sum, c) => sum + c.subtotal, 0);
    const cash = parseFloat(document.getElementById('payment-cash')?.value) || 0;
    const card = parseFloat(document.getElementById('payment-card')?.value) || 0;
    const transfer = parseFloat(document.getElementById('payment-transfer')?.value) || 0;
    const ewallet = parseFloat(document.getElementById('payment-ewallet')?.value) || 0;
    const paidTotal = cash + card + transfer + ewallet;

    const grandTotalEl = document.getElementById('payment-grand-total');
    if (grandTotalEl) grandTotalEl.textContent = formatRupiah(paidTotal);

    const change = paidTotal - total;
    const changeEl = document.getElementById('change-amount');
    const shortageEl = document.getElementById('shortage-display');
    const shortageAmount = document.getElementById('shortage-amount');

    if (change >= 0) {
        if (changeEl) changeEl.textContent = `Kembalian: ${formatRupiah(change)}`;
        if (changeEl) changeEl.style.color = '#006B54';
        if (shortageEl) shortageEl.style.display = 'none';
    } else {
        if (changeEl) changeEl.textContent = `Kembalian: Rp 0`;
        if (changeEl) changeEl.style.color = 'red';
        if (shortageEl) shortageEl.style.display = 'block';
        if (shortageAmount) shortageAmount.textContent = formatRupiah(total - paidTotal);
    }
}

async function processPayment(autoPrint = false) {
    console.log('processPayment dipanggil, autoPrint:', autoPrint);
    if (cart.length === 0) {
        showNotification('Keranjang kosong', 'warning');
        return;
    }

    const total = cart.reduce((sum, c) => sum + c.subtotal, 0);
    const cash = parseFloat(document.getElementById('payment-cash')?.value) || 0;
    const card = parseFloat(document.getElementById('payment-card')?.value) || 0;
    const transfer = parseFloat(document.getElementById('payment-transfer')?.value) || 0;
    const ewallet = parseFloat(document.getElementById('payment-ewallet')?.value) || 0;

    const paidTotal = cash + card + transfer + ewallet;
    const shortage = total - paidTotal;

    console.log('Total:', total, 'Dibayar:', paidTotal, 'Kurang:', shortage);

    if (shortage > 0) {
        if (!selectedCustomer) {
            showNotification('Untuk mencatat piutang, harus pilih pelanggan terlebih dahulu', 'error');
            return;
        }
        pendingPayments = [
            { method: 'cash', amount: cash },
            { method: 'card', amount: card },
            { method: 'transfer', amount: transfer },
            { method: 'ewallet', amount: ewallet }
        ].filter(p => p.amount > 0);
        pendingTotalPaid = paidTotal;

        setPaymentInputsDisabled(true);

        const shortageConfirm = document.getElementById('shortage-confirm');
        if (shortageConfirm) shortageConfirm.textContent = formatRupiah(shortage);
        document.getElementById('confirm-piutang-modal').style.display = 'flex';
        return;
    }

    await executePayment(paidTotal, 0);
    await handlePostPayment(autoPrint);
}

async function processPaymentWithPiutang(autoPrint = false) {
    console.log('processPaymentWithPiutang dipanggil, autoPrint:', autoPrint);
    
    const paid = pendingTotalPaid;
    const total = cart.reduce((sum, c) => sum + c.subtotal, 0);
    const shortage = total - paid;
    
    closeConfirmPiutangModal();
    
    await executePayment(paid, shortage);
    await handlePostPayment(autoPrint);
}

async function handlePostPayment(autoPrint) {
    if (autoPrint) {
        if (printerPort && lastTransactionData) {
            await doPrint(lastTransactionData);
        } else {
            showNotification('Printer tidak terhubung atau data tidak ada', 'warning');
        }
        openTransaksiPage();
    } else {
        if (confirm('Transaksi berhasil. Cetak struk sekarang?')) {
            if (printerPort) {
                await doPrint(lastTransactionData);
            } else {
                showNotification('Printer tidak terhubung. Anda dapat mencetak nanti.', 'warning');
            }
        }
        openTransaksiPage();
    }
}

// ==================== FUNGSI PEMBAYARAN (REVISI) ====================
async function executePayment(paidTotal, outstandingAdded) {
    console.log('executePayment dimulai, paidTotal:', paidTotal, 'outstandingAdded:', outstandingAdded);
    try {
        showLoading('Memproses pembayaran...');

        const total = cart.reduce((sum, c) => sum + c.subtotal, 0);
        let shortage = total - paidTotal;
        if (shortage < 0) shortage = 0;
        outstandingAdded = shortage;

        // 1. Kurangi stok untuk setiap item (termasuk bundle)
        for (let c of cart) {
            if (c.isOutstanding) continue;
            if (c.isBundle) {
                for (let comp of c.components) {
                    const item = kasirItems.find(i => i.id === comp.itemId);
                    if (!item) continue;
                    let needed = comp.qty * c.qty;
                    if (comp.unitConversionId) {
                        const conv = item.unitConversions?.find(u => u.id == comp.unitConversionId);
                        if (conv) needed *= conv.value;
                    }
                    // Kurangi stok menggunakan batch FIFO
                    await reduceStockFromBatches(item.id, needed, c.warehouseId, {
                        id: c.bundleId || 'bundle',
                        type: 'bundle_sale',
                        notes: `Bundle ${c.item.name}`
                    });
                }
            } else {
                let requiredStock;
                if (c.weightGram > 0) requiredStock = c.qty;
                else if (c.unitConversion) requiredStock = c.qty * c.unitConversion.value;
                else requiredStock = c.qty;
                
                if (c.batchId) {
                    // Jika sudah dipilih batch tertentu
                    const batch = itemBatches.find(b => b.id === c.batchId);
                    if (batch) {
                        if (batch.quantity < requiredStock) {
                            throw new Error(`Stok batch tidak cukup untuk ${c.item.name}`);
                        }
                        batch.quantity -= requiredStock;
                        batch.updatedAt = new Date().toISOString();
                        await dbPut(STORES.ITEM_BATCHES, batch);
                        // Update item_stocks
                        const stock = itemStocks.find(s => s.itemId === c.item.id && s.warehouseId === c.warehouseId);
                        if (stock) {
                            stock.quantity -= requiredStock;
                            stock.updatedAt = new Date().toISOString();
                            await dbPut(STORES.ITEM_STOCKS, stock);
                        }
                        // Catat movement
                        await dbAdd(STORES.STOCK_MOVEMENTS, {
                            movementType: 'sale',
                            itemId: c.item.id,
                            warehouseId: c.warehouseId,
                            quantity: -requiredStock,
                            referenceId: null, // akan diisi nanti
                            referenceType: 'sale',
                            batchId: batch.id,
                            unitCost: 0,
                            createdAt: new Date().toISOString(),
                            createdBy: currentUser ? currentUser.name : 'Admin',
                            notes: `Penjualan ${c.item.name}`
                        });
                    }
                } else {
                    // FIFO
                    await reduceStockFromBatches(c.item.id, requiredStock, c.warehouseId, {
                        id: null,
                        type: 'sale',
                        notes: `Penjualan ${c.item.name}`
                    });
                }
            }
        }

        // 2. Update piutang dari item outstanding
        for (let c of cart) {
            if (c.isOutstanding) {
                const custId = c.customerId;
                if (!custId) continue;
                const cust = customers.find(cust => cust.id === custId);
                if (!cust) continue;
                const paymentAmount = c.subtotal;
                if (cust.outstanding >= paymentAmount) {
                    cust.outstanding -= paymentAmount;
                } else {
                    cust.outstanding = 0;
                }
                cust.updatedAt = new Date().toISOString();
                await dbPut(STORES.CUSTOMERS, cust);
                if (selectedCustomer && selectedCustomer.id === custId) {
                    selectedCustomer.outstanding = cust.outstanding;
                }
            }
        }

        // 3. Tambah piutang baru jika ada shortage
        if (outstandingAdded > 0 && selectedCustomer) {
            const cust = customers.find(c => c.id === selectedCustomer.id);
            if (cust) {
                cust.outstanding = (cust.outstanding || 0) + outstandingAdded;
                cust.updatedAt = new Date().toISOString();
                await dbPut(STORES.CUSTOMERS, cust);
                selectedCustomer.outstanding = cust.outstanding;
            }
        }

        // 4. Kumpulkan data pembayaran
        let payments = [];
        if (pendingPayments.length > 0) {
            payments = pendingPayments;
        } else {
            const cash = parseFloat(document.getElementById('payment-cash')?.value) || 0;
            const card = parseFloat(document.getElementById('payment-card')?.value) || 0;
            const transfer = parseFloat(document.getElementById('payment-transfer')?.value) || 0;
            const ewallet = parseFloat(document.getElementById('payment-ewallet')?.value) || 0;
            if (cash > 0) payments.push({ method: 'cash', amount: cash });
            if (card > 0) payments.push({ method: 'card', amount: card });
            if (transfer > 0) payments.push({ method: 'transfer', amount: transfer });
            if (ewallet > 0) payments.push({ method: 'ewallet', amount: ewallet });
        }

        const transactionNumber = await generateTransactionNumber();
        console.log('Nomor transaksi:', transactionNumber);

        const subtotal = cart.reduce((sum, c) => sum + c.subtotal, 0);
        const discount = 0;
        const tax = 0;
        const finalTotal = subtotal - discount + tax;
        const change = paidTotal - finalTotal;

        const items = cart.map(c => ({
            itemId: c.item.id,
            itemName: c.item.name,
            qty: c.qty,
            pricePerUnit: c.pricePerUnit,
            subtotal: c.subtotal,
            unitConversion: c.unitConversion ? { 
                id: c.unitConversion.unit, 
                name: kasirSatuan.find(s => s.id == c.unitConversion.unit)?.name,
                value: c.unitConversion.value
            } : null,
            weightGram: c.weightGram || 0,
            cost: (c.unitConversion?.basePrice || c.item.hargaDasar || 0),
            isBundle: c.isBundle || false,
            bundleId: c.bundleId || null,
            components: c.isBundle ? c.components : null,
            warehouseId: c.warehouseId,
            batchId: c.batchId,
            serialId: c.serialId
        }));

        const salesData = {
            transactionNumber,
            date: new Date().toISOString(),
            items,
            subtotal,
            discount,
            tax,
            total: finalTotal,
            payments,
            paidTotal,
            change,
            outstandingAdded,
            customerId: selectedCustomer ? selectedCustomer.id : null,
            customerName: selectedCustomer ? selectedCustomer.name : null
        };

        const saleId = await dbAdd(STORES.SALES, salesData);
        console.log('Data penjualan disimpan');

        // Update stock movements dengan referenceId
        // (Sebenarnya sudah dicatat saat reduceStock, tapi kita update referenceId-nya)
        // Untuk menyederhanakan, kita biarkan referenceId null, atau bisa di-update nanti

        lastTransactionData = {
            items: cart.map(c => ({
                name: c.item.name,
                qty: c.qty,
                unit: c.unitConversion ? (kasirSatuan.find(s => s.id == c.unitConversion.unit)?.name || '?') : (c.weightGram ? 'kg' : 'pcs'),
                price: c.pricePerUnit,
                subtotal: c.subtotal
            })),
            total: finalTotal,
            paidAmount: paidTotal,
            change: change,
            date: new Date().toLocaleString('id-ID'),
            transactionNumber: transactionNumber
        };

        cart = [];
        selectedCustomer = null;
        document.getElementById('customer-badge').style.display = 'none';

        renderCartPage();
        saveCartToLocalStorage();
        resetPaymentPage();

        await loadKasirItems();
        await loadItemStocks();
        await loadItemBatches();
        await loadCustomers();
        renderProductList();
        await updateDashboard();

        showNotification(`Pembayaran berhasil (${payments.map(p => p.method).join(', ')})${outstandingAdded > 0 ? ' (dengan piutang)' : ''}`, 'success');
        console.log('Transaksi selesai');

    } catch (error) {
        console.error('Error processing payment:', error);
        showNotification('Gagal memproses pembayaran: ' + error.message, 'error');
    } finally {
        hideLoading();
        setPaymentInputsDisabled(false);
        pendingPayments = [];
        pendingTotalPaid = 0;
    }
}

function closeConfirmPiutangModal() {
    document.getElementById('confirm-piutang-modal').style.display = 'none';
    setPaymentInputsDisabled(false);
    pendingPayments = [];
    pendingTotalPaid = 0;
}

// ==================== FUNGSI PRINT VIA WEB SERIAL ====================
function wrapText(text, maxWidth) {
    if (!text) return [];
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    for (let word of words) {
        if (word.length > maxWidth) {
            if (currentLine.length > 0) {
                lines.push(currentLine);
                currentLine = '';
            }
            for (let i = 0; i < word.length; i += maxWidth) {
                lines.push(word.substr(i, maxWidth));
            }
        } else {
            if (currentLine.length + word.length + 1 > maxWidth) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                if (currentLine.length === 0) {
                    currentLine = word;
                } else {
                    currentLine += ' ' + word;
                }
            }
        }
    }
    if (currentLine.length > 0) {
        lines.push(currentLine);
    }
    return lines;
}

async function doPrint(dataToPrint) {
    const { paperWidth, header, footer, showDateTime, showTransactionNumber, showCashier } = receiptConfig;
    try {
        const writer = printerPort.writable.getWriter();
        const encoder = new TextEncoder();
        let receipt = '\n';

        const headerLines = header.split('\n');
        headerLines.forEach(line => {
            const wrapped = wrapText(line, paperWidth);
            wrapped.forEach(l => {
                receipt += l.padEnd(paperWidth) + '\n';
            });
        });
        receipt += '='.repeat(paperWidth) + '\n';

        if (showDateTime) {
            receipt += `Tanggal: ${new Date().toLocaleString('id-ID')}\n`;
        }
        if (showTransactionNumber && dataToPrint.transactionNumber) {
            receipt += `No.    : ${dataToPrint.transactionNumber}\n`;
        }
        if (showCashier) {
            receipt += `Kasir  : ${currentUser ? currentUser.name : 'Admin'}\n`;
        }
        receipt += '-'.repeat(paperWidth) + '\n';

        dataToPrint.items.forEach(item => {
            const nameWrapped = wrapText(item.name, paperWidth - 5);
            nameWrapped.forEach((line, idx) => {
                if (idx === 0) {
                    receipt += line + '\n';
                } else {
                    receipt += '     ' + line + '\n';
                }
            });
            const qtyStr = `${item.qty} ${item.unit} x ${formatRupiah(item.price)}`;
            const subtotalStr = formatRupiah(item.subtotal);
            const line = qtyStr + ' '.repeat(Math.max(1, paperWidth - qtyStr.length - subtotalStr.length)) + subtotalStr;
            receipt += line + '\n';
        });

        receipt += '-'.repeat(paperWidth) + '\n';

        const totalLabel = 'Total';
        const totalVal = formatRupiah(dataToPrint.total);
        receipt += totalLabel + ' '.repeat(paperWidth - totalLabel.length - totalVal.length) + totalVal + '\n';

        const paidLabel = 'Bayar';
        const paidVal = formatRupiah(dataToPrint.paidAmount);
        receipt += paidLabel + ' '.repeat(paperWidth - paidLabel.length - paidVal.length) + paidVal + '\n';

        const changeLabel = 'Kembali';
        const changeVal = formatRupiah(dataToPrint.change);
        receipt += changeLabel + ' '.repeat(paperWidth - changeLabel.length - changeVal.length) + changeVal + '\n';

        receipt += '='.repeat(paperWidth) + '\n';

        const footerLines = footer.split('\n');
        footerLines.forEach(line => {
            const wrapped = wrapText(line, paperWidth);
            wrapped.forEach(l => {
                receipt += l.padEnd(paperWidth) + '\n';
            });
        });

        receipt += '\n\n\n';

        await writer.write(encoder.encode(receipt));
        writer.releaseLock();
        showNotification('Struk berhasil dicetak', 'success');
    } catch (error) {
        console.error('Error printing:', error);
        showNotification('Gagal mencetak: ' + error.message, 'error');
    }
}

async function printReceipt() {
    if (!printerPort) {
        showNotification('Printer belum terhubung', 'error');
        return;
    }

    if (cart.length > 0) {
        const confirmMsg = "Transaksi belum diproses. Apakah Anda ingin memproses pembayaran sekarang?";
        if (confirm(confirmMsg)) {
            await processPayment(true);
        }
        return;
    }

    if (lastTransactionData) {
        await doPrint(lastTransactionData);
        return;
    }

    showNotification("Tidak ada data untuk dicetak.", "warning");
}

async function togglePrinter() {
    if (printerPort) {
        try {
            await printerPort.close();
            printerPort = null;
            updatePrinterStatus(false);
            showNotification('Printer diputuskan', 'info');
        } catch (error) {
            console.error('Error disconnecting printer:', error);
            showNotification('Gagal memutuskan printer: ' + error.message, 'error');
        }
    } else {
        if (!navigator.serial) {
            showNotification('Web Serial API tidak didukung di browser ini. Gunakan Chrome/Edge.', 'error');
            return;
        }
        try {
            const port = await navigator.serial.requestPort();
            await port.open({ baudRate: 9600 });
            printerPort = port;
            updatePrinterStatus(true);
            showNotification('Printer terhubung', 'success');
        } catch (error) {
            console.error('Error connecting printer:', error);
            showNotification('Gagal connect printer: ' + error.message, 'error');
        }
    }
}

function updatePrinterStatus(connected) {
    const statusLight = document.getElementById('printer-status-light');
    const statusText = document.getElementById('printer-status-text');
    const connectBtnText = document.getElementById('connect-btn-text');
    if (connected) {
        statusLight.classList.add('connected');
        statusText.textContent = '';
        connectBtnText.textContent = 'Disconnect';
    } else {
        statusLight.classList.remove('connected');
        statusText.textContent = '';
        connectBtnText.textContent = 'Connect';
    }
}

async function autoReconnectPrinter() {
    if (!navigator.serial) return;
    try {
        const ports = await navigator.serial.getPorts();
        if (ports.length > 0) {
            const port = ports[0];
            await port.open({ baudRate: 9600 });
            printerPort = port;
            updatePrinterStatus(true);
            console.log('Printer auto-connected');
        }
    } catch (error) {
        console.warn('Auto reconnect printer failed:', error);
    }
}

// ==================== FUNGSI INVENTORY ====================
function openInventoryStokModal() {
    document.getElementById('inventory-modal-title').innerHTML = `
        <svg class="icon icon-primary" viewBox="0 0 24 24">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
        </svg> Stok Barang`;

    let html = `
        <div>
            <select id="inventory-warehouse-select" class="form-input" style="margin-bottom:10px;" onchange="filterInventoryTable()">
                ${warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}
            </select>
            <input type="text" id="inventory-search-input" class="form-input" 
                   placeholder="Cari item..." style="margin-bottom:10px;" 
                   oninput="filterInventoryTable(this.value)">
            <div id="inventory-table-container"></div>
            <div style="margin-top:20px;">
                <button class="form-button-secondary" onclick="closeInventoryModal()">Tutup</button>
            </div>
        </div>
    `;

    document.getElementById('inventory-modal-body').innerHTML = html;
    filterInventoryTable('');
    document.getElementById('inventory-modal').style.display = 'flex';
    closeDrawer();
}

function filterInventoryTable(filterText) {
    const container = document.getElementById('inventory-table-container');
    if (!container) return;

    const warehouseId = parseInt(document.getElementById('inventory-warehouse-select')?.value) || (warehouses[0]?.id);
    const filter = (filterText || '').toLowerCase();

    const filteredItems = kasirItems.filter(item => {
        const matchesName = item.name.toLowerCase().includes(filter);
        const matchesCode = item.code.toLowerCase().includes(filter);
        return matchesName || matchesCode;
    });

    let tableHtml = '<table style="width:100%; border-collapse:collapse;"><thead><tr><th>Nama Item</th><th>Stok</th><th>Batch</th><th>Aksi</th></tr></thead><tbody>';

    filteredItems.forEach(item => {
        const stock = itemStocks.find(s => s.itemId === item.id && s.warehouseId === warehouseId);
        const qty = stock ? stock.quantity : 0;
        const batches = itemBatches.filter(b => b.itemId === item.id && b.warehouseId === warehouseId);
        const batchInfo = batches.map(b => `${b.batchNumber}: ${b.quantity}`).join('<br>') || '-';
        tableHtml += `<tr>
            <td>${item.name}</td>
            <td>${qty}</td>
            <td>${batchInfo}</td>
            <td>
                <button class="action-btn edit-btn" onclick="openStockOpnameForItem(${item.id})">
                    ${icons.edit}
                </button>
            </td>
        </tr>`;
    });

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}

function openInventoryOpnameModal() {
    openInventoryStokModal();
    closeDrawer();
}

function openStockOpnameForItem(itemId) {
    const item = kasirItems.find(i => i.id === itemId);
    if (!item) return;
    
    document.getElementById('inventory-modal-title').innerHTML = `
        <svg class="icon icon-primary" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
        </svg> Stok Opname: ${item.name}`;
    
    const warehouseId = parseInt(document.getElementById('inventory-warehouse-select')?.value) || (warehouses[0]?.id);
    const batches = itemBatches.filter(b => b.itemId === itemId && b.warehouseId === warehouseId);
    
    let html = '<div style="padding:20px;">';
    batches.forEach((batch, idx) => {
        html += `
            <div style="margin-bottom:15px;">
                <label>Batch: ${batch.batchNumber} (Exp: ${batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('id-ID') : '-'})</label>
                <input type="number" id="opname-batch-${idx}" class="form-input" value="${batch.quantity}" step="any" min="0" placeholder="Stok fisik">
            </div>
        `;
    });
    if (batches.length === 0) {
        html += '<p>Tidak ada batch untuk item ini.</p>';
    }
    html += `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px; margin-top:20px;">
            <button class="form-button-secondary" onclick="openInventoryStokModal()">Batal</button>
            <button class="form-button-primary" onclick="updateStock(${item.id})">Simpan</button>
        </div>
    </div>`;
    document.getElementById('inventory-modal-body').innerHTML = html;
}

async function updateStock(itemId) {
    // Implementasi sederhana: update batch satu per satu
    const warehouseId = parseInt(document.getElementById('inventory-warehouse-select')?.value) || (warehouses[0]?.id);
    const batches = itemBatches.filter(b => b.itemId === itemId && b.warehouseId === warehouseId);
    try {
        showLoading();
        for (let i = 0; i < batches.length; i++) {
            const input = document.getElementById(`opname-batch-${i}`);
            if (input) {
                const newQty = parseFloat(input.value);
                if (!isNaN(newQty) && newQty >= 0) {
                    batches[i].quantity = newQty;
                    batches[i].updatedAt = new Date().toISOString();
                    await dbPut(STORES.ITEM_BATCHES, batches[i]);
                }
            }
        }
        // Update item_stocks
        const totalQty = batches.reduce((sum, b) => sum + b.quantity, 0);
        let stock = itemStocks.find(s => s.itemId === itemId && s.warehouseId === warehouseId);
        if (stock) {
            stock.quantity = totalQty;
            stock.updatedAt = new Date().toISOString();
            await dbPut(STORES.ITEM_STOCKS, stock);
        }
        await loadItemStocks();
        await loadItemBatches();
        await updateDashboard();
        showNotification('Stok diperbarui', 'success');
        openInventoryStokModal();
    } catch (error) {
        showNotification('Gagal update stok: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function openInventoryLaporanModal() {
    document.getElementById('inventory-modal-title').innerHTML = `
        <svg class="icon icon-primary" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
        </svg> Laporan Stok`;
    
    let html = '<div style="max-height:400px; overflow-y:auto;">';
    html += '<table style="width:100%; border-collapse:collapse;">';
    html += '<thead><tr><th>Nama Item</th><th>Gudang</th><th>Batch</th><th>Stok</th></tr></thead><tbody>';
    itemBatches.forEach(batch => {
        const item = kasirItems.find(i => i.id === batch.itemId);
        const warehouse = warehouses.find(w => w.id === batch.warehouseId);
        html += `<tr><td>${item ? item.name : '-'}</td><td>${warehouse ? warehouse.name : '-'}</td><td>${batch.batchNumber}</td><td>${batch.quantity}</td></tr>`;
    });
    html += '</tbody></table></div>';
    html += '<div style="margin-top:20px;"><button class="form-button-secondary" onclick="closeInventoryModal()">Tutup</button></div>';
    
    document.getElementById('inventory-modal-body').innerHTML = html;
    document.getElementById('inventory-modal').style.display = 'flex';
    closeDrawer();
}

function closeInventoryModal() {
    document.getElementById('inventory-modal').style.display = 'none';
}

// ==================== FUNGSI TAMPILAN PRODUK ====================
function setProductViewMode(mode) {
    productViewMode = mode;
    const listBtn = document.getElementById('view-list-btn');
    const gridBtn = document.getElementById('view-grid-btn');
    if (listBtn && gridBtn) {
        if (mode === 'list') {
            listBtn.classList.add('active');
            gridBtn.classList.remove('active');
        } else {
            gridBtn.classList.add('active');
            listBtn.classList.remove('active');
        }
    }
    renderProductList();
}

function renderProductList(itemsToRender = null) {
    const container = document.getElementById('product-container');
    if (!container) return;

    const items = itemsToRender || kasirItems;
    if (!items || items.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px;">Tidak ada produk</div>';
        return;
    }

    let html = '';
    if (productViewMode === 'list') {
        html = '<div class="product-list">';
        items.forEach(item => {
            let step = item.isWeighable ? '0.01' : '1';
            let min = '0.01';
            const stock = getItemStock(item.id, selectedWarehouseId);
            html += `
                <div class="product-list-item" data-item-id="${item.id}">
                    <div class="name"><strong>${item.name}</strong></div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin: 4px 0;">
                        <span class="price" style="font-size: 0.9rem;">${formatRupiah(item.hargaJual)}</span>
                        <div class="qty-control">
                            <button class="qty-minus" onclick="event.stopPropagation(); adjustQty(this, -1, ${item.id})">-</button>
                            <input type="number" class="qty-input" value="1" min="${min}" max="${stock}" step="${step}" data-id="${item.id}" onclick="event.stopPropagation();" onchange="event.stopPropagation();">
                            <button class="qty-plus" onclick="event.stopPropagation(); adjustQty(this, 1, ${item.id})">+</button>
                        </div>
                    </div>
                    <div class="stock" style="font-size: 0.8rem; color: ${stock > 0 ? '#006B54' : '#ff6b6b'}">Stok: ${stock}</div>
                </div>
            `;
        });
        html += '</div>';
    } else {
        html = '<div class="product-grid">';
        items.forEach(item => {
            let step = item.isWeighable ? '0.01' : '1';
            let min = '0.01';
            const stock = getItemStock(item.id, selectedWarehouseId);
            html += `
                <div class="product-card" data-item-id="${item.id}">
                    <div class="product-image">
                        <svg viewBox="0 0 24 24" width="48" height="48">
                            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" stroke="currentColor" fill="none"/>
                            <line x1="2" y1="10" x2="22" y2="10" stroke="currentColor"/>
                            <line x1="7" y1="15" x2="12" y2="15" stroke="currentColor"/>
                        </svg>
                    </div>
                    <div class="name"><strong>${item.name}</strong></div>
                    <div style="display: flex; justify-content: space-between; margin: 4px 0;">
                        <span class="price">${formatRupiah(item.hargaJual)}</span>
                        <span class="stock" style="color: ${stock > 0 ? '#006B54' : '#ff6b6b'}">Stok: ${stock}</span>
                    </div>
                    <div class="qty-control" style="display: flex; justify-content: center; gap: 5px; margin-top: 5px;">
                        <button class="qty-minus" onclick="event.stopPropagation(); adjustQty(this, -1, ${item.id})">-</button>
                        <input type="number" class="qty-input" value="1" min="${min}" max="${stock}" step="${step}" data-id="${item.id}" style="width: 50px; text-align: center;" onclick="event.stopPropagation();" onchange="event.stopPropagation();">
                        <button class="qty-plus" onclick="event.stopPropagation(); adjustQty(this, 1, ${item.id})">+</button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }
    container.innerHTML = html;
}

function filterProductList(keyword) {
    keyword = keyword.toLowerCase().trim();
    if (!keyword) {
        currentFilteredItems = [...kasirItems];
    } else {
        currentFilteredItems = kasirItems.filter(item => {
            const matchItem = 
                (item.name && item.name.toLowerCase().includes(keyword)) ||
                (item.code && item.code.toLowerCase().includes(keyword)) ||
                (item.barcode && item.barcode.toLowerCase().includes(keyword));
            if (matchItem) return true;

            if (item.unitConversions && Array.isArray(item.unitConversions)) {
                return item.unitConversions.some(conv => 
                    conv.barcode && conv.barcode.toLowerCase().includes(keyword)
                );
            }
            return false;
        });
    }
    renderProductList(currentFilteredItems);
}

function adjustQty(btn, delta, itemId) {
    const container = btn.closest('.product-list-item, .product-card');
    const input = container.querySelector('.qty-input');
    if (input) {
        const item = kasirItems.find(i => i.id === itemId);
        let step = 1;
        if (item && item.isWeighable) step = 0.01;
        let newVal = parseFloat(input.value) + (delta * step);
        let min = parseFloat(input.min) || 0.01;
        let max = parseFloat(input.max);
        if (newVal < min) newVal = min;
        if (newVal > max) newVal = max;
        if (item && item.isWeighable) {
            newVal = Math.round(newVal * 100) / 100;
        } else {
            newVal = Math.round(newVal);
        }
        input.value = newVal;
    }
}

function addToCartFromProductWithQty(itemId, element) {
    const input = element.querySelector('.qty-input');
    let qty = 1;
    if (input) {
        qty = parseFloat(input.value);
        if (isNaN(qty) || qty <= 0) qty = 0.01;
    }
    const item = kasirItems.find(i => i.id === itemId);
    if (item) {
        // Cek apakah perlu pilih batch
        const batches = getAvailableBatches(item.id, selectedWarehouseId);
        if (batches.length > 0) {
            showBatchSelectionModal(item, batches, null, 0);
        } else {
            addToCart(item, qty, null, 0);
        }
    }
}

// ==================== LONG PRESS & PEMILIHAN SATUAN ====================
let longPressTimer = null;
let longPressItemId = null;
let longPressTriggered = false;

function handleLongPressStart(e) {
    if (e.button !== 0 && e.type !== 'touchstart') return;
    if (e.target.closest('button, input')) return;

    const productEl = e.target.closest('.product-list-item, .product-card');
    if (!productEl) return;
    const itemId = parseInt(productEl.dataset.itemId);
    if (isNaN(itemId)) return;

    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }

    longPressItemId = itemId;
    longPressTriggered = false;

    longPressTimer = setTimeout(() => {
        longPressTriggered = true;
        showUnitSelectionModal(itemId);
        longPressTimer = null;
    }, 500);
}

function handleLongPressEnd(e) {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

const productContainer = document.getElementById('product-container');
if (productContainer) {
    productContainer.addEventListener('mousedown', handleLongPressStart);
    productContainer.addEventListener('touchstart', handleLongPressStart);
    productContainer.addEventListener('mouseup', handleLongPressEnd);
    productContainer.addEventListener('touchend', handleLongPressEnd);
    productContainer.addEventListener('mouseleave', handleLongPressEnd);
    productContainer.addEventListener('touchcancel', handleLongPressEnd);

    productContainer.addEventListener('click', function(e) {
        if (longPressTriggered) {
            e.preventDefault();
            e.stopPropagation();
            longPressTriggered = false;
            return false;
        }
        if (e.target.closest('button, input')) return;

        const productEl = e.target.closest('.product-list-item, .product-card');
        if (!productEl) return;
        const itemId = parseInt(productEl.dataset.itemId);
        if (isNaN(itemId)) return;
        addToCartFromProductWithQty(itemId, productEl);
    });
}

function showUnitSelectionModal(itemId) {
    const item = kasirItems.find(i => i.id === itemId);
    if (!item) return;

    if (!item.unitConversions || item.unitConversions.length === 0) {
        showNotification('Produk ini tidak memiliki satuan alternatif', 'info');
        return;
    }

    const modal = document.getElementById('select-unit-modal');
    const listContainer = document.getElementById('select-unit-list');
    if (!modal || !listContainer) return;

    let html = `<div style="margin-bottom:10px;">Pilih satuan untuk <strong>${item.name}</strong></div>`;
    item.unitConversions.forEach((conv, index) => {
        const unitName = kasirSatuan.find(s => s.id == conv.unit)?.name || '?';
        const price = conv.sellPrice;
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
                <div>
                    <strong>${unitName}</strong> (1 ${unitName} = ${conv.value} ${item.satuanDasar || 'pcs'})<br>
                    Harga: ${formatRupiah(price)}
                </div>
                <button class="form-button-primary" onclick="addToCartWithUnit(${itemId}, ${index})">Pilih</button>
            </div>
        `;
    });

    listContainer.innerHTML = html;
    modal.style.display = 'flex';
}

function closeSelectUnitModal() {
    document.getElementById('select-unit-modal').style.display = 'none';
}

function addToCartWithUnit(itemId, convIndex) {
    const item = kasirItems.find(i => i.id === itemId);
    if (!item) return;
    const conv = item.unitConversions[convIndex];
    if (!conv) return;

    const input = document.querySelector(`.qty-input[data-id="${itemId}"]`);
    let qty = 1;
    if (input) {
        qty = parseFloat(input.value);
        if (isNaN(qty) || qty <= 0) qty = 0.01;
    }

    // Cek batch
    const batches = getAvailableBatches(item.id, selectedWarehouseId);
    if (batches.length > 0) {
        showBatchSelectionModal(item, batches, conv, 0);
    } else {
        addToCart(item, qty, conv, 0);
    }
    closeSelectUnitModal();
}

window.closeSelectUnitModal = closeSelectUnitModal;
window.addToCartWithUnit = addToCartWithUnit;

// ==================== FUNGSI PENDING TRANSACTIONS ====================
function openPendingTransactionsModal() {
    const container = document.getElementById('pending-transactions-list');
    container.innerHTML = '';
    if (pendingTransactions.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">Tidak ada transaksi pending.</div>';
    } else {
        pendingTransactions.forEach((trans, index) => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.style.padding = '10px';
            div.style.borderBottom = '1px solid #eee';
            div.innerHTML = `
                <div style="flex:1;">
                    <strong>${trans.pendingCode || 'Transaksi ' + trans.id}</strong><br>
                    <span style="font-size:0.8rem;">
                        Tanggal: ${new Date(trans.createdAt).toLocaleString()}<br>
                        Total: ${formatRupiah(trans.total)}<br>
                        Customer: ${trans.customerName || '-'}
                    </span>
                </div>
                <div>
                    <button class="action-btn edit-btn" onclick="loadPendingTransaction(${trans.id})">Muat</button>
                    <button class="action-btn delete-btn" onclick="deletePendingTransactionPrompt(${trans.id})">Hapus</button>
                </div>
            `;
            container.appendChild(div);
        });
    }
    document.getElementById('pending-transactions-modal').style.display = 'flex';
}

function closePendingTransactionsModal() {
    document.getElementById('pending-transactions-modal').style.display = 'none';
}

async function deletePendingTransactionPrompt(id) {
    if (confirm('Hapus transaksi pending ini?')) {
        await deletePendingTransaction(id);
        openPendingTransactionsModal();
    }
}

function loadPendingTransaction(id) {
    const trans = pendingTransactions.find(t => t.id === id);
    if (trans) {
        const newCart = [];
        trans.cart.forEach(c => {
            if (c.isBundle) {
                const bundle = bundles.find(b => b.id == c.bundleId);
                if (bundle) {
                    newCart.push({
                        item: { id: 'bundle-' + bundle.id, name: bundle.name, stock: Infinity },
                        qty: c.qty,
                        unitConversion: null,
                        weightGram: 0,
                        pricePerUnit: c.pricePerUnit,
                        subtotal: c.subtotal,
                        isBundle: true,
                        bundleId: bundle.id,
                        components: c.components || bundle.components,
                        warehouseId: c.warehouseId,
                        batchId: c.batchId,
                        serialId: c.serialId
                    });
                }
            } else {
                const item = kasirItems.find(i => i.id === c.itemId);
                if (item) {
                    newCart.push({
                        item: item,
                        qty: c.qty,
                        unitConversion: c.unitConversion,
                        weightGram: c.weightGram,
                        pricePerUnit: c.pricePerUnit,
                        subtotal: c.subtotal,
                        warehouseId: c.warehouseId,
                        batchId: c.batchId,
                        serialId: c.serialId
                    });
                } else {
                    showNotification(`Item dengan ID ${c.itemId} tidak ditemukan, dilewati.`, 'warning');
                }
            }
        });
        cart = newCart;
        if (trans.customerId) {
            const cust = customers.find(c => c.id === trans.customerId);
            if (cust) selectedCustomer = cust;
            else selectedCustomer = null;
        } else {
            selectedCustomer = null;
        }
        const badge = document.getElementById('customer-badge');
        if (selectedCustomer) {
            badge.textContent = selectedCustomer.name.charAt(0).toUpperCase();
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
        renderCartPage();
        updatePiutangButtonCart();
        saveCartToLocalStorage();

        deletePendingTransaction(id).then(() => {
            showNotification('Transaksi pending dimuat dan dihapus dari daftar', 'success');
        }).catch(error => {
            console.error('Gagal menghapus transaksi pending:', error);
        });

        closePendingTransactionsModal();
        if (document.getElementById('transaksi-page').style.display !== 'block') {
            openTransaksiPage();
        }
    }
}

function saveDraftTransaction() {
    if (cart.length === 0) {
        showNotification('Keranjang kosong, tidak ada yang disimpan', 'warning');
        return;
    }
    document.getElementById('pending-code-input').value = '';
    document.getElementById('pending-code-modal').style.display = 'flex';
}

function closePendingCodeModal() {
    document.getElementById('pending-code-modal').style.display = 'none';
}

async function confirmSaveDraft() {
    const pendingCode = document.getElementById('pending-code-input').value.trim();
    
    let finalCode = pendingCode;
    if (!finalCode) {
        finalCode = `Pending ${new Date().toLocaleString()}`;
    }
    
    const isDuplicate = pendingTransactions.some(t => 
        t.pendingCode && t.pendingCode.toLowerCase() === finalCode.toLowerCase()
    );
    
    if (isDuplicate) {
        showNotification('Kode/Nama pending sudah digunakan. Silakan gunakan kode lain.', 'error');
        return;
    }
    
    closePendingCodeModal();

    const total = cart.reduce((sum, c) => sum + c.subtotal, 0);
    const transactionData = {
        pendingCode: finalCode,
        cart: cart.map(c => ({
            itemId: c.item.id,
            itemName: c.item.name,
            qty: c.qty,
            unitConversion: c.unitConversion ? { ...c.unitConversion } : null,
            weightGram: c.weightGram,
            pricePerUnit: c.pricePerUnit,
            subtotal: c.subtotal,
            isBundle: c.isBundle || false,
            bundleId: c.bundleId,
            components: c.components,
            warehouseId: c.warehouseId,
            batchId: c.batchId,
            serialId: c.serialId
        })),
        customerId: selectedCustomer ? selectedCustomer.id : null,
        customerName: selectedCustomer ? selectedCustomer.name : null,
        total: total,
        createdAt: new Date().toISOString()
    };
    
    try {
        showLoading();
        await savePendingTransaction(transactionData);
        
        cart = [];
        selectedCustomer = null;
        document.getElementById('customer-badge').style.display = 'none';
        saveCartToLocalStorage();
        renderCartPage();
        updatePiutangButtonCart();

        if (document.getElementById('cart-page').style.display === 'block') {
            closeCartPage();
        } else {
            renderProductList();
        }

        showNotification('Transaksi disimpan sebagai draft', 'success');
    } catch (error) {
        showNotification('Gagal menyimpan draft: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function validatePendingCode(input) {
    const code = input.value.trim();
    const errorElement = document.getElementById('pending-code-error');
    
    if (!errorElement) return;
    
    if (!code) {
        errorElement.textContent = '';
        return;
    }
    
    const isDuplicate = pendingTransactions.some(t => 
        t.pendingCode && t.pendingCode.toLowerCase() === code.toLowerCase()
    );
    
    if (isDuplicate) {
        errorElement.textContent = 'Kode ini sudah digunakan.';
        errorElement.style.color = '#dc3545';
        document.querySelector('#pending-code-modal .btn-primary').disabled = true;
    } else {
        errorElement.textContent = 'Kode tersedia.';
        errorElement.style.color = '#28a745';
        document.querySelector('#pending-code-modal .btn-primary').disabled = false;
    }
}

async function savePendingTransaction(transactionData) {
    try {
        const now = new Date().toISOString();
        const data = { ...transactionData, createdAt: now };
        const id = await dbAdd(STORES.PENDING_TRANSACTIONS, data);
        data.id = id;
        pendingTransactions.push(data);
        updatePendingBadge();
        await updateDashboard();
        return data;
    } catch (error) {
        console.error('Error saving pending transaction:', error);
        throw error;
    }
}

async function deletePendingTransaction(id) {
    try {
        await dbDelete(STORES.PENDING_TRANSACTIONS, id);
        pendingTransactions = pendingTransactions.filter(t => t.id !== id);
        updatePendingBadge();
        await updateDashboard();
    } catch (error) {
        console.error('Error deleting pending transaction:', error);
        throw error;
    }
}

// ==================== FUNGSI LAPORAN PENJUALAN ====================
function openLaporanPage() {
    window.location.href = 'laporan.html';
}

// ==================== FUNGSI PEMBELIAN ====================
function openPembelianPage() {
    window.location.href = 'pembelian.html';
}

// ==================== FUNGSI GENERATE NOMOR PEMBELIAN ====================
async function generatePurchaseNumber() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    let lastCounter = 0;
    try {
        const transaction = db.transaction([STORES.SETTINGS], 'readonly');
        const store = transaction.objectStore(STORES.SETTINGS);
        const request = store.get('lastPurchaseNumber');
        await new Promise((resolve, reject) => {
            request.onsuccess = () => {
                if (request.result) {
                    const data = request.result.value;
                    if (data.date === dateStr) {
                        lastCounter = data.counter;
                    } else {
                        lastCounter = 0;
                    }
                }
                resolve();
            };
            request.onerror = reject;
        });
    } catch (error) {
        console.warn('Gagal membaca counter purchase:', error);
    }

    const newCounter = lastCounter + 1;
    const purchaseNumber = `PO-${dateStr}-${String(newCounter).padStart(5, '0')}`;

    try {
        await dbPut(STORES.SETTINGS, {
            key: 'lastPurchaseNumber',
            value: { date: dateStr, counter: newCounter }
        });
    } catch (error) {
        console.error('Gagal menyimpan counter purchase:', error);
    }

    return purchaseNumber;
}

async function generateTransactionNumber() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    let lastCounter = 0;
    try {
        const transaction = db.transaction([STORES.SETTINGS], 'readonly');
        const store = transaction.objectStore(STORES.SETTINGS);
        const request = store.get('lastTransactionNumber');
        await new Promise((resolve, reject) => {
            request.onsuccess = () => {
                if (request.result) {
                    const data = request.result.value;
                    if (data.date === dateStr) {
                        lastCounter = data.counter;
                    } else {
                        lastCounter = 0;
                    }
                }
                resolve();
            };
            request.onerror = reject;
        });
    } catch (error) {
        console.warn('Gagal membaca counter transaksi:', error);
    }

    const newCounter = lastCounter + 1;
    const transactionNumber = `INV-${dateStr}-${String(newCounter).padStart(5, '0')}`;

    try {
        await dbPut(STORES.SETTINGS, {
            key: 'lastTransactionNumber',
            value: { date: dateStr, counter: newCounter }
        });
    } catch (error) {
        console.error('Gagal menyimpan counter transaksi:', error);
    }

    return transactionNumber;
}

async function refreshData() {
    try {
        showLoading();
        await loadKasirCategories();
        await loadKasirItems();
        await loadKasirSatuan();
        await loadCustomers();
        await loadSuppliers();
        await loadPendingTransactions();
        await loadUsers();
        await loadRoles();
        await loadBundles();
        await loadWarehouses();
        await loadItemStocks();
        await loadItemBatches();
        await loadItemSerials();
        await loadStockMovements();
        await loadTransfers();
        await loadStocktakes();
        await loadConsignments();
        await loadBOMs();
        await loadProductions();
        await updateDashboard();
        console.log('Data refreshed successfully');
    } catch (error) { console.error('Error refreshing data:', error); } finally { hideLoading(); }
}

// ==================== FUNGSI DASHBOARD ====================
async function updateDashboard() {
    try {
        const allSales = await dbGetAll(STORES.SALES);
        const today = new Date().toISOString().split('T')[0];
        const todaySales = allSales.filter(s => s.date.startsWith(today));

        const totalToday = todaySales.reduce((sum, s) => sum + s.total, 0);
        const todaySalesEl = document.getElementById('today-sales');
        if (todaySalesEl) todaySalesEl.textContent = formatRupiah(totalToday);

        const todayTransEl = document.getElementById('today-transactions');
        if (todayTransEl) todayTransEl.textContent = todaySales.length;

        // Hitung stok menipis (di semua gudang)
        const lowStockItems = kasirItems.filter(item => {
            const totalStock = itemStocks.filter(s => s.itemId === item.id).reduce((sum, s) => sum + s.quantity, 0);
            return totalStock < (item.minStock || 5);
        });
        const lowStockEl = document.getElementById('low-stock-count');
        if (lowStockEl) lowStockEl.textContent = lowStockItems.length;

        renderNotifications(lowStockItems);
        renderSalesChart(todaySales);
        renderPendingList();
    } catch (error) {
        console.error('Error updating dashboard:', error);
    }
}

function renderNotifications(lowStockItems) {
    const area = document.getElementById('notifications-area');
    if (!area) return;
    area.innerHTML = '';

    if (lowStockItems.length > 0) {
        const notif = document.createElement('div');
        notif.className = 'notification warning';
        notif.innerHTML = `⚠️ Terdapat ${lowStockItems.length} produk dengan stok menipis. <button onclick="openInventoryStokModal()">Lihat</button>`;
        area.appendChild(notif);
    }

    const customersWithOutstanding = customers.filter(c => c.outstanding > 0);
    const totalOutstanding = customersWithOutstanding.reduce((sum, c) => sum + c.outstanding, 0);
    if (customersWithOutstanding.length > 0) {
        const notif = document.createElement('div');
        notif.className = 'notification danger';
        notif.innerHTML = `💰 Total piutang dari ${customersWithOutstanding.length} pelanggan: ${formatRupiah(totalOutstanding)}. <button onclick="window.location.href='relasi.html#customers'">Lihat</button>`;
        area.appendChild(notif);
    }

    if (pendingTransactions.length > 0) {
        const notif = document.createElement('div');
        notif.className = 'notification info';
        notif.innerHTML = `📋 Terdapat ${pendingTransactions.length} transaksi pending. <button onclick="openPendingTransactionsModal()">Lihat</button>`;
        area.appendChild(notif);
    }
}

function renderSalesChart(salesToday) {
    const canvas = document.getElementById('salesChart');
    if (!canvas) return;

    if (salesChartInstance) salesChartInstance.destroy();

    const salesPerHour = new Array(24).fill(0);
    salesToday.forEach(sale => {
        const hour = new Date(sale.date).getHours();
        salesPerHour[hour] += sale.total;
    });

    const hours = Array.from({ length: 24 }, (_, i) => i + ':00');

    salesChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: hours,
            datasets: [{
                label: 'Total Penjualan (Rp)',
                data: salesPerHour,
                backgroundColor: '#006B54',
                borderColor: '#004d3e',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return 'Rp ' + value.toLocaleString('id-ID');
                        }
                    }
                }
            }
        }
    });
}

function renderPendingList() {
    const container = document.getElementById('pending-list-container');
    if (!container) return;
    if (pendingTransactions.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#666;">Tidak ada transaksi pending.</p>';
        return;
    }
    let html = '<table style="width:100%; border-collapse:collapse;">';
    html += '<thead><tr><th>Kode</th><th>Tanggal</th><th>Total</th><th>Customer</th><th></th></tr></thead><tbody>';
    pendingTransactions.forEach(t => {
        html += `<tr>
            <td>${t.pendingCode || '-'}</td>
            <td>${new Date(t.createdAt).toLocaleString()}</td>
            <td>${formatRupiah(t.total)}</td>
            <td>${t.customerName || '-'}</td>
            <td><button class="action-btn edit-btn" onclick="loadPendingTransaction(${t.id})">Muat</button></td>
        </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

function updatePendingBadge() {
    const badge = document.getElementById('pending-badge');
    if (!badge) return;
    const count = pendingTransactions.length;
    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function goHome() {
    document.getElementById('transaksi-page').style.display = 'none';
    document.getElementById('cart-page').style.display = 'none';
    document.getElementById('payment-page').style.display = 'none';
    document.getElementById('drive-backup-page').style.display = 'none';
    document.querySelector('.main-content').style.display = 'block';
    closeDrawer();
}

// ==================== FUNGSI HALAMAN GOOGLE DRIVE BACKUP ====================
function openDriveBackupPage() {
    document.querySelector('.main-content').style.display = 'none';
    document.getElementById('transaksi-page').style.display = 'none';
    document.getElementById('cart-page').style.display = 'none';
    document.getElementById('payment-page').style.display = 'none';
    document.getElementById('drive-backup-page').style.display = 'block';
    closeDrawer();

    const token = window.getSavedToken ? window.getSavedToken() : null;
    window.updateDriveUI(!!token, token);
    window.loadDriveSettings();
    if (token) {
        window.loadBackupList();
    }
}

function closeDriveBackupPage() {
    document.getElementById('drive-backup-page').style.display = 'none';
    document.querySelector('.main-content').style.display = 'block';
}

window.openDriveBackupPage = openDriveBackupPage;
window.closeDriveBackupPage = closeDriveBackupPage;

// ==================== FUNGSI LOAD DATA INVENTORY BARU ====================
async function loadWarehouses() {
    try {
        warehouses = await dbGetAll(STORES.WAREHOUSES);
        if (warehouses.length === 0) {
            // Buat gudang default jika belum ada
            const defaultWarehouse = { code: 'WH01', name: 'Gudang Utama', location: 'Utama', isActive: true };
            const id = await dbAdd(STORES.WAREHOUSES, defaultWarehouse);
            defaultWarehouse.id = id;
            warehouses.push(defaultWarehouse);
        }
        selectedWarehouseId = warehouses[0].id;
    } catch (error) {
        console.error('Error loading warehouses:', error);
        warehouses = [];
    }
}

async function loadItemStocks() {
    try {
        itemStocks = await dbGetAll(STORES.ITEM_STOCKS);
    } catch (error) {
        console.error('Error loading item stocks:', error);
        itemStocks = [];
    }
}

async function loadItemBatches() {
    try {
        itemBatches = await dbGetAll(STORES.ITEM_BATCHES);
    } catch (error) {
        console.error('Error loading item batches:', error);
        itemBatches = [];
    }
}

async function loadItemSerials() {
    try {
        itemSerials = await dbGetAll(STORES.ITEM_SERIALS);
    } catch (error) {
        console.error('Error loading item serials:', error);
        itemSerials = [];
    }
}

async function loadStockMovements() {
    try {
        stockMovements = await dbGetAll(STORES.STOCK_MOVEMENTS);
    } catch (error) {
        console.error('Error loading stock movements:', error);
        stockMovements = [];
    }
}

async function loadTransfers() {
    try {
        transfers = await dbGetAll(STORES.TRANSFERS);
    } catch (error) {
        console.error('Error loading transfers:', error);
        transfers = [];
    }
}

async function loadStocktakes() {
    try {
        stocktakes = await dbGetAll(STORES.STOCKTAKES);
    } catch (error) {
        console.error('Error loading stocktakes:', error);
        stocktakes = [];
    }
}

async function loadConsignments() {
    try {
        consignments = await dbGetAll(STORES.CONSIGNMENTS);
    } catch (error) {
        console.error('Error loading consignments:', error);
        consignments = [];
    }
}

async function loadBOMs() {
    try {
        billOfMaterials = await dbGetAll(STORES.BILL_OF_MATERIALS);
    } catch (error) {
        console.error('Error loading BOMs:', error);
        billOfMaterials = [];
    }
}

async function loadProductions() {
    try {
        productions = await dbGetAll(STORES.PRODUCTIONS);
    } catch (error) {
        console.error('Error loading productions:', error);
        productions = [];
    }
}

// ==================== INISIALISASI APLIKASI ====================
async function initApp() {
    try {
        console.log('Starting app initialization...');
        showLoading();
        hideError();
        await initDatabase();
        await loadBarcodeConfig();
        await loadReceiptConfig();
        await loadKasirCategories();
        await loadKasirItems();
        currentFilteredItems = [...kasirItems];
        await loadKasirSatuan();
        await loadCustomers();
        await loadSuppliers();
        await loadPendingTransactions();
        await loadBundles();
        
        // Load data inventory baru
        await loadWarehouses();
        await loadItemStocks();
        await loadItemBatches();
        await loadItemSerials();
        await loadStockMovements();
        await loadTransfers();
        await loadStocktakes();
        await loadConsignments();
        await loadBOMs();
        await loadProductions();

        await loadCartFromLocalStorage();
        await autoReconnectPrinter();
        await loadUsers();
        await loadRoles();

        // Migrasi data stok dari kasirItems ke item_stocks jika diperlukan
        if (itemStocks.length === 0 && kasirItems.length > 0 && warehouses.length > 0) {
            console.log('Migrating stock from kasirItems to item_stocks...');
            for (let item of kasirItems) {
                if (item.stock > 0) {
                    const stockData = {
                        itemId: item.id,
                        warehouseId: warehouses[0].id,
                        quantity: item.stock,
                        minStock: item.minStock || 5,
                        reorderPoint: item.minStock || 5,
                        updatedAt: new Date().toISOString()
                    };
                    await dbAdd(STORES.ITEM_STOCKS, stockData);
                    // Buat batch dummy
                    const batchData = {
                        itemId: item.id,
                        warehouseId: warehouses[0].id,
                        batchNumber: 'INITIAL',
                        expiryDate: null,
                        quantity: item.stock,
                        purchasePrice: item.hargaDasar || 0,
                        receivedDate: new Date().toISOString(),
                        notes: 'Migrasi awal'
                    };
                    await dbAdd(STORES.ITEM_BATCHES, batchData);
                }
            }
            await loadItemStocks();
            await loadItemBatches();
        }

        if (users.length > 0 && users.some(u => u.roleId === undefined)) {
            let roles = await dbGetAll(STORES.ROLES);
            if (roles.length === 0) {
                const adminRole = { name: 'Admin', permissions: ALL_MENUS.map(m => m.id) };
                const kasirRole = { name: 'Kasir', permissions: ['menu-transaksi', 'menu-cust'] };
                const adminId = await dbAdd(STORES.ROLES, adminRole);
                const kasirId = await dbAdd(STORES.ROLES, kasirRole);
                roles = [adminRole, kasirRole];
                adminRole.id = adminId;
                kasirRole.id = kasirId;
            }
            const adminRole = roles.find(r => r.name === 'Admin');
            const kasirRole = roles.find(r => r.name === 'Kasir');
            for (let user of users) {
                if (user.roleId === undefined) {
                    if (user.role === 'admin') user.roleId = adminRole.id;
                    else if (user.role === 'kasir') user.roleId = kasirRole.id;
                    else user.roleId = kasirRole.id;
                    await dbPut(STORES.USERS, user);
                }
            }
            await loadUsers();
            await loadRoles();
        }

        const savedUser = sessionStorage.getItem('currentUser');
        if (savedUser) {
            const parsed = JSON.parse(savedUser);
            if (parsed.id === 'bypass') {
                currentUser = { ...parsed, username: 'owner', permissions: ALL_MENUS.map(m => m.id) };
                document.getElementById('login-overlay').style.display = 'none';
                updateSidebarByPermissions(ALL_MENUS.map(m => m.id));
                document.getElementById('user-name-display').textContent = parsed.name;
            } else {
                const user = users.find(u => u.id === parsed.id);
                if (user) {
                    currentUser = user;
                    currentUser.permissions = parsed.permissions || await getUserPermissions(user);
                    document.getElementById('login-overlay').style.display = 'none';
                    updateSidebarByPermissions(currentUser.permissions);
                    document.getElementById('user-name-display').textContent = user.name;
                } else {
                    sessionStorage.removeItem('currentUser');
                    showLoginScreen();
                }
            }
        } else {
            showLoginScreen();
        }

        const printBtn = document.getElementById('print-receipt-btn');
        if (printBtn) {
            printBtn.disabled = false;
        }

        await updateDashboard();

        console.log('App initialized successfully');
    } catch (error) {
        console.error('Error initializing app:', error);
        let errorMessage = 'Gagal memuat aplikasi: ' + error.message;
        if (error.name === 'VersionError') errorMessage = 'Database versi tidak kompatibel. Coba reset aplikasi.';
        else if (error.name === 'InvalidStateError') errorMessage = 'Database dalam state tidak valid. Refresh halaman.';
        else if (error.message.includes('IndexedDB')) errorMessage = 'Browser tidak mendukung IndexedDB. Gunakan Chrome/Edge/Firefox.';
        showError(errorMessage);
    } finally {
        hideLoading();
    }
}

async function retryAppLoad() { await initApp(); }

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', async () => { 
    console.log('DOM fully loaded, initializing app...'); 
    await initApp(); 
});

window.onclick = function(event) {
    if (event.target.classList.contains('modal-overlay')) {
        const modalId = event.target.id;
        if (modalId === 'kasir-category-modal' && typeof closeKasirCategoryModal === 'function') closeKasirCategoryModal();
        else if (modalId === 'kasir-item-modal' && typeof closeKasirItemModal === 'function') closeKasirItemModal();
        else if (modalId === 'list-kasir-category-modal' && typeof closeListKasirCategoryModal === 'function') closeListKasirCategoryModal();
        else if (modalId === 'list-kasir-item-modal' && typeof closeListKasirItemModal === 'function') closeListKasirItemModal();
        else if (modalId === 'list-satuan-modal' && typeof closeListSatuanModal === 'function') closeListSatuanModal();
        else if (modalId === 'satuan-modal' && typeof closeSatuanModal === 'function') closeSatuanModal();
        else if (modalId === 'settings-modal') closeSettingsModal();
        else if (modalId === 'inventory-modal') closeInventoryModal();
        else if (modalId === 'customer-modal' && typeof closeCustomerModal === 'function') closeCustomerModal();
        else if (modalId === 'list-customer-modal' && typeof closeListCustomerModal === 'function') closeListCustomerModal();
        else if (modalId === 'supplier-modal' && typeof closeSupplierModal === 'function') closeSupplierModal();
        else if (modalId === 'list-supplier-modal' && typeof closeListSupplierModal === 'function') closeListSupplierModal();
        else if (modalId === 'select-customer-modal') closeSelectCustomerModal();
        else if (modalId === 'pending-transactions-modal') closePendingTransactionsModal();
        else if (modalId === 'confirm-piutang-modal') closeConfirmPiutangModal();
        else if (modalId === 'pending-code-modal') closePendingCodeModal();
        else if (modalId === 'create-admin-modal') closeCreateAdminModal();
        else if (modalId === 'user-modal') closeUserModal();
        else if (modalId === 'bundle-modal') closeBundleModal();
        else if (modalId === 'select-unit-modal') closeSelectUnitModal();
        else if (modalId === 'select-batch-modal') closeBatchModal();
        else {
            event.target.style.display = 'none';
        }
    }
};

document.addEventListener('visibilitychange', () => { 
    if (!document.hidden) { 
        console.log('Page became visible, refreshing data...'); 
        refreshData(); 
    } 
});
