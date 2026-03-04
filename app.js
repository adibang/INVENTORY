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

// ==================== VARIABEL BARU UNTUK INVENTORI INDUSTRI ====================
let warehouses = [];                // daftar gudang
let itemStocks = [];                // stok per item per gudang (item_stocks)
let itemBatches = [];               // batch per item (item_batches)
let itemSerials = [];               // serial number per item (item_serials)
let stockMovements = [];            // riwayat pergerakan stok
let transfers = [];                 // transfer antar gudang
let stocktakes = [];                // stok opname
let consignments = [];              // konsinyasi
let productions = [];               // produksi
let billOfMaterials = [];            // BOM

// Gudang yang dipilih saat transaksi (default bisa dari localStorage atau pilihan pertama)
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
    // Menu baru
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
function checkBundleStock(bundle, qty, warehouseId) {
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
        // Ambil stok dari gudang yang dipilih
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
const DB_VERSION = 21; // Ditingkatkan ke 21 untuk menambahkan store inventori baru
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
    // Store baru
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

// ==================== DATABASE FUNCTIONS (IndexedDB) ====================
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
            const tx = event.target.transaction;

            // Store lama (tetap)
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
                // Tambahkan properti baru ke item jika perlu
                const store = tx.objectStore(STORES.KASIR_ITEMS);
                store.openCursor().onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        const item = cursor.value;
                        // Tambahkan field untuk tracking batch/serial
                        if (item.trackBatch === undefined) item.trackBatch = false;
                        if (item.trackSerial === undefined) item.trackSerial = false;
                        cursor.update(item);
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

            // ==================== STORE BARU UNTUK INVENTORI INDUSTRI ====================
            // Warehouses
            if (!db.objectStoreNames.contains(STORES.WAREHOUSES)) {
                const warehouseStore = db.createObjectStore(STORES.WAREHOUSES, { keyPath: 'id', autoIncrement: true });
                warehouseStore.createIndex('code', 'code', { unique: true });
            }

            // Item Stocks (per gudang)
            if (!db.objectStoreNames.contains(STORES.ITEM_STOCKS)) {
                const stockStore = db.createObjectStore(STORES.ITEM_STOCKS, { keyPath: 'id', autoIncrement: true });
                stockStore.createIndex('item_warehouse', ['itemId', 'warehouseId'], { unique: true });
            }

            // Item Batches
            if (!db.objectStoreNames.contains(STORES.ITEM_BATCHES)) {
                const batchStore = db.createObjectStore(STORES.ITEM_BATCHES, { keyPath: 'id', autoIncrement: true });
                batchStore.createIndex('item_warehouse', ['itemId', 'warehouseId']);
                batchStore.createIndex('expiry', 'expiryDate');
                batchStore.createIndex('batch', 'batchNumber', { unique: false });
            }

            // Item Serials
            if (!db.objectStoreNames.contains(STORES.ITEM_SERIALS)) {
                const serialStore = db.createObjectStore(STORES.ITEM_SERIALS, { keyPath: 'id', autoIncrement: true });
                serialStore.createIndex('serial', 'serialNumber', { unique: true });
                serialStore.createIndex('status', 'status');
                serialStore.createIndex('item_warehouse', ['itemId', 'warehouseId']);
            }

            // Stock Movements
            if (!db.objectStoreNames.contains(STORES.STOCK_MOVEMENTS)) {
                const movementStore = db.createObjectStore(STORES.STOCK_MOVEMENTS, { keyPath: 'id', autoIncrement: true });
                movementStore.createIndex('itemId', 'itemId');
                movementStore.createIndex('warehouseId', 'warehouseId');
                movementStore.createIndex('date', 'createdAt');
                movementStore.createIndex('reference', ['referenceType', 'referenceId']);
            }

            // Transfers
            if (!db.objectStoreNames.contains(STORES.TRANSFERS)) {
                const transferStore = db.createObjectStore(STORES.TRANSFERS, { keyPath: 'id', autoIncrement: true });
                transferStore.createIndex('number', 'transferNumber', { unique: true });
            }
            if (!db.objectStoreNames.contains(STORES.TRANSFER_ITEMS)) {
                db.createObjectStore(STORES.TRANSFER_ITEMS, { keyPath: 'id', autoIncrement: true });
            }

            // Stocktakes
            if (!db.objectStoreNames.contains(STORES.STOCKTAKES)) {
                const stocktakeStore = db.createObjectStore(STORES.STOCKTAKES, { keyPath: 'id', autoIncrement: true });
                stocktakeStore.createIndex('number', 'stocktakeNumber', { unique: true });
            }
            if (!db.objectStoreNames.contains(STORES.STOCKTAKE_ITEMS)) {
                db.createObjectStore(STORES.STOCKTAKE_ITEMS, { keyPath: 'id', autoIncrement: true });
            }

            // Consignments
            if (!db.objectStoreNames.contains(STORES.CONSIGNMENTS)) {
                const consignmentStore = db.createObjectStore(STORES.CONSIGNMENTS, { keyPath: 'id', autoIncrement: true });
                consignmentStore.createIndex('number', 'consignmentNumber', { unique: true });
            }
            if (!db.objectStoreNames.contains(STORES.CONSIGNMENT_ITEMS)) {
                db.createObjectStore(STORES.CONSIGNMENT_ITEMS, { keyPath: 'id', autoIncrement: true });
            }

            // Bill of Materials
            if (!db.objectStoreNames.contains(STORES.BILL_OF_MATERIALS)) {
                db.createObjectStore(STORES.BILL_OF_MATERIALS, { keyPath: 'id', autoIncrement: true });
            }

            // Productions
            if (!db.objectStoreNames.contains(STORES.PRODUCTIONS)) {
                const productionStore = db.createObjectStore(STORES.PRODUCTIONS, { keyPath: 'id', autoIncrement: true });
                productionStore.createIndex('number', 'productionNumber', { unique: true });
            }
            if (!db.objectStoreNames.contains(STORES.PRODUCTION_ITEMS)) {
                db.createObjectStore(STORES.PRODUCTION_ITEMS, { keyPath: 'id', autoIncrement: true });
            }

            // Migrasi data dari versi lama (jika ada) dilakukan di onupgradeneeded
            // Jika dari versi 20 ke 21, kita perlu memindahkan stok dari kasirItems ke item_stocks
            if (event.oldVersion < 21) {
                // Buat gudang default jika belum ada
                const warehouseStore = tx.objectStore(STORES.WAREHOUSES);
                const itemStore = tx.objectStore(STORES.KASIR_ITEMS);
                const stockStore = tx.objectStore(STORES.ITEM_STOCKS);

                // Buat gudang utama
                warehouseStore.put({ code: 'WH01', name: 'Gudang Utama', location: '', isActive: true });

                // Pindahkan stok dari setiap item ke item_stocks
                itemStore.openCursor().onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        const item = cursor.value;
                        if (item.stock !== undefined) {
                            stockStore.put({
                                itemId: item.id,
                                warehouseId: 1, // ID gudang utama (asumsi autoincrement mulai dari 1)
                                quantity: item.stock,
                                minStock: item.minStock || 5,
                                maxStock: null,
                                reorderPoint: item.minStock || 5,
                                updatedAt: new Date().toISOString()
                            });
                        }
                        cursor.continue();
                    }
                };
            }
        };
    });
}

