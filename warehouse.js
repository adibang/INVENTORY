// warehouse.js
// Manajemen data gudang (CRUD) untuk sistem inventori multi-gudang

// ==================== LOAD SEMUA GUDANG ====================
async function loadWarehouses() {
    try {
        if (!db) {
            console.error('Database belum diinisialisasi');
            return [];
        }
        const transaction = db.transaction(['warehouses'], 'readonly');
        const store = transaction.objectStore('warehouses');
        const request = store.getAll();
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const warehouses = request.result || [];
                warehouses.sort((a, b) => a.name.localeCompare(b.name));
                resolve(warehouses);
            };
            request.onerror = (e) => {
                console.error('Gagal memuat gudang:', e.target.error);
                reject(e.target.error);
            };
        });
    } catch (error) {
        console.error('Error loadWarehouses:', error);
        return [];
    }
}

// ==================== RENDER DROPDOWN GUDANG ====================
async function renderWarehouseSelect(selectElement, selectedId = null) {
    if (!selectElement) return;
    try {
        const warehouses = await loadWarehouses();
        selectElement.innerHTML = '<option value="">-- Pilih Gudang --</option>';
        warehouses.forEach(w => {
            const option = document.createElement('option');
            option.value = w.id;
            option.textContent = `${w.code} - ${w.name}`;
            if (selectedId && w.id == selectedId) {
                option.selected = true;
            }
            selectElement.appendChild(option);
        });
    } catch (error) {
        console.error('Gagal render dropdown gudang:', error);
    }
}

