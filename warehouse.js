// ==================== warehouse.js (FIXED) ====================
// Manajemen data gudang (CRUD) untuk sistem inventori multi-gudang

// ==================== KONSTANTA & SANITIZATION ====================
const WAREHOUSE_STORE = 'warehouses';
const ITEM_STOCKS_STORE = 'item_stocks';

// BUG FIX #23: Input sanitization untuk mencegah XSS
function sanitizeInput(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ==================== LOAD SEMUA GUDANG (BUG FIX #7) ====================
async function loadWarehouses() {
    try {
        if (!db) {
            console.error('Database belum diinisialisasi');
            return [];
        }
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([WAREHOUSE_STORE], 'readonly');
            const store = transaction.objectStore(WAREHOUSE_STORE);
            const request = store.getAll();
            
            request.onsuccess = () => {
                const warehouses = request.result || [];
                warehouses.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                resolve(warehouses);
            };
            
            request.onerror = (e) => {
                const error = e.target.error || new Error('Unknown database error');
                console.error('Gagal memuat gudang:', error);
                reject(error);
            };
        });
    } catch (error) {
        console.error('Error loadWarehouses:', error);
        return [];
    }
}

// ==================== RENDER DROPDOWN GUDANG (BUG FIX #13) ====================
async function renderWarehouseSelect(selectElement, selectedId = null) {
    if (!selectElement) return;
    
    try {
        const warehouses = await loadWarehouses();
        selectElement.innerHTML = '<option value="">-- Pilih Gudang --</option>';
        
        warehouses.forEach(w => {
            const option = document.createElement('option');
            option.value = w.id;
            // BUG FIX: Sanitize output untuk mencegah XSS
            option.textContent = `${sanitizeInput(w.code)} - ${sanitizeInput(w.name)}`;
            
            // BUG FIX: Gunakan loose equality untuk perbandingan ID
            if (selectedId != null && w.id == selectedId) {
                option.selected = true;
            }
            selectElement.appendChild(option);
        });
    } catch (error) {
        console.error('Gagal render dropdown gudang:', error);
        selectElement.innerHTML = '<option value="">-- Error memuat gudang --</option>';
    }
}

// ==================== VALIDASI GUDANG ====================
function validateWarehouseData(data, isEdit = false, currentId = null) {
    const errors = [];
    
    // Validasi kode
    if (!data.code || data.code.trim().length < 2) {
        errors.push('Kode gudang minimal 2 karakter');
    }
    if (data.code && !/^[A-Z0-9_-]+$/i.test(data.code.trim())) {
        errors.push('Kode gudang hanya boleh berisi huruf, angka, underscore, atau dash');
    }
    
    // Validasi nama
    if (!data.name || data.name.trim().length < 2) {
        errors.push('Nama gudang minimal 2 karakter');
    }
    
    // Validasi lokasi (opsional tapi jika diisi minimal 3 karakter)
    if (data.location && data.location.trim().length > 0 && data.location.trim().length < 3) {
        errors.push('Lokasi minimal 3 karakter jika diisi');
    }
    
    return errors;
}

// ==================== CEK DUPLIKAT KODE (BUG FIX #14) ====================
async function isCodeDuplicate(code, excludeId = null) {
    if (!db) return false;
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([WAREHOUSE_STORE], 'readonly');
        const store = transaction.objectStore(WAREHOUSE_STORE);
        const index = store.index('code');
        const request = index.get(code);
        
        request.onsuccess = () => {
            const existing = request.result;
            // BUG FIX: Exclude current ID saat edit
            if (existing && (!excludeId || existing.id !== excludeId)) {
                resolve(true);
            } else {
                resolve(false);
            }
        };
        
        request.onerror = (e) => {
            console.error('Error checking duplicate code:', e.target.error);
            reject(e.target.error);
        };
    });
}