// Fungsi-fungsi CRUD dasar (dbGetAll, dbGet, dbAdd, dbPut, dbDelete, dbClear) tetap sama seperti sebelumnya.
// (Saya tidak akan menulis ulang semuanya karena panjang, tetapi pastikan semuanya ada)

// ... (sisanya dari app.js lama, seperti dbGetAll, dbAdd, dll.) ...

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

// ==================== FUNGSI SETTINGS MODAL (tetap sama) ====================
// ... (tidak diubah, karena pengaturan tidak terkait inventori) ...

// ==================== TAMBAHAN: EXPORT/IMPORT HARGA ====================
// ... (tetap sama) ...

// ==================== FUNGSI TOGGLE PASSWORD ====================
// ... (tetap sama) ...

// ==================== FUNGSI BARU UNTUK LOAD DATA INVENTORI ====================
async function loadWarehouses() {
    try {
        warehouses = await dbGetAll(STORES.WAREHOUSES);
        warehouses.sort((a,b) => a.name.localeCompare(b.name));
        // Perbarui dropdown gudang di halaman transaksi
        renderWarehouseSelect();
        // Set selectedWarehouseId ke gudang pertama jika belum dipilih
        if (warehouses.length > 0 && !selectedWarehouseId) {
            selectedWarehouseId = warehouses[0].id;
            // Simpan ke localStorage untuk persistensi
            localStorage.setItem('selectedWarehouseId', selectedWarehouseId);
        }
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

// Fungsi untuk mendapatkan stok item di gudang tertentu
function getItemStock(itemId, warehouseId) {
    const stock = itemStocks.find(s => s.itemId === itemId && s.warehouseId === warehouseId);
    return stock ? stock.quantity : 0;
}

// Fungsi untuk mendapatkan daftar batch yang masih tersedia di gudang tertentu
function getAvailableBatches(itemId, warehouseId) {
    return itemBatches.filter(b => b.itemId === itemId && b.warehouseId === warehouseId && b.quantity > 0);
}

// Fungsi untuk mendapatkan daftar serial yang masih tersedia di gudang tertentu
function getAvailableSerials(itemId, warehouseId) {
    return itemSerials.filter(s => s.itemId === itemId && s.warehouseId === warehouseId && s.status === 'available');
}

// Fungsi untuk mencatat pergerakan stok
async function addStockMovement(movement) {
    const now = new Date().toISOString();
    const data = {
        ...movement,
        createdAt: now
    };
    const id = await dbAdd(STORES.STOCK_MOVEMENTS, data);
    data.id = id;
    stockMovements.push(data);
    return data;
}

// Fungsi untuk memperbarui stok item di gudang (tambah/kurang)
async function updateItemStock(itemId, warehouseId, quantityChange, movementDetails) {
    // Cari record stok yang ada
    let stock = itemStocks.find(s => s.itemId === itemId && s.warehouseId === warehouseId);
    if (!stock) {
        // Buat baru jika belum ada (misal untuk transfer masuk atau pembelian pertama)
        stock = {
            itemId,
            warehouseId,
            quantity: 0,
            minStock: 5,
            maxStock: null,
            reorderPoint: 5,
            updatedAt: new Date().toISOString()
        };
        const id = await dbAdd(STORES.ITEM_STOCKS, stock);
        stock.id = id;
        itemStocks.push(stock);
    }
    stock.quantity += quantityChange;
    if (stock.quantity < 0) {
        console.warn('Stok negatif!', stock);
        // Bisa throw error atau handle sesuai kebijakan
    }
    stock.updatedAt = new Date().toISOString();
    await dbPut(STORES.ITEM_STOCKS, stock);

    // Catat pergerakan stok
    await addStockMovement({
        movementType: movementDetails.type,
        itemId,
        warehouseId,
        quantity: quantityChange,
        referenceId: movementDetails.referenceId,
        referenceType: movementDetails.referenceType,
        batchId: movementDetails.batchId,
        serialId: movementDetails.serialId,
        unitCost: movementDetails.unitCost,
        notes: movementDetails.notes
    });
}

// ==================== RENDER DROPDOWN GUDANG DI TRANSAKSI ====================
function renderWarehouseSelect() {
    const select = document.getElementById('warehouse-select');
    if (!select) return;
    let options = '<option value="">-- Pilih Gudang --</option>';
    warehouses.forEach(w => {
        const selected = (w.id === selectedWarehouseId) ? 'selected' : '';
        options += `<option value="${w.id}" ${selected}>${w.name}</option>`;
    });
    select.innerHTML = options;

    // Event listener untuk perubahan
    select.onchange = function(e) {
        selectedWarehouseId = parseInt(e.target.value);
        localStorage.setItem('selectedWarehouseId', selectedWarehouseId);
        // Refresh tampilan produk jika perlu (misal stok berubah)
        if (document.getElementById('transaksi-page').style.display === 'block') {
            renderProductList(currentFilteredItems);
        }
    };
}

// ==================== FUNGSI PILIH BATCH / SERIAL ====================
let pendingAddToCartCallback = null; // Untuk menyimpan callback setelah memilih batch/serial

function openSelectBatchModal(item, qty, unitConversion, weightGram, callback) {
    const warehouseId = selectedWarehouseId;
    if (!warehouseId) {
        showNotification('Pilih gudang terlebih dahulu', 'warning');
        return;
    }
    const batches = getAvailableBatches(item.id, warehouseId);
    const serials = getAvailableSerials(item.id, warehouseId);

    if (item.trackBatch && batches.length === 0 && item.trackSerial && serials.length === 0) {
        showNotification('Tidak ada batch/serial tersedia untuk item ini', 'error');
        return;
    }

    const modal = document.getElementById('select-batch-modal');
    const container = document.getElementById('select-batch-list');
    let html = '';

    if (item.trackBatch) {
        html += '<h4>Pilih Batch</h4>';
        batches.forEach(batch => {
            html += `
                <div style="border:1px solid #ddd; border-radius:10px; padding:10px; margin-bottom:10px;">
                    <div><strong>Batch: ${batch.batchNumber}</strong></div>
                    <div>Expiry: ${batch.expiryDate || '-'}</div>
                    <div>Stok: ${batch.quantity}</div>
                    <button class="form-button-primary select-batch-btn" data-batch-id="${batch.id}" data-serial-id="">Pilih Batch Ini</button>
                </div>
            `;
        });
    }

    if (item.trackSerial) {
        html += '<h4>Pilih Serial Number</h4>';
        serials.forEach(serial => {
            html += `
                <div style="border:1px solid #ddd; border-radius:10px; padding:10px; margin-bottom:10px;">
                    <div><strong>Serial: ${serial.serialNumber}</strong></div>
                    <button class="form-button-primary select-serial-btn" data-batch-id="" data-serial-id="${serial.id}">Pilih Serial Ini</button>
                </div>
            `;
        });
    }

    container.innerHTML = html;
    modal.style.display = 'flex';

    // Event listener untuk tombol pilih
    container.querySelectorAll('.select-batch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const batchId = parseInt(btn.dataset.batchId);
            callback(batchId, null);
            closeSelectBatchModal();
        });
    });
    container.querySelectorAll('.select-serial-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const serialId = parseInt(btn.dataset.serialId);
            callback(null, serialId);
            closeSelectBatchModal();
        });
    });
}