// ==================== TAMBAH / EDIT GUDANG ====================
async function saveWarehouse(warehouseData, id = null) {
    try {
        if (!db) throw new Error('Database belum diinisialisasi');
        const now = new Date().toISOString();
        const transaction = db.transaction(['warehouses'], 'readwrite');
        const store = transaction.objectStore('warehouses');

        // Validasi kode unik
        const allWarehouses = await loadWarehouses();
        const duplicateCode = allWarehouses.find(w => 
            w.code === warehouseData.code && (id === null || w.id !== id)
        );
        if (duplicateCode) {
            throw new Error(`Kode gudang "${warehouseData.code}" sudah digunakan`);
        }

        if (id) {
            // Edit
            const existing = await new Promise((resolve, reject) => {
                const req = store.get(id);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            if (!existing) throw new Error('Gudang tidak ditemukan');
            const updated = { 
                ...existing, 
                ...warehouseData, 
                updatedAt: now 
            };
            await new Promise((resolve, reject) => {
                const req = store.put(updated);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            return updated;
        } else {
            // Tambah baru
            const newWarehouse = {
                ...warehouseData,
                createdAt: now,
                updatedAt: now
            };
            const newId = await new Promise((resolve, reject) => {
                const req = store.add(newWarehouse);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            newWarehouse.id = newId;
            return newWarehouse;
        }
    } catch (error) {
        console.error('Gagal menyimpan gudang:', error);
        throw error;
    }
}

// ==================== HAPUS GUDANG ====================
async function deleteWarehouse(id) {
    try {
        if (!db) throw new Error('Database belum diinisialisasi');
        
        // Cek apakah gudang masih memiliki stok
        const txStocks = db.transaction(['item_stocks'], 'readonly');
        const stockStore = txStocks.objectStore('item_stocks');
        const index = stockStore.index('warehouseId');
        const range = IDBKeyRange.only(id);
        const stocks = await new Promise((resolve, reject) => {
            const req = index.getAll(range);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        if (stocks.length > 0) {
            throw new Error('Gudang masih memiliki stok, tidak dapat dihapus');
        }

        // Cek apakah gudang digunakan di transfer atau opname (opsional)
        // ... bisa ditambahkan sesuai kebutuhan

        const transaction = db.transaction(['warehouses'], 'readwrite');
        const store = transaction.objectStore('warehouses');
        await new Promise((resolve, reject) => {
            const req = store.delete(id);
            req.onsuccess = resolve;
            req.onerror = reject;
        });
        return true;
    } catch (error) {
        console.error('Gagal menghapus gudang:', error);
        throw error;
    }
}

// ==================== RENDER TABEL GUDANG ====================
async function renderWarehouseTable(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
        const warehouses = await loadWarehouses();
        if (warehouses.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:20px;">Belum ada gudang. <button class="form-button-primary" onclick="showAddWarehouseForm()">Tambah Gudang</button></p>';
            return;
        }
        let html = '<table class="data-table"><thead><tr><th>Kode</th><th>Nama</th><th>Lokasi</th><th>Status</th><th>Aksi</th></tr></thead><tbody>';
        warehouses.forEach(w => {
            html += `<tr>
                <td>${w.code}</td>
                <td>${w.name}</td>
                <td>${w.location || '-'}</td>
                <td>${w.is_active ? 'Aktif' : 'Tidak Aktif'}</td>
                <td>
                    <button class="action-btn edit-btn" onclick="editWarehouse(${w.id})">
                        <svg class="icon" viewBox="0 0 24 24" width="18" height="18">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="action-btn delete-btn" onclick="deleteWarehousePrompt(${w.id})">
                        <svg class="icon" viewBox="0 0 24 24" width="18" height="18">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            <line x1="10" y1="11" x2="10" y2="17"/>
                            <line x1="14" y1="11" x2="14" y2="17"/>
                        </svg>
                    </button>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (error) {
        console.error('Gagal render tabel gudang:', error);
        container.innerHTML = `<p class="error-message" style="color:red; text-align:center;">Gagal memuat data: ${error.message}</p>`;
    }
}

// ==================== FUNGSI UNTUK FORM TAMBAH/EDIT ====================
let currentWarehouseId = null;

function showAddWarehouseForm() {
    currentWarehouseId = null;
    const modal = document.getElementById('warehouse-modal');
    if (!modal) {
        alert('Modal gudang tidak ditemukan. Pastikan elemen dengan id "warehouse-modal" ada di halaman.');
        return;
    }
    document.getElementById('warehouse-code').value = '';
    document.getElementById('warehouse-name').value = '';
    document.getElementById('warehouse-location').value = '';
    document.getElementById('warehouse-active').checked = true;
    document.getElementById('warehouse-modal-title').innerHTML = `
        <svg class="icon icon-primary" viewBox="0 0 24 24" width="20" height="20">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
        </svg> Tambah Gudang
    `;
    modal.style.display = 'flex';
}

async function editWarehouse(id) {
    try {
        const warehouses = await loadWarehouses();
        const warehouse = warehouses.find(w => w.id === id);
        if (!warehouse) throw new Error('Gudang tidak ditemukan');
        currentWarehouseId = id;
        const modal = document.getElementById('warehouse-modal');
        if (!modal) return;
        document.getElementById('warehouse-code').value = warehouse.code;
        document.getElementById('warehouse-name').value = warehouse.name;
        document.getElementById('warehouse-location').value = warehouse.location || '';
        document.getElementById('warehouse-active').checked = warehouse.is_active !== false;
        document.getElementById('warehouse-modal-title').innerHTML = `
            <svg class="icon icon-primary" viewBox="0 0 24 24" width="20" height="20">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg> Edit Gudang
        `;
        modal.style.display = 'flex';
    } catch (error) {
        alert('Gagal memuat data gudang: ' + error.message);
    }
}

async function saveWarehouseFromForm() {
    const code = document.getElementById('warehouse-code').value.trim();
    const name = document.getElementById('warehouse-name').value.trim();
    const location = document.getElementById('warehouse-location').value.trim();
    const is_active = document.getElementById('warehouse-active').checked;

    if (!code || !name) {
        alert('Kode dan nama gudang harus diisi');
        return;
    }

    try {
        if (typeof showLoading === 'function') showLoading();
        const data = { code, name, location, is_active };
        await saveWarehouse(data, currentWarehouseId);
        if (typeof hideLoading === 'function') hideLoading();
        closeWarehouseModal();
        await renderWarehouseTable('warehouse-table-container');
        
        // Update dropdown gudang di halaman transaksi jika ada
        const warehouseSelect = document.getElementById('warehouse-select');
        if (warehouseSelect) {
            await renderWarehouseSelect(warehouseSelect);
        }
        
        if (typeof showNotification === 'function') {
            showNotification('Gudang berhasil disimpan', 'success');
        } else {
            alert('Gudang berhasil disimpan');
        }
    } catch (error) {
        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showNotification === 'function') {
            showNotification('Gagal menyimpan: ' + error.message, 'error');
        } else {
            alert('Gagal menyimpan: ' + error.message);
        }
    }
}

function closeWarehouseModal() {
    const modal = document.getElementById('warehouse-modal');
    if (modal) modal.style.display = 'none';
    currentWarehouseId = null;
}

async function deleteWarehousePrompt(id) {
    if (!confirm('Hapus gudang ini? Pastikan tidak ada stok di gudang ini.')) return;
    try {
        if (typeof showLoading === 'function') showLoading();
        await deleteWarehouse(id);
        if (typeof hideLoading === 'function') hideLoading();
        await renderWarehouseTable('warehouse-table-container');
        
        // Update dropdown
        const warehouseSelect = document.getElementById('warehouse-select');
        if (warehouseSelect) {
            await renderWarehouseSelect(warehouseSelect);
        }
        
        if (typeof showNotification === 'function') {
            showNotification('Gudang dihapus', 'success');
        } else {
            alert('Gudang dihapus');
        }
    } catch (error) {
        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showNotification === 'function') {
            showNotification('Gagal hapus: ' + error.message, 'error');
        } else {
            alert('Gagal hapus: ' + error.message);
        }
    }
}

// Ekspor fungsi ke global
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