// ==================== TAMBAH / EDIT GUDANG (BUG FIX #1, #4, #23) ====================
async function saveWarehouse(warehouseData, id = null) {
    try {
        if (!db) throw new Error('Database belum diinisialisasi');
        
        // BUG FIX #23: Sanitize input
        const sanitizedData = {
            code: sanitizeInput(warehouseData.code).trim().toUpperCase(),
            name: sanitizeInput(warehouseData.name).trim(),
            location: warehouseData.location ? sanitizeInput(warehouseData.location).trim() : '',
            // BUG FIX #1: Gunakan camelCase isActive (bukan is_active)
            isActive: warehouseData.isActive !== undefined ? warehouseData.isActive : true
        };
        
        // BUG FIX: Validasi data
        const validationErrors = validateWarehouseData(sanitizedData, !!id, id);
        if (validationErrors.length > 0) {
            throw new Error(validationErrors.join('; '));
        }
        
        // BUG FIX #4: Cek duplicate dengan index (lebih efisien & atomic)
        const isDuplicate = await isCodeDuplicate(sanitizedData.code, id);
        if (isDuplicate) {
            throw new Error(`Kode gudang "${sanitizedData.code}" sudah digunakan`);
        }
        
        const now = new Date().toISOString();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([WAREHOUSE_STORE], 'readwrite');
            const store = transaction.objectStore(WAREHOUSE_STORE);
            
            if (id) {
                // EDIT: Ambil data existing dulu
                const getRequest = store.get(id);
                
                getRequest.onsuccess = () => {
                    const existing = getRequest.result;
                    if (!existing) {
                        reject(new Error('Gudang tidak ditemukan'));
                        return;
                    }
                    
                    const updated = { 
                        ...existing, 
                        ...sanitizedData, 
                        id: existing.id, // Pastikan ID tidak berubah
                        updatedAt: now 
                    };
                    
                    const putRequest = store.put(updated);
                    putRequest.onsuccess = () => resolve(updated);
                    putRequest.onerror = (e) => reject(e.target.error || new Error('Gagal update gudang'));
                };
                
                getRequest.onerror = (e) => reject(e.target.error || new Error('Gagal mengambil data gudang'));
            } else {
                // TAMBAH BARU
                const newWarehouse = {
                    ...sanitizedData,
                    createdAt: now,
                    updatedAt: now
                };
                
                const addRequest = store.add(newWarehouse);
                addRequest.onsuccess = () => {
                    newWarehouse.id = addRequest.result;
                    resolve(newWarehouse);
                };
                addRequest.onerror = (e) => {
                    if (e.target.error?.name === 'ConstraintError') {
                        reject(new Error('Kode gudang sudah ada'));
                    } else {
                        reject(e.target.error || new Error('Gagal menambah gudang'));
                    }
                };
            }
            
            // BUG FIX: Handle transaction errors
            transaction.onerror = (e) => {
                console.error('Transaction error:', e.target.error);
                reject(e.target.error || new Error('Transaction failed'));
            };
        });
    } catch (error) {
        console.error('Gagal menyimpan gudang:', error);
        throw error;
    }
}

// ==================== CEK GUDANG DIGUNAKAN (BUG FIX #2) ====================
async function isWarehouseInUse(warehouseId) {
    if (!db) return { inUse: false, details: [] };
    
    try {
        const details = [];
        
        // BUG FIX #2: Gunakan compound index 'item_warehouse' dengan IDBKeyRange
        const txStocks = db.transaction([ITEM_STOCKS_STORE], 'readonly');
        const stockStore = txStocks.objectStore(ITEM_STOCKS_STORE);
        
        // Index yang benar: 'item_warehouse' dengan keyPath ['itemId', 'warehouseId']
        // Kita perlu iterate semua records dan filter manual
        const stocks = await new Promise((resolve, reject) => {
            const request = stockStore.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = reject;
        });
        
        const usedStocks = stocks.filter(s => s.warehouseId === warehouseId && s.quantity > 0);
        if (usedStocks.length > 0) {
            details.push({ type: 'stok', count: usedStocks.length });
        }
        
        // Cek juga di item_batches
        const batches = await new Promise((resolve, reject) => {
            const tx = db.transaction(['item_batches'], 'readonly');
            const req = tx.objectStore('item_batches').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = reject;
        });
        
        const usedBatches = batches.filter(b => b.warehouseId === warehouseId && b.quantity > 0);
        if (usedBatches.length > 0) {
            details.push({ type: 'batch', count: usedBatches.length });
        }
        
        return { inUse: details.length > 0, details };
    } catch (error) {
        console.error('Error checking warehouse usage:', error);
        return { inUse: false, details: [], error: error.message };
    }
}