function closeSelectBatchModal() {
    document.getElementById('select-batch-modal').style.display = 'none';
}

// ==================== FUNGSI TRANSAKSI KASIR (MODIFIKASI) ====================
function openTransaksiPage() {
    document.querySelector('.main-content').style.display = 'none';
    document.getElementById('transaksi-page').style.display = 'block';
    document.getElementById('cart-page').style.display = 'none';
    document.getElementById('payment-page').style.display = 'none';
    
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

// Fungsi addToCart yang dimodifikasi untuk menerima batchId dan serialId
function addToCart(item, qty, unitConversion, weightGram, batchId = null, serialId = null) {
    if (!selectedWarehouseId) {
        showNotification('Pilih gudang terlebih dahulu', 'warning');
        return;
    }

    // Cek stok
    let requiredStock;
    if (weightGram > 0) {
        requiredStock = qty;
    } else if (unitConversion) {
        requiredStock = qty * unitConversion.value;
    } else {
        requiredStock = qty;
    }

    // Jika item dilacak batch/serial, pastikan batch/serial dipilih
    if (item.trackBatch && !batchId) {
        // Tampilkan modal pilih batch
        openSelectBatchModal(item, qty, unitConversion, weightGram, (batchId, serialId) => {
            addToCart(item, qty, unitConversion, weightGram, batchId, serialId);
        });
        return;
    }
    if (item.trackSerial && !serialId) {
        openSelectBatchModal(item, qty, unitConversion, weightGram, (batchId, serialId) => {
            addToCart(item, qty, unitConversion, weightGram, batchId, serialId);
        });
        return;
    }

    const stock = getItemStock(item.id, selectedWarehouseId);
    if (stock < requiredStock) {
        showNotification(`Stok ${item.name} di gudang ini tidak cukup. Tersedia: ${stock}`, 'error');
        return;
    }

    let pricePerUnit;
    if (unitConversion) {
        pricePerUnit = unitConversion.sellPrice;
    } else if (weightGram > 0) {
        pricePerUnit = getPriceForQty(item, qty);
    } else {
        pricePerUnit = getPriceForQty(item, qty);
    }

    // Cek apakah item dengan batch/serial yang sama sudah ada di keranjang
    const existingIndex = cart.findIndex(c => 
        c.item.id === item.id && 
        c.unitConversion?.barcode === unitConversion?.barcode &&
        c.weightGram === weightGram &&
        c.batchId === batchId &&
        c.serialId === serialId
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
            serialId
        });
    }
    renderCartPage();
    saveCartToLocalStorage();
}

