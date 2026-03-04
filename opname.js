// opname.js
// Manajemen Stok Opname (Stocktake) untuk sistem inventori multi-gudang

// ==================== LOAD SEMUA STOCKTAKE ====================
async function loadStocktakes() {
    try {
        if (!db) throw new Error('Database belum diinisialisasi');
        const transaction = db.transaction(['stocktakes'], 'readonly');
        const store = transaction.objectStore('stocktakes');
        const request = store.getAll();
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const stocktakes = request.result || [];
                stocktakes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                resolve(stocktakes);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    } catch (error) {
        console.error('Error loadStocktakes:', error);
        return [];
    }
}

// ==================== GENERATE NOMOR STOCKTAKE ====================
async function generateStocktakeNumber() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    try {
        const transaction = db.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get('lastStocktakeNumber');
        const result = await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = reject;
        });

        let lastCounter = 0;
        if (result && result.value) {
            if (result.value.date === dateStr) {
                lastCounter = result.value.counter;
            } else {
                lastCounter = 0;
            }
        }

        const newCounter = lastCounter + 1;
        const stocktakeNumber = `ST-${dateStr}-${String(newCounter).padStart(4, '0')}`;

        // Simpan counter terbaru
        const putTx = db.transaction(['settings'], 'readwrite');
        const putStore = putTx.objectStore('settings');
        await new Promise((resolve, reject) => {
            const req = putStore.put({
                key: 'lastStocktakeNumber',
                value: { date: dateStr, counter: newCounter }
            });
            req.onsuccess = resolve;
            req.onerror = reject;
        });

        return stocktakeNumber;
    } catch (error) {
        console.warn('Gagal generate nomor stocktake, pakai fallback', error);
        return `ST-${dateStr}-${Date.now().toString().slice(-4)}`;
    }
}