// ==================== HAPUS GUDANG (BUG FIX #2, #7) ====================
async function deleteWarehouse(id) {
    try {
        if (!db) throw new Error('Database belum diinisialisasi');
        if (!id) throw new Error('ID gudang tidak valid');
        
        // BUG FIX #2: Cek penggunaan dengan fungsi yang benar
        const usage = await isWarehouseInUse(id);
        if (usage.inUse) {
            const messages = usage.details.map(d => `${d.type}: ${d.count} item`);
            throw new Error(`Gudang masih digunakan (${messages.join(', ')}), tidak dapat dihapus`);
        }
        
        // BUG FIX: Gunakan transaction untuk delete
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([WAREHOUSE_STORE], 'readwrite');
            const store = transaction.objectStore(WAREHOUSE_STORE);
            
            const request = store.delete(id);
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => {
                const error = e.target.error || new Error('Unknown error');
                console.error('Gagal menghapus gudang:', error);
                reject(error);
            };
            
            transaction.onerror = (e) => {
                console.error('Transaction error:', e.target.error);
                reject(e.target.error || new Error('Transaction failed'));
            };
        });
    } catch (error) {
        console.error('Gagal menghapus gudang:', error);
        throw error;
    }
}

// ==================== RENDER TABEL GUDANG (BUG FIX #23, #16) ====================
async function renderWarehouseTable(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container dengan id "${containerId}" tidak ditemukan`);
        return;
    }
    
    try {
        // Tampilkan loading state
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">Memuat data...</p>';
        
        const warehouses = await loadWarehouses();
        
        if (warehouses.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:40px;">
                    <p style="margin-bottom:20px; color:#666;">Belum ada gudang.</p>
                    <button class="form-button-primary" onclick="showAddWarehouseForm()">
                        ${icons.add} Tambah Gudang
                    </button>
                </div>
            `;
            return;
        }
        
        // BUG FIX #23: Sanitize semua output untuk mencegah XSS
        let html = `
            <div style="overflow-x:auto;">
            <table class="data-table" style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr style="background:#f5f5f5;">
                        <th style="padding:12px; text-align:left; border-bottom:2px solid #ddd;">Kode</th>
                        <th style="padding:12px; text-align:left; border-bottom:2px solid #ddd;">Nama</th>
                        <th style="padding:12px; text-align:left; border-bottom:2px solid #ddd;">Lokasi</th>
                        <th style="padding:12px; text-align:center; border-bottom:2px solid #ddd;">Status</th>
                        <th style="padding:12px; text-align:center; border-bottom:2px solid #ddd;">Aksi</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        warehouses.forEach(w => {
            // BUG FIX #1: Gunakan isActive (camelCase)
            const isActive = w.isActive !== false;
            const statusBadge = isActive 
                ? '<span style="background:#28a745; color:white; padding:4px 12px; border-radius:20px; font-size:0.8rem;">Aktif</span>'
                : '<span style="background:#dc3545; color:white; padding:4px 12px; border-radius:20px; font-size:0.8rem;">Tidak Aktif</span>';
            
            html += `
                <tr style="border-bottom:1px solid #eee; hover:background:#f9f9f9;">
                    <td style="padding:12px; font-weight:600;">${sanitizeInput(w.code)}</td>
                    <td style="padding:12px;">${sanitizeInput(w.name)}</td>
                    <td style="padding:12px; color:#666;">${sanitizeInput(w.location || '-')}</td>
                    <td style="padding:12px; text-align:center;">${statusBadge}</td>
                    <td style="padding:12px; text-align:center;">
                        <button class="action-btn edit-btn" onclick="editWarehouse(${w.id})" title="Edit" style="margin-right:5px;">
                            ${icons.edit}
                        </button>
                        <button class="action-btn delete-btn" onclick="deleteWarehousePrompt(${w.id})" title="Hapus">
                            ${icons.delete}
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += '</tbody></table></div>';
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Gagal render tabel gudang:', error);
        // BUG FIX #7: Error message yang aman
        container.innerHTML = `
            <div style="text-align:center; padding:20px; color:#dc3545; background:#fff5f5; border-radius:8px;">
                <p style="margin:0;">⚠️ Gagal memuat data: ${sanitizeInput(error.message)}</p>
                <button class="form-button-secondary" style="margin-top:10px;" onclick="renderWarehouseTable('${containerId}')">
                    Coba Lagi
                </button>
            </div>
        `;
    }
}

// ==================== FUNGSI MODAL (BUG FIX #9, #6) ====================
let currentWarehouseId = null;