// Proses barcode (sama, tetapi perlu menyesuaikan dengan gudang)
function processBarcode() {
    const input = document.getElementById('barcode-input');
    const barcode = input.value.trim();
    if (!barcode) return;

    console.log('Processing barcode:', barcode);
    const barcodeLower = barcode.toLowerCase();

    // Cari item berdasarkan kode atau barcode
    let item = kasirItems.find(i => 
        (i.code && i.code.toLowerCase() === barcodeLower) || 
        (i.barcode && i.barcode.toLowerCase() === barcodeLower)
    );

    if (item) {
        addToCart(item, 1, null, 0);
        input.value = '';
        filterProductList('');
        return;
    }

    // Cari di konversi satuan
    for (let it of kasirItems) {
        if (it.unitConversions && Array.isArray(it.unitConversions)) {
            const conv = it.unitConversions.find(c => 
                c.barcode && c.barcode.toLowerCase() === barcodeLower
            );
            if (conv) {
                addToCart(it, 1, conv, 0);
                input.value = '';
                filterProductList('');
                return;
            }
        }
    }

    // Jika barcode 13 digit (format timbangan)
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
                addToCart(item, qtyKg, null, weightGram);
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

// ==================== FUNGSI LAINNYA (customer, cart, payment, dll.) ====================
// ... (fungsi-fungsi seperti openSelectCustomerModal, selectCustomer, renderCartPage, removeFromCart, openPaymentPage, updatePaymentSummary, processPayment, executePayment, dll. perlu dimodifikasi untuk menyertakan warehouseId, batchId, serialId di cart dan saat mengurangi stok)

// ==================== FUNGSI EKSEKUSI PEMBAYARAN (MODIFIKASI) ====================
async function executePayment(paidTotal, outstandingAdded) {
    console.log('executePayment dimulai, paidTotal:', paidTotal, 'outstandingAdded:', outstandingAdded);
    try {
        showLoading('Memproses pembayaran...');

        const total = cart.reduce((sum, c) => sum + c.subtotal, 0);
        let shortage = total - paidTotal;
        if (shortage < 0) shortage = 0;
        outstandingAdded = shortage;

        // 1. Kurangi stok dari gudang dan batch/serial yang sesuai
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
                    // Kurangi stok di gudang yang sama dengan bundle? Untuk bundle, kita perlu menentukan gudang asal.
                    // Asumsikan bundle menggunakan gudang yang sama dengan item bundle di keranjang.
                    const warehouseId = c.warehouseId;
                    await updateItemStock(item.id, warehouseId, -needed, {
                        type: 'sale',
                        referenceId: null, // akan diisi setelah sales tersimpan
                        referenceType: 'sale',
                        batchId: null, // untuk komponen, kita tidak melacak batch? bisa disesuaikan
                        serialId: null,
                        unitCost: item.hargaDasar || 0,
                        notes: 'Penjualan bundle'
                    });
                }
            } else {
                let requiredStock;
                if (c.weightGram > 0) requiredStock = c.qty;
                else if (c.unitConversion) requiredStock = c.qty * c.unitConversion.value;
                else requiredStock = c.qty;

                await updateItemStock(c.item.id, c.warehouseId, -requiredStock, {
                    type: 'sale',
                    referenceId: null,
                    referenceType: 'sale',
                    batchId: c.batchId,
                    serialId: c.serialId,
                    unitCost: c.unitConversion?.basePrice || c.item.hargaDasar || 0,
                    notes: 'Penjualan'
                });

                // Jika ada serial, tandai sebagai sold
                if (c.serialId) {
                    const serial = itemSerials.find(s => s.id === c.serialId);
                    if (serial) {
                        serial.status = 'sold';
                        serial.soldPrice = c.pricePerUnit;
                        serial.saleId = null; // nanti diisi
                        serial.updatedAt = new Date().toISOString();
                        await dbPut(STORES.ITEM_SERIALS, serial);
                    }
                }
            }
        }

        // 2. Update piutang dari item outstanding di keranjang (sama seperti sebelumnya)
        // ... (kode yang sama)

        // 3. Tambah piutang baru jika ada shortage
        // ... (sama)

        // 4. Kumpulkan data pembayaran
        // ... (sama)

        const transactionNumber = await generateTransactionNumber();

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
        console.log('Data penjualan disimpan dengan ID:', saleId);

        // Update referenceId di stock movements
        for (let movement of stockMovements.slice(-cart.length)) {
            if (movement.referenceType === 'sale' && !movement.referenceId) {
                movement.referenceId = saleId;
                await dbPut(STORES.STOCK_MOVEMENTS, movement);
            }
        }

        // Update serial dengan saleId
        for (let c of cart) {
            if (c.serialId) {
                const serial = itemSerials.find(s => s.id === c.serialId);
                if (serial) {
                    serial.saleId = saleId;
                    await dbPut(STORES.ITEM_SERIALS, serial);
                }
            }
        }

        // Simpan data struk
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

        // Kosongkan keranjang
        cart = [];
        selectedCustomer = null;
        document.getElementById('customer-badge').style.display = 'none';

        renderCartPage();
        saveCartToLocalStorage();
        resetPaymentPage();

        await loadKasirItems(); // reload data item (tapi stok sudah diupdate via itemStocks)
        await loadItemStocks(); // reload stok
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