// ==================== SIMPAN STOCKTAKE (HEADER) ====================
async function saveStocktake(data, id = null) {
    try {
        const now = new Date().toISOString();
        if (id) {
            // Update
            const tx = db.transaction(['stocktakes'], 'readwrite');
            const store = tx.objectStore('stocktakes');
            const existing = await new Promise((resolve, reject) => {
                const req = store.get(id);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            if (!existing) throw new Error('Stocktake tidak ditemukan');
            const updated = { ...existing, ...data, updatedAt: now };
            await new Promise((resolve, reject) => {
                const req = store.put(updated);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            return updated;
        } else {
            // Tambah baru
            const newStocktake = {
                ...data,
                createdAt: now,
                updatedAt: now,
                status: data.status || 'draft' // draft, in_progress, completed, cancelled
            };
            const tx = db.transaction(['stocktakes'], 'readwrite');
            const store = tx.objectStore('stocktakes');
            const newId = await new Promise((resolve, reject) => {
                const req = store.add(newStocktake);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            newStocktake.id = newId;
            return newStocktake;
        }
    } catch (error) {
        console.error('Gagal menyimpan stocktake:', error);
        throw error;
    }
}

// ==================== HAPUS STOCKTAKE ====================
async function deleteStocktake(id) {
    try {
        // Cek apakah sudah completed? Jika ya, sebaiknya tidak dihapus, atau beri warning
        const tx = db.transaction(['stocktakes', 'stocktake_items'], 'readwrite');
        const stocktakeStore = tx.objectStore('stocktakes');
        const itemStore = tx.objectStore('stocktake_items');

        // Hapus semua item terkait
        const itemIndex = itemStore.index('stocktakeId');
        const range = IDBKeyRange.only(id);
        const itemKeys = await new Promise((resolve, reject) => {
            const req = itemIndex.getAllKeys(range);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        for (let key of itemKeys) {
            await new Promise((resolve, reject) => {
                const req = itemStore.delete(key);
                req.onsuccess = resolve;
                req.onerror = reject;
            });
        }

        // Hapus header
        await new Promise((resolve, reject) => {
            const req = stocktakeStore.delete(id);
            req.onsuccess = resolve;
            req.onerror = reject;
        });

        return true;
    } catch (error) {
        console.error('Gagal menghapus stocktake:', error);
        throw error;
    }
}

// ==================== LOAD ITEM STOCKTAKE ====================
async function loadStocktakeItems(stocktakeId) {
    try {
        const tx = db.transaction(['stocktake_items'], 'readonly');
        const store = tx.objectStore('stocktake_items');
        const index = store.index('stocktakeId');
        const range = IDBKeyRange.only(stocktakeId);
        const request = index.getAll(range);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = reject;
        });
    } catch (error) {
        console.error('Error loadStocktakeItems:', error);
        return [];
    }
}

// ==================== SIMPAN SATU ITEM STOCKTAKE ====================
async function saveStocktakeItem(itemData) {
    try {
        const now = new Date().toISOString();
        const tx = db.transaction(['stocktake_items'], 'readwrite');
        const store = tx.objectStore('stocktake_items');
        if (itemData.id) {
            // Update
            const existing = await new Promise((resolve, reject) => {
                const req = store.get(itemData.id);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            if (!existing) throw new Error('Item stocktake tidak ditemukan');
            const updated = { ...existing, ...itemData, updatedAt: now };
            await new Promise((resolve, reject) => {
                const req = store.put(updated);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            return updated;
        } else {
            // Tambah baru
            const newItem = { ...itemData, createdAt: now, updatedAt: now };
            const newId = await new Promise((resolve, reject) => {
                const req = store.add(newItem);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            newItem.id = newId;
            return newItem;
        }
    } catch (error) {
        console.error('Gagal menyimpan item stocktake:', error);
        throw error;
    }
}

// ==================== HAPUS ITEM STOCKTAKE ====================
async function deleteStocktakeItem(itemId) {
    try {
        const tx = db.transaction(['stocktake_items'], 'readwrite');
        const store = tx.objectStore('stocktake_items');
        await new Promise((resolve, reject) => {
            const req = store.delete(itemId);
            req.onsuccess = resolve;
            req.onerror = reject;
        });
        return true;
    } catch (error) {
        console.error('Gagal menghapus item stocktake:', error);
        throw error;
    }
}

// ==================== HITUNG SELISIH UNTUK SEMUA ITEM ====================
async function calculateDifferences(stocktakeId) {
    try {
        const items = await loadStocktakeItems(stocktakeId);
        let updated = [];
        for (let item of items) {
            const diff = (item.physical_qty || 0) - (item.system_qty || 0);
            if (item.difference !== diff) {
                item.difference = diff;
                await saveStocktakeItem(item);
            }
            updated.push(item);
        }
        return updated;
    } catch (error) {
        console.error('Gagal hitung selisih:', error);
        throw error;
    }
}

// ==================== PROSES ADJUSTMENT (KONVERSI SELISIH MENJADI MOVEMENT) ====================
async function processStocktakeAdjustment(stocktakeId, userId = null) {
    try {
        // Ambil data stocktake
        const tx = db.transaction(['stocktakes'], 'readonly');
        const store = tx.objectStore('stocktakes');
        const stocktake = await new Promise((resolve, reject) => {
            const req = store.get(stocktakeId);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        if (!stocktake) throw new Error('Stocktake tidak ditemukan');
        if (stocktake.status === 'completed') throw new Error('Stocktake sudah selesai diproses');

        // Hitung selisih semua item
        const items = await calculateDifferences(stocktakeId);

        // Filter item yang memiliki selisih != 0
        const adjustments = items.filter(i => i.difference !== 0);
        if (adjustments.length === 0) {
            // Tidak ada perubahan, langsung tandai selesai
            stocktake.status = 'completed';
            stocktake.end_date = new Date().toISOString();
            await saveStocktake(stocktake, stocktake.id);
            return { message: 'Tidak ada selisih, stocktake ditandai selesai.' };
        }

        // Mulai transaksi untuk update stok dan buat movement
        const tx2 = db.transaction(['item_stocks', 'stock_movements', 'stocktakes', 'stocktake_items'], 'readwrite');
        const stockStore = tx2.objectStore('item_stocks');
        const movementStore = tx2.objectStore('stock_movements');
        const stocktakeStore = tx2.objectStore('stocktakes');
        const itemStore = tx2.objectStore('stocktake_items');

        for (let adj of adjustments) {
            // Cari stok saat ini di gudang untuk item tersebut
            const stockIndex = stockStore.index('item_warehouse');
            const range = IDBKeyRange.only([adj.item_id, stocktake.warehouse_id]);
            const stockReq = await new Promise((resolve, reject) => {
                const req = stockIndex.get(range);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });

            if (stockReq) {
                // Update stok
                stockReq.quantity += adj.difference;
                stockReq.updated_at = new Date().toISOString();
                await new Promise((resolve, reject) => {
                    const req = stockStore.put(stockReq);
                    req.onsuccess = resolve;
                    req.onerror = reject;
                });
            } else {
                // Jika belum ada record stok, buat baru (seharusnya sudah ada, tapi untuk jaga-jaga)
                const newStock = {
                    item_id: adj.item_id,
                    warehouse_id: stocktake.warehouse_id,
                    quantity: adj.difference,
                    min_stock: 0,
                    max_stock: 0,
                    reorder_point: 0,
                    updated_at: new Date().toISOString()
                };
                await new Promise((resolve, reject) => {
                    const req = stockStore.add(newStock);
                    req.onsuccess = resolve;
                    req.onerror = reject;
                });
            }

            // Catat stock movement
            const movement = {
                movement_type: 'adjustment',
                item_id: adj.item_id,
                warehouse_id: stocktake.warehouse_id,
                quantity: adj.difference,
                reference_id: stocktake.id,
                reference_type: 'stocktake',
                batch_id: adj.batch_id || null,
                serial_id: null, // serial tidak di-handle di opname sederhana
                unit_cost: adj.unit_cost || 0,
                created_at: new Date().toISOString(),
                created_by: userId,
                notes: `Penyesuaian stok dari stocktake ${stocktake.stocktake_number}`
            };
            await new Promise((resolve, reject) => {
                const req = movementStore.add(movement);
                req.onsuccess = resolve;
                req.onerror = reject;
            });

            // Tandai item sudah diproses (opsional)
            adj.processed = true;
            await new Promise((resolve, reject) => {
                const req = itemStore.put(adj);
                req.onsuccess = resolve;
                req.onerror = reject;
            });
        }

        // Update status stocktake menjadi completed
        stocktake.status = 'completed';
        stocktake.end_date = new Date().toISOString();
        await new Promise((resolve, reject) => {
            const req = stocktakeStore.put(stocktake);
            req.onsuccess = resolve;
            req.onerror = reject;
        });

        return { success: true, adjusted: adjustments.length };
    } catch (error) {
        console.error('Gagal proses adjustment stocktake:', error);
        throw error;
    }
}

// ==================== RENDER TABEL DAFTAR STOCKTAKE ====================
async function renderStocktakeTable(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
        const stocktakes = await loadStocktakes();
        if (stocktakes.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:20px;">Belum ada stocktake. <button class="form-button-primary" onclick="showAddStocktakeForm()">Buat Stocktake Baru</button></p>';
            return;
        }
        let html = '<table class="data-table"><thead><tr><th>No. Stocktake</th><th>Gudang</th><th>Tanggal Mulai</th><th>Tanggal Selesai</th><th>Status</th><th>Aksi</th></tr></thead><tbody>';
        for (let s of stocktakes) {
            const warehouseName = await getWarehouseName(s.warehouse_id);
            html += `<tr>
                <td>${s.stocktake_number}</td>
                <td>${warehouseName}</td>
                <td>${new Date(s.start_date).toLocaleString('id-ID')}</td>
                <td>${s.end_date ? new Date(s.end_date).toLocaleString('id-ID') : '-'}</td>
                <td>${getStatusBadge(s.status)}</td>
                <td>
                    ${s.status === 'draft' ? 
                        `<button class="action-btn edit-btn" onclick="editStocktake(${s.id})" title="Edit">✏️</button>
                         <button class="action-btn" onclick="openStocktakeDetail(${s.id})" title="Isi Item">📋</button>
                         <button class="action-btn delete-btn" onclick="deleteStocktakePrompt(${s.id})" title="Hapus">🗑️</button>` : 
                        (s.status === 'in_progress' ? 
                            `<button class="action-btn" onclick="openStocktakeDetail(${s.id})" title="Lanjutkan">📋</button>
                             <button class="action-btn" onclick="processStocktakeAdjustmentPrompt(${s.id})" title="Proses Adjustment">⚡</button>` : 
                            `<button class="action-btn" onclick="viewStocktakeResult(${s.id})" title="Lihat Hasil">👁️</button>`)}
                </td>
            </tr>`;
        }
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (error) {
        console.error('Gagal render tabel stocktake:', error);
        container.innerHTML = `<p class="error-message" style="color:red; text-align:center;">Gagal memuat data: ${error.message}</p>`;
    }
}

// Helper untuk mendapatkan nama gudang
async function getWarehouseName(warehouseId) {
    if (!warehouseId) return '-';
    try {
        const tx = db.transaction(['warehouses'], 'readonly');
        const store = tx.objectStore('warehouses');
        const req = store.get(warehouseId);
        const result = await new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        return result ? result.name : '-';
    } catch {
        return '-';
    }
}

function getStatusBadge(status) {
    const map = {
        'draft': '<span style="background:#ccc; padding:2px 8px; border-radius:10px;">Draft</span>',
        'in_progress': '<span style="background:#ffc107; padding:2px 8px; border-radius:10px;">Sedang Berjalan</span>',
        'completed': '<span style="background:#28a745; color:white; padding:2px 8px; border-radius:10px;">Selesai</span>',
        'cancelled': '<span style="background:#dc3545; color:white; padding:2px 8px; border-radius:10px;">Dibatalkan</span>'
    };
    return map[status] || status;
}

// ==================== FORM TAMBAH/EDIT STOCKTAKE ====================
let currentStocktakeId = null;

async function showAddStocktakeForm() {
    currentStocktakeId = null;
    const modal = document.getElementById('stocktake-modal');
    if (!modal) {
        alert('Modal stocktake tidak ditemukan');
        return;
    }
    document.getElementById('stocktake-number').value = await generateStocktakeNumber();
    document.getElementById('stocktake-warehouse').innerHTML = '<option value="">-- Pilih Gudang --</option>';
    // Isi dropdown gudang
    const warehouses = await loadWarehouses();
    warehouses.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.id;
        opt.textContent = `${w.code} - ${w.name}`;
        document.getElementById('stocktake-warehouse').appendChild(opt);
    });
    document.getElementById('stocktake-start-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('stocktake-notes').value = '';
    document.getElementById('stocktake-modal-title').innerHTML = `
        <svg class="icon icon-primary" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
        </svg> Buat Stocktake Baru
    `;
    modal.style.display = 'flex';
}

async function editStocktake(id) {
    try {
        const tx = db.transaction(['stocktakes'], 'readonly');
        const store = tx.objectStore('stocktakes');
        const stocktake = await new Promise((resolve, reject) => {
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        if (!stocktake) throw new Error('Stocktake tidak ditemukan');
        currentStocktakeId = id;
        const modal = document.getElementById('stocktake-modal');
        document.getElementById('stocktake-number').value = stocktake.stocktake_number;
        document.getElementById('stocktake-number').disabled = true; // nomor tidak bisa diubah
        // Isi dropdown gudang
        const warehouses = await loadWarehouses();
        const whSelect = document.getElementById('stocktake-warehouse');
        whSelect.innerHTML = '';
        warehouses.forEach(w => {
            const opt = document.createElement('option');
            opt.value = w.id;
            opt.textContent = `${w.code} - ${w.name}`;
            if (w.id == stocktake.warehouse_id) opt.selected = true;
            whSelect.appendChild(opt);
        });
        document.getElementById('stocktake-start-date').value = stocktake.start_date.split('T')[0];
        document.getElementById('stocktake-notes').value = stocktake.notes || '';
        document.getElementById('stocktake-modal-title').innerHTML = `
            <svg class="icon icon-primary" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg> Edit Stocktake
        `;
        modal.style.display = 'flex';
    } catch (error) {
        alert('Gagal memuat data: ' + error.message);
    }
}

async function saveStocktakeFromForm() {
    const number = document.getElementById('stocktake-number').value.trim();
    const warehouse_id = parseInt(document.getElementById('stocktake-warehouse').value);
    const start_date = document.getElementById('stocktake-start-date').value;
    const notes = document.getElementById('stocktake-notes').value.trim();

    if (!number || !warehouse_id || !start_date) {
        alert('Nomor, Gudang, dan Tanggal Mulai harus diisi');
        return;
    }

    try {
        if (typeof showLoading === 'function') showLoading();
        const data = {
            stocktake_number: number,
            warehouse_id,
            start_date: new Date(start_date).toISOString(),
            notes,
            status: 'draft'
        };
        await saveStocktake(data, currentStocktakeId);
        if (typeof hideLoading === 'function') hideLoading();
        closeStocktakeModal();
        await renderStocktakeTable('stocktake-table-container');
        if (typeof showNotification === 'function') {
            showNotification('Stocktake berhasil disimpan', 'success');
        } else {
            alert('Stocktake berhasil disimpan');
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

function closeStocktakeModal() {
    const modal = document.getElementById('stocktake-modal');
    if (modal) modal.style.display = 'none';
    currentStocktakeId = null;
    // Aktifkan kembali input nomor
    const numInput = document.getElementById('stocktake-number');
    if (numInput) numInput.disabled = false;
}

async function deleteStocktakePrompt(id) {
    if (!confirm('Hapus stocktake ini? Semua data item akan ikut terhapus.')) return;
    try {
        if (typeof showLoading === 'function') showLoading();
        await deleteStocktake(id);
        if (typeof hideLoading === 'function') hideLoading();
        await renderStocktakeTable('stocktake-table-container');
        if (typeof showNotification === 'function') {
            showNotification('Stocktake dihapus', 'success');
        } else {
            alert('Stocktake dihapus');
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

// ==================== HALAMAN DETAIL STOCKTAKE (INPUT ITEM) ====================
let currentDetailStocktakeId = null;

async function openStocktakeDetail(stocktakeId) {
    currentDetailStocktakeId = stocktakeId;
    // Sembunyikan konten utama, tampilkan halaman detail
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.style.display = 'none';
    // Sembunyikan halaman lain jika perlu
    document.getElementById('transaksi-page').style.display = 'none';
    document.getElementById('cart-page').style.display = 'none';
    document.getElementById('payment-page').style.display = 'none';
    document.getElementById('drive-backup-page').style.display = 'none';

    // Tampilkan container detail stocktake (harus ada di HTML)
    const detailContainer = document.getElementById('stocktake-detail-page');
    if (!detailContainer) {
        // Jika belum ada, buat secara dinamis (bisa juga diarahkan ke halaman terpisah)
        alert('Halaman detail stocktake belum tersedia');
        return;
    }
    detailContainer.style.display = 'block';

    // Load data stocktake dan item
    try {
        const tx = db.transaction(['stocktakes'], 'readonly');
        const store = tx.objectStore('stocktakes');
        const stocktake = await new Promise((resolve, reject) => {
            const req = store.get(stocktakeId);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        if (!stocktake) throw new Error('Stocktake tidak ditemukan');

        document.getElementById('detail-stocktake-number').textContent = stocktake.stocktake_number;
        document.getElementById('detail-warehouse').textContent = await getWarehouseName(stocktake.warehouse_id);
        document.getElementById('detail-start-date').textContent = new Date(stocktake.start_date).toLocaleDateString('id-ID');
        document.getElementById('detail-notes').textContent = stocktake.notes || '-';
        document.getElementById('detail-status').innerHTML = getStatusBadge(stocktake.status);

        // Render daftar item yang akan diopname
        await renderStocktakeItemList(stocktakeId);
    } catch (error) {
        alert('Gagal memuat detail: ' + error.message);
    }
}

function closeStocktakeDetail() {
    const detailContainer = document.getElementById('stocktake-detail-page');
    if (detailContainer) detailContainer.style.display = 'none';
    document.querySelector('.main-content').style.display = 'block';
    currentDetailStocktakeId = null;
}

// Render tabel item untuk diisi stok fisik
async function renderStocktakeItemList(stocktakeId) {
    const tbody = document.getElementById('stocktake-item-tbody');
    if (!tbody) return;
    try {
        // Ambil semua item yang ada di gudang tersebut
        const stocktake = await new Promise((resolve, reject) => {
            const tx = db.transaction(['stocktakes'], 'readonly');
            const store = tx.objectStore('stocktakes');
            const req = store.get(stocktakeId);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        const warehouseId = stocktake.warehouse_id;

        // Ambil semua item_stocks untuk gudang ini
        const txStock = db.transaction(['item_stocks', 'kasirItems'], 'readonly');
        const stockStore = txStock.objectStore('item_stocks');
        const itemStore = txStock.objectStore('kasirItems');
        const index = stockStore.index('warehouseId');
        const range = IDBKeyRange.only(warehouseId);
        const stockItems = await new Promise((resolve, reject) => {
            const req = index.getAll(range);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });

        // Ambil data item yang sudah ada di stocktake_items (jika sudah diisi sebelumnya)
        const existingItems = await loadStocktakeItems(stocktakeId);

        // Gabungkan: untuk setiap stock item, jika sudah ada di existing, pakai physical_qty, otherwise kosong
        let html = '';
        for (let s of stockItems) {
            const item = await new Promise((resolve, reject) => {
                const req = itemStore.get(s.item_id);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            if (!item) continue;

            const existing = existingItems.find(e => e.item_id === s.item_id && e.batch_id === s.batch_id);
            const physical = existing ? existing.physical_qty : '';
            const difference = existing ? existing.difference : 0;

            html += `<tr>
                <td>${item.name}</td>
                <td>${item.code}</td>
                <td>${s.batch_id ? 'Batch: ' + s.batch_id : '-'}</td>
                <td>${s.quantity}</td>
                <td>
                    <input type="number" class="form-input" 
                           data-item-id="${s.item_id}" 
                           data-batch-id="${s.batch_id || ''}"
                           value="${physical}" 
                           min="0" step="0.01"
                           onchange="updatePhysicalQty(this, ${stocktakeId})">
                </td>
                <td class="difference-col" id="diff-${s.item_id}-${s.batch_id || '0'}">${difference !== 0 ? difference : '-'}</td>
            </tr>`;
        }
        tbody.innerHTML = html;
    } catch (error) {
        console.error('Gagal render item list:', error);
        tbody.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Gagal memuat data: ${error.message}</td></tr>`;
    }
}

// Fungsi untuk update physical qty dan hitung selisih
async function updatePhysicalQty(input, stocktakeId) {
    const itemId = parseInt(input.dataset.itemId);
    const batchId = input.dataset.batchId ? parseInt(input.dataset.batchId) : null;
    const physical = parseFloat(input.value) || 0;

    try {
        // Cari system_qty dari item_stocks
        const tx = db.transaction(['item_stocks'], 'readonly');
        const store = tx.objectStore('item_stocks');
        const index = store.index('item_warehouse');
        const stocktake = await new Promise((resolve, reject) => {
            const tx2 = db.transaction(['stocktakes'], 'readonly');
            const store2 = tx2.objectStore('stocktakes');
            const req = store2.get(stocktakeId);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        const range = IDBKeyRange.only([itemId, stocktake.warehouse_id]);
        const stock = await new Promise((resolve, reject) => {
            const req = index.get(range);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        const systemQty = stock ? stock.quantity : 0;

        // Cek apakah item sudah ada di stocktake_items
        const existingItems = await loadStocktakeItems(stocktakeId);
        let existing = existingItems.find(e => e.item_id === itemId && e.batch_id === batchId);

        const difference = physical - systemQty;
        const diffCell = document.getElementById(`diff-${itemId}-${batchId || '0'}`);
        if (diffCell) diffCell.textContent = difference;

        if (existing) {
            existing.physical_qty = physical;
            existing.difference = difference;
            await saveStocktakeItem(existing);
        } else {
            // Buat baru
            const newItem = {
                stocktake_id: stocktakeId,
                item_id: itemId,
                batch_id: batchId,
                system_qty: systemQty,
                physical_qty: physical,
                difference: difference,
                unit_cost: stock ? stock.unit_cost : 0
            };
            await saveStocktakeItem(newItem);
        }
    } catch (error) {
        console.error('Gagal update physical qty:', error);
        alert('Gagal menyimpan data: ' + error.message);
    }
}

// Proses adjustment dari halaman detail
async function processStocktakeAdjustmentPrompt(stocktakeId) {
    if (!confirm('Proses adjustment sekarang? Stok akan disesuaikan berdasarkan selisih yang telah diinput.')) return;
    try {
        if (typeof showLoading === 'function') showLoading();
        const result = await processStocktakeAdjustment(stocktakeId, currentUser?.id);
        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showNotification === 'function') {
            showNotification(`Adjustment selesai. ${result.adjusted || 0} item disesuaikan.`, 'success');
        } else {
            alert('Adjustment selesai');
        }
        // Tutup detail dan kembali ke daftar
        closeStocktakeDetail();
        await renderStocktakeTable('stocktake-table-container');
    } catch (error) {
        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showNotification === 'function') {
            showNotification('Gagal proses adjustment: ' + error.message, 'error');
        } else {
            alert('Gagal: ' + error.message);
        }
    }
}

// Lihat hasil stocktake (hanya baca)
async function viewStocktakeResult(stocktakeId) {
    // Bisa buka modal atau halaman ringkasan
    alert('Fitur lihat hasil stocktake sedang dalam pengembangan');
}

// Ekspor fungsi ke global
window.loadStocktakes = loadStocktakes;
window.generateStocktakeNumber = generateStocktakeNumber;
window.saveStocktake = saveStocktake;
window.deleteStocktake = deleteStocktake;
window.loadStocktakeItems = loadStocktakeItems;
window.saveStocktakeItem = saveStocktakeItem;
window.deleteStocktakeItem = deleteStocktakeItem;
window.calculateDifferences = calculateDifferences;
window.processStocktakeAdjustment = processStocktakeAdjustment;
window.renderStocktakeTable = renderStocktakeTable;
window.showAddStocktakeForm = showAddStocktakeForm;
window.editStocktake = editStocktake;
window.saveStocktakeFromForm = saveStocktakeFromForm;
window.closeStocktakeModal = closeStocktakeModal;
window.deleteStocktakePrompt = deleteStocktakePrompt;
window.openStocktakeDetail = openStocktakeDetail;
window.closeStocktakeDetail = closeStocktakeDetail;
window.updatePhysicalQty = updatePhysicalQty;
window.processStocktakeAdjustmentPrompt = processStocktakeAdjustmentPrompt;
window.viewStocktakeResult = viewStocktakeResult;