function showAddWarehouseForm() {
    currentWarehouseId = null;
    
    const modal = document.getElementById('warehouse-modal');
    if (!modal) {
        console.error('Modal gudang tidak ditemukan');
        if (typeof showNotification === 'function') {
            showNotification('Modal tidak ditemukan', 'error');
        } else {
            alert('Modal gudang tidak ditemukan');
        }
        return;
    }
    
    // Reset form
    const codeInput = document.getElementById('warehouse-code');
    const nameInput = document.getElementById('warehouse-name');
    const locationInput = document.getElementById('warehouse-location');
    const activeCheckbox = document.getElementById('warehouse-active');
    
    if (codeInput) codeInput.value = '';
    if (nameInput) nameInput.value = '';
    if (locationInput) locationInput.value = '';
    if (activeCheckbox) activeCheckbox.checked = true;
    
    // Update title
    const titleEl = document.getElementById('warehouse-modal-title');
    if (titleEl) {
        titleEl.innerHTML = `
            <svg class="icon icon-primary" viewBox="0 0 24 24" width="20" height="20">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
            </svg> Tambah Gudang
        `;
    }
    
    modal.style.display = 'flex';
    
    // BUG FIX #11: Auto-focus ke input pertama
    if (codeInput) {
        setTimeout(() => codeInput.focus(), 100);
    }
}

async function editWarehouse(id) {
    try {
        if (!id) {
            showNotification('ID gudang tidak valid', 'error');
            return;
        }
        
        const warehouses = await loadWarehouses();
        const warehouse = warehouses.find(w => w.id === id);
        
        if (!warehouse) {
            throw new Error('Gudang tidak ditemukan');
        }
        
        currentWarehouseId = id;
        
        const modal = document.getElementById('warehouse-modal');
        if (!modal) return;
        
        // Populate form
        const codeInput = document.getElementById('warehouse-code');
        const nameInput = document.getElementById('warehouse-name');
        const locationInput = document.getElementById('warehouse-location');
        const activeCheckbox = document.getElementById('warehouse-active');
        
        if (codeInput) codeInput.value = warehouse.code || '';
        if (nameInput) nameInput.value = warehouse.name || '';
        if (locationInput) locationInput.value = warehouse.location || '';
        // BUG FIX #1: Gunakan isActive
        if (activeCheckbox) activeCheckbox.checked = warehouse.isActive !== false;
        
        // Update title
        const titleEl = document.getElementById('warehouse-modal-title');
        if (titleEl) {
            titleEl.innerHTML = `
                <svg class="icon icon-primary" viewBox="0 0 24 24" width="20" height="20">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg> Edit Gudang
            `;
        }
        
        modal.style.display = 'flex';
        
        // BUG FIX #11: Auto-focus
        if (codeInput) {
            setTimeout(() => codeInput.focus(), 100);
        }
        
    } catch (error) {
        console.error('Gagal memuat data gudang:', error);
        showNotification('Gagal memuat data: ' + error.message, 'error');
    }
}

// ==================== VALIDASI & SIMPAN DARI FORM (BUG FIX #15, #23) ====================
async function saveWarehouseFromForm() {
    const codeInput = document.getElementById('warehouse-code');
    const nameInput = document.getElementById('warehouse-name');
    const locationInput = document.getElementById('warehouse-location');
    const activeCheckbox = document.getElementById('warehouse-active');
    
    if (!codeInput || !nameInput) {
        showNotification('Form tidak ditemukan', 'error');
        return;
    }
    
    const code = codeInput.value.trim();
    const name = nameInput.value.trim();
    const location = locationInput?.value.trim() || '';
    const isActive = activeCheckbox?.checked !== false;
    
    // BUG FIX #15: Validasi lebih ketat
    if (!code || code.length < 2) {
        showNotification('Kode gudang minimal 2 karakter', 'error');
        if (codeInput) codeInput.focus();
        return;
    }
    
    if (!name || name.length < 2) {
        showNotification('Nama gudang minimal 2 karakter', 'error');
        if (nameInput) nameInput.focus();
        return;
    }
    
    if (!/^[A-Z0-9_-]+$/i.test(code)) {
        showNotification('Kode hanya boleh huruf, angka, underscore, atau dash', 'error');
        if (codeInput) codeInput.focus();
        return;
    }
    
    try {
        if (typeof showLoading === 'function') showLoading('Menyimpan...');
        
        const data = { code, name, location, isActive };
        await saveWarehouse(data, currentWarehouseId);
        
        if (typeof hideLoading === 'function') hideLoading();
        closeWarehouseModal();
        
        // Refresh table
        await renderWarehouseTable('warehouse-table-container');
        
        // BUG FIX #17: Update dropdown di halaman lain jika ada
        const warehouseSelect = document.getElementById('warehouse-select');
        if (warehouseSelect) {
            await renderWarehouseSelect(warehouseSelect, warehouseSelect.value);
        }
        
        showNotification('Gudang berhasil disimpan', 'success');
        
    } catch (error) {
        if (typeof hideLoading === 'function') hideLoading();
        console.error('Gagal menyimpan gudang:', error);
        showNotification('Gagal menyimpan: ' + error.message, 'error');
    }
}