// ==================== FUNGSI PEMBELIAN (MODIFIKASI) ====================
// Di pembelian.html, kita perlu mengubah fungsi savePurchase agar menyimpan batch, serial, dan gudang.
// Namun karena pembelian.html terpisah, modifikasi akan dilakukan di file tersebut.
// Di sini kita hanya perlu memastikan bahwa fungsi-fungsi pendukung (seperti updateItemStock, addStockMovement) tersedia.

// ==================== FUNGSI DASHBOARD (MODIFIKASI) ====================
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

        // Hitung stok menipis berdasarkan itemStocks
        const lowStockItems = itemStocks.filter(s => s.quantity < (s.minStock || 5));
        const lowStockCount = lowStockItems.length;
        const lowStockEl = document.getElementById('low-stock-count');
        if (lowStockEl) lowStockEl.textContent = lowStockCount;

        renderNotifications(lowStockItems);
        renderSalesChart(todaySales);
        renderPendingList();
    } catch (error) {
        console.error('Error updating dashboard:', error);
    }
}

// ==================== FUNGSI LOAD DATA UTAMA (MODIFIKASI) ====================
async function loadAllData() {
    await loadKasirCategories();
    await loadKasirItems();
    await loadKasirSatuan();
    await loadCustomers();
    await loadSuppliers();
    await loadPendingTransactions();
    await loadBundles();
    await loadUsers();
    await loadRoles();
    // Data baru
    await loadWarehouses();
    await loadItemStocks();
    await loadItemBatches();
    await loadItemSerials();
    // Muat juga data transfer, opname, dll. jika diperlukan
}