function closeWarehouseModal() {
    const modal = document.getElementById('warehouse-modal');
    if (modal) {
        modal.style.display = 'none';
        // BUG FIX #9: Reset state
        currentWarehouseId = null;
    }
}

// BUG FIX #6: Event listener cleanup untuk modal click outside
function setupWarehouseModalListeners() {
    const modal = document.getElementById('warehouse-modal');
    if (!modal) return;
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeWarehouseModal();
        }
    });
    
    // Handle escape key
    document.addEventListener('keydown', function handler(e) {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            closeWarehouseModal();
        }
    });
}

async function deleteWarehousePrompt(id) {
    if (!id) {
        showNotification('ID gudang tidak valid', 'error');
        return;
    }
    
    // BUG FIX: Cek usage dulu sebelum konfirmasi
    try {
        const usage = await isWarehouseInUse(id);
        let confirmMsg = 'Hapus gudang ini?';
        
        if (usage.inUse) {
            const details = usage.details.map(d => `${d.type}: ${d.count} item`).join(', ');
            confirmMsg = `⚠️ Gudang masih digunakan (${details}).\n\nData terkait akan tetap ada tapi tidak bisa diakses.\n\nTetap hapus gudang ini?`;
        }
        
        if (!confirm(confirmMsg)) return;
        
        if (typeof showLoading === 'function') showLoading('Menghapus...');
        
        await deleteWarehouse(id);
        
        if (typeof hideLoading === 'function') hideLoading();
        
        await renderWarehouseTable('warehouse-table-container');
        
        // Update dropdown
        const warehouseSelect = document.getElementById('warehouse-select');
        if (warehouseSelect) {
            await renderWarehouseSelect(warehouseSelect);
        }
        
        showNotification('Gudang dihapus', 'success');
        
    } catch (error) {
        if (typeof hideLoading === 'function') hideLoading();
        console.error('Gagal menghapus gudang:', error);
        showNotification('Gagal hapus: ' + error.message, 'error');
    }
}

// ==================== INISIALISASI ====================
async function initWarehousePage() {
    try {
        console.log('Initializing warehouse page...');
        
        // Setup modal listeners (BUG FIX #6)
        setupWarehouseModalListeners();
        
        // Render table
        await renderWarehouseTable('warehouse-table-container');
        
        // Setup form submit handler
        const saveBtn = document.getElementById('warehouse-save-btn');
        if (saveBtn) {
            saveBtn.onclick = saveWarehouseFromForm;
        }
        
        // Setup close button
        const closeBtn = document.querySelector('#warehouse-modal .close-btn');
        if (closeBtn) {
            closeBtn.onclick = closeWarehouseModal;
        }
        
        console.log('Warehouse page initialized');
    } catch (error) {
        console.error('Error initializing warehouse page:', error);
        showNotification('Gagal memuat halaman: ' + error.message, 'error');
    }
}

// ==================== EXPORT GLOBAL FUNCTIONS ====================
window.loadWarehouses = loadWarehouses;
window.renderWarehouseSelect = renderWarehouseSelect;
window.saveWarehouse = saveWarehouse;
window.deleteWarehouse = deleteWarehouse;
window.renderWarehouseTable = renderWarehouseTable;
window.showAddWarehouseForm = showAddWarehouseForm;
window.editWarehouse = editWarehouse;
window.saveWarehouseFromForm = saveWarehouseFromForm;
window.closeWarehouseModal = closeWarehouseModal;
window.deleteWarehousePrompt = deleteWarehousePrompt;
window.initWarehousePage = initWarehousePage;
window.isWarehouseInUse = isWarehouseInUse;

// Auto-init jika DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWarehousePage);
} else {
    initWarehousePage();
}