// ==================== INISIALISASI APLIKASI (MODIFIKASI) ====================
async function initApp() {
    try {
        console.log('Starting app initialization...');
        showLoading();
        hideError();
        await initDatabase();
        await loadBarcodeConfig();
        await loadReceiptConfig();
        await loadAllData(); // memuat semua data termasuk inventori

        // Muat selectedWarehouseId dari localStorage
        const savedWarehouse = localStorage.getItem('selectedWarehouseId');
        if (savedWarehouse && warehouses.some(w => w.id == savedWarehouse)) {
            selectedWarehouseId = parseInt(savedWarehouse);
        } else if (warehouses.length > 0) {
            selectedWarehouseId = warehouses[0].id;
        }

        currentFilteredItems = [...kasirItems];

        await loadCartFromLocalStorage();
        await autoReconnectPrinter();

        // Cek session user
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

        // Pastikan tombol print selalu aktif
        const printBtn = document.getElementById('print-receipt-btn');
        if (printBtn) {
            printBtn.disabled = false;
        }

        await updateDashboard();

        console.log('App initialized successfully');
    } catch (error) {
        console.error('Error initializing app:', error);
        let errorMessage = 'Gagal memuat aplikasi: ' + error.message;
        showError(errorMessage);
    } finally {
        hideLoading();
    }
}

// ==================== FUNGSI RETRY ====================
async function retryAppLoad() { await initApp(); }

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', async () => { 
    console.log('DOM fully loaded, initializing app...'); 
    await initApp(); 
});

window.onclick = function(event) {
    if (event.target.classList.contains('modal-overlay')) {
        const modalId = event.target.id;
        // Tutup modal berdasarkan id (sama seperti sebelumnya, tambahkan select-batch-modal)
        if (modalId === 'select-batch-modal') closeSelectBatchModal();
        else if (modalId === 'select-unit-modal') closeSelectUnitModal();
        else if (modalId === 'bundle-modal') closeBundleModal();
        else if (modalId === 'user-modal') closeUserModal();
        else if (modalId === 'create-admin-modal') closeCreateAdminModal();
        else if (modalId === 'pending-code-modal') closePendingCodeModal();
        else if (modalId === 'confirm-piutang-modal') closeConfirmPiutangModal();
        else if (modalId === 'pending-transactions-modal') closePendingTransactionsModal();
        else if (modalId === 'inventory-modal') closeInventoryModal();
        else if (modalId === 'settings-modal') closeSettingsModal();
        else if (modalId === 'select-customer-modal') closeSelectCustomerModal();
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

// ==================== EXPOSE FUNGSI KE GLOBAL ====================
window.toggleDrawer = toggleDrawer;
window.closeDrawer = closeDrawer;
window.toggleSubMenu = toggleSubMenu;
window.closeSubMenu = closeSubMenu;
window.logout = logout;
window.bypassLogin = bypassLogin;
window.openCreateAdminModal = openCreateAdminModal;
window.closeCreateAdminModal = closeCreateAdminModal;
window.saveFirstAdmin = saveFirstAdmin;
window.showSettingsModal = showSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.exportData = exportData;
window.importData = importData;
window.clearAllData = clearAllData;
window.forceResetDatabase = forceResetDatabase;
window.exportPrices = exportPrices;
window.importPrices = importPrices;
window.openAddUserModal = openAddUserModal;
window.openEditUserModal = openEditUserModal;
window.closeUserModal = closeUserModal;
window.saveUser = saveUser;
window.deleteUser = deleteUser;
window.togglePasswordVisibility = togglePasswordVisibility;
window.openTransaksiPage = openTransaksiPage;
window.closeTransaksiPage = closeTransaksiPage;
window.setProductViewMode = setProductViewMode;
window.filterProductList = filterProductList;
window.processBarcode = processBarcode;
window.openSelectCustomerModal = openSelectCustomerModal;
window.closeSelectCustomerModal = closeSelectCustomerModal;
window.selectCustomer = selectCustomer;
window.openCartPage = openCartPage;
window.closeCartPage = closeCartPage;
window.removeFromCart = removeFromCart;
window.addOutstandingToCart = addOutstandingToCart;
window.openPaymentPage = openPaymentPage;
window.closePaymentPage = closePaymentPage;
window.updatePaymentSummary = updatePaymentSummary;
window.processPayment = processPayment;
window.processPaymentWithPiutang = processPaymentWithPiutang;
window.closeConfirmPiutangModal = closeConfirmPiutangModal;
window.printReceipt = printReceipt;
window.togglePrinter = togglePrinter;
window.openInventoryStokModal = openInventoryStokModal;
window.openInventoryOpnameModal = openInventoryOpnameModal;
window.openInventoryLaporanModal = openInventoryLaporanModal;
window.closeInventoryModal = closeInventoryModal;
window.updateStock = updateStock;
window.openPendingTransactionsModal = openPendingTransactionsModal;
window.closePendingTransactionsModal = closePendingTransactionsModal;
window.loadPendingTransaction = loadPendingTransaction;
window.deletePendingTransactionPrompt = deletePendingTransactionPrompt;
window.saveDraftTransaction = saveDraftTransaction;
window.closePendingCodeModal = closePendingCodeModal;
window.confirmSaveDraft = confirmSaveDraft;
window.validatePendingCode = validatePendingCode;
window.goHome = goHome;
window.openLaporanPage = openLaporanPage;
window.openPembelianPage = openPembelianPage;
window.openDriveBackupPage = openDriveBackupPage;
window.closeDriveBackupPage = closeDriveBackupPage;
window.openBundleModal = openBundleModal;
window.closeBundleModal = closeBundleModal;
window.addBundleToCart = addBundleToCart;
window.closeSelectUnitModal = closeSelectUnitModal;
window.addToCartWithUnit = addToCartWithUnit;
// Fungsi baru
window.onWarehouseChange = function() {
    const select = document.getElementById('warehouse-select');
    selectedWarehouseId = parseInt(select.value);
    localStorage.setItem('selectedWarehouseId', selectedWarehouseId);
    renderProductList(currentFilteredItems);
};
window.closeSelectBatchModal = closeSelectBatchModal;

// ==================== AKHIR FILE ====================
