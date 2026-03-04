// consignment.js
// Manajemen Konsinyasi (Barang Titipan) untuk sistem inventori multi-gudang

// ==================== LOAD SEMUA KONSINYASI ====================
async function loadConsignments() {
    try {
        if (!db) throw new Error('Database belum diinisialisasi');
        const transaction = db.transaction(['consignments'], 'readonly');
        const store = transaction.objectStore('consignments');
        const request = store.getAll();
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const consignments = request.result || [];
                consignments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                resolve(consignments);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    } catch (error) {
        console.error('Error loadConsignments:', error);
        return [];
    }
}

// ==================== GENERATE NOMOR KONSINYASI ====================
async function generateConsignmentNumber() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    try {
        const transaction = db.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get('lastConsignmentNumber');
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
        const consignmentNumber = `CN-${dateStr}-${String(newCounter).padStart(4, '0')}`;

        // Simpan counter terbaru
        const putTx = db.transaction(['settings'], 'readwrite');
        const putStore = putTx.objectStore('settings');
        await new Promise((resolve, reject) => {
            const req = putStore.put({
                key: 'lastConsignmentNumber',
                value: { date: dateStr, counter: newCounter }
            });
            req.onsuccess = resolve;
            req.onerror = reject;
        });

        return consignmentNumber;
    } catch (error) {
        console.warn('Gagal generate nomor konsinyasi, pakai fallback', error);
        return `CN-${dateStr}-${Date.now().toString().slice(-4)}`;
    }
}

// ==================== SIMPAN KONSINYASI (HEADER) ====================
async function saveConsignment(data, id = null) {
    try {
        const now = new Date().toISOString();
        if (id) {
            // Update
            const tx = db.transaction(['consignments'], 'readwrite');
            const store = tx.objectStore('consignments');
            const existing = await new Promise((resolve, reject) => {
                const req = store.get(id);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            if (!existing) throw new Error('Konsinyasi tidak ditemukan');
            const updated = { ...existing, ...data, updatedAt: now };
            await new Promise((resolve, reject) => {
                const req = store.put(updated);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            return updated;
        } else {
            // Tambah baru
            const newConsignment = {
                ...data,
                createdAt: now,
                updatedAt: now,
                status: data.status || 'active' // active, closed, returned
            };
            const tx = db.transaction(['consignments'], 'readwrite');
            const store = tx.objectStore('consignments');
            const newId = await new Promise((resolve, reject) => {
                const req = store.add(newConsignment);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            newConsignment.id = newId;
            return newConsignment;
        }
    } catch (error) {
        console.error('Gagal menyimpan konsinyasi:', error);
        throw error;
    }
}

// ==================== HAPUS KONSINYASI ====================
async function deleteConsignment(id) {
    try {
        // Cek apakah sudah ada penjualan? Sebaiknya tidak dihapus jika sudah ada transaksi
        const tx = db.transaction(['consignments', 'consignment_items'], 'readwrite');
        const consignmentStore = tx.objectStore('consignments');
        const itemStore = tx.objectStore('consignment_items');

        // Hapus semua item terkait
        const itemIndex = itemStore.index('consignmentId');
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
            const req = consignmentStore.delete(id);
            req.onsuccess = resolve;
            req.onerror = reject;
        });

        return true;
    } catch (error) {
        console.error('Gagal menghapus konsinyasi:', error);
        throw error;
    }
}

// ==================== LOAD ITEM KONSINYASI ====================
async function loadConsignmentItems(consignmentId) {
    try {
        const tx = db.transaction(['consignment_items'], 'readonly');
        const store = tx.objectStore('consignment_items');
        const index = store.index('consignmentId');
        const range = IDBKeyRange.only(consignmentId);
        const request = index.getAll(range);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = reject;
        });
    } catch (error) {
        console.error('Error loadConsignmentItems:', error);
        return [];
    }
}

// ==================== SIMPAN SATU ITEM KONSINYASI ====================
async function saveConsignmentItem(itemData) {
    try {
        const now = new Date().toISOString();
        const tx = db.transaction(['consignment_items'], 'readwrite');
        const store = tx.objectStore('consignment_items');
        if (itemData.id) {
            // Update
            const existing = await new Promise((resolve, reject) => {
                const req = store.get(itemData.id);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            if (!existing) throw new Error('Item konsinyasi tidak ditemukan');
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
        console.error('Gagal menyimpan item konsinyasi:', error);
        throw error;
    }
}

// ==================== HAPUS ITEM KONSINYASI ====================
async function deleteConsignmentItem(itemId) {
    try {
        const tx = db.transaction(['consignment_items'], 'readwrite');
        const store = tx.objectStore('consignment_items');
        await new Promise((resolve, reject) => {
            const req = store.delete(itemId);
            req.onsuccess = resolve;
            req.onerror = reject;
        });
        return true;
    } catch (error) {
        console.error('Gagal menghapus item konsinyasi:', error);
        throw error;
    }
}

// ==================== RENDER TABEL DAFTAR KONSINYASI ====================
async function renderConsignmentTable(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
        const consignments = await loadConsignments();
        if (consignments.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:20px;">Belum ada konsinyasi. <button class="form-button-primary" onclick="showAddConsignmentForm()">Buat Konsinyasi Baru</button></p>';
            return;
        }
        let html = '<table class="data-table"><thead><tr><th>No. Konsinyasi</th><th>Supplier</th><th>Tanggal Mulai</th><th>Tanggal Akhir</th><th>Status</th><th>Aksi</th></tr></thead><tbody>';
        for (let c of consignments) {
            const supplierName = await getSupplierName(c.supplier_id);
            html += `<tr>
                <td>${c.consignment_number}</td>
                <td>${supplierName}</td>
                <td>${c.start_date ? new Date(c.start_date).toLocaleDateString('id-ID') : '-'}</td>
                <td>${c.end_date ? new Date(c.end_date).toLocaleDateString('id-ID') : '-'}</td>
                <td>${getConsignmentStatusBadge(c.status)}</td>
                <td>
                    <button class="action-btn edit-btn" onclick="editConsignment(${c.id})" title="Edit">✏️</button>
                    <button class="action-btn" onclick="openConsignmentDetail(${c.id})" title="Lihat Item">📋</button>
                    ${c.status === 'active' ? 
                        `<button class="action-btn" onclick="closeConsignment(${c.id})" title="Tutup">🔒</button>` : ''}
                    <button class="action-btn delete-btn" onclick="deleteConsignmentPrompt(${c.id})" title="Hapus">🗑️</button>
                </td>
            </tr>`;
        }
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (error) {
        console.error('Gagal render tabel konsinyasi:', error);
        container.innerHTML = `<p class="error-message" style="color:red; text-align:center;">Gagal memuat data: ${error.message}</p>`;
    }
}

// Helper untuk mendapatkan nama supplier
async function getSupplierName(supplierId) {
    if (!supplierId) return '-';
    try {
        const tx = db.transaction(['suppliers'], 'readonly');
        const store = tx.objectStore('suppliers');
        const req = store.get(supplierId);
        const result = await new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        return result ? result.name : '-';
    } catch {
        return '-';
    }
}

function getConsignmentStatusBadge(status) {
    const map = {
        'active': '<span style="background:#28a745; color:white; padding:2px 8px; border-radius:10px;">Aktif</span>',
        'closed': '<span style="background:#6c757d; color:white; padding:2px 8px; border-radius:10px;">Selesai</span>',
        'returned': '<span style="background:#ffc107; padding:2px 8px; border-radius:10px;">Dikembalikan</span>'
    };
    return map[status] || status;
}

// ==================== FORM TAMBAH/EDIT KONSINYASI ====================
let currentConsignmentId = null;

async function showAddConsignmentForm() {
    currentConsignmentId = null;
    const modal = document.getElementById('consignment-modal');
    if (!modal) {
        alert('Modal konsinyasi tidak ditemukan');
        return;
    }
    document.getElementById('consignment-number').value = await generateConsignmentNumber();
    // Isi dropdown supplier
    const supplierSelect = document.getElementById('consignment-supplier');
    supplierSelect.innerHTML = '<option value="">-- Pilih Supplier --</option>';
    const suppliers = await loadSuppliers(); // asumsikan fungsi loadSuppliers sudah ada di global
    suppliers.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.code} - ${s.name}`;
        supplierSelect.appendChild(opt);
    });
    document.getElementById('consignment-start-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('consignment-end-date').value = '';
    document.getElementById('consignment-notes').value = '';
    document.getElementById('consignment-modal-title').innerHTML = `
        <svg class="icon icon-primary" viewBox="0 0 24 24">
            <circle cx="12" cy="8" r="4"/>
            <path d="M5 20v-2a7 7 0 0 1 14 0v2"/>
            <rect x="2" y="2" width="20" height="20" rx="2" ry="2" stroke="currentColor" fill="none"/>
        </svg> Buat Konsinyasi Baru
    `;
    modal.style.display = 'flex';
}

async function editConsignment(id) {
    try {
        const tx = db.transaction(['consignments'], 'readonly');
        const store = tx.objectStore('consignments');
        const consignment = await new Promise((resolve, reject) => {
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        if (!consignment) throw new Error('Konsinyasi tidak ditemukan');
        currentConsignmentId = id;
        const modal = document.getElementById('consignment-modal');
        document.getElementById('consignment-number').value = consignment.consignment_number;
        document.getElementById('consignment-number').disabled = true; // nomor tidak bisa diubah
        // Isi dropdown supplier
        const suppliers = await loadSuppliers();
        const supplierSelect = document.getElementById('consignment-supplier');
        supplierSelect.innerHTML = '';
        suppliers.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = `${s.code} - ${s.name}`;
            if (s.id == consignment.supplier_id) opt.selected = true;
            supplierSelect.appendChild(opt);
        });
        document.getElementById('consignment-start-date').value = consignment.start_date ? consignment.start_date.split('T')[0] : '';
        document.getElementById('consignment-end-date').value = consignment.end_date ? consignment.end_date.split('T')[0] : '';
        document.getElementById('consignment-notes').value = consignment.notes || '';
        document.getElementById('consignment-modal-title').innerHTML = `
            <svg class="icon icon-primary" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg> Edit Konsinyasi
        `;
        modal.style.display = 'flex';
    } catch (error) {
        alert('Gagal memuat data: ' + error.message);
    }
}

async function saveConsignmentFromForm() {
    const number = document.getElementById('consignment-number').value.trim();
    const supplier_id = parseInt(document.getElementById('consignment-supplier').value);
    const start_date = document.getElementById('consignment-start-date').value;
    const end_date = document.getElementById('consignment-end-date').value;
    const notes = document.getElementById('consignment-notes').value.trim();

    if (!number || !supplier_id || !start_date) {
        alert('Nomor, Supplier, dan Tanggal Mulai harus diisi');
        return;
    }

    try {
        if (typeof showLoading === 'function') showLoading();
        const data = {
            consignment_number: number,
            supplier_id,
            start_date: start_date ? new Date(start_date).toISOString() : null,
            end_date: end_date ? new Date(end_date).toISOString() : null,
            notes,
            status: 'active'
        };
        await saveConsignment(data, currentConsignmentId);
        if (typeof hideLoading === 'function') hideLoading();
        closeConsignmentModal();
        await renderConsignmentTable('consignment-table-container');
        if (typeof showNotification === 'function') {
            showNotification('Konsinyasi berhasil disimpan', 'success');
        } else {
            alert('Konsinyasi berhasil disimpan');
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

function closeConsignmentModal() {
    const modal = document.getElementById('consignment-modal');
    if (modal) modal.style.display = 'none';
    currentConsignmentId = null;
    // Aktifkan kembali input nomor
    const numInput = document.getElementById('consignment-number');
    if (numInput) numInput.disabled = false;
}

async function deleteConsignmentPrompt(id) {
    if (!confirm('Hapus konsinyasi ini? Semua data item akan ikut terhapus.')) return;
    try {
        if (typeof showLoading === 'function') showLoading();
        await deleteConsignment(id);
        if (typeof hideLoading === 'function') hideLoading();
        await renderConsignmentTable('consignment-table-container');
        if (typeof showNotification === 'function') {
            showNotification('Konsinyasi dihapus', 'success');
        } else {
            alert('Konsinyasi dihapus');
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

// ==================== HALAMAN DETAIL KONSINYASI (INPUT ITEM) ====================
let currentDetailConsignmentId = null;

async function openConsignmentDetail(consignmentId) {
    currentDetailConsignmentId = consignmentId;
    // Sembunyikan konten utama, tampilkan halaman detail
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.style.display = 'none';
    // Sembunyikan halaman lain
    document.getElementById('transaksi-page').style.display = 'none';
    document.getElementById('cart-page').style.display = 'none';
    document.getElementById('payment-page').style.display = 'none';
    document.getElementById('drive-backup-page').style.display = 'none';

    const detailContainer = document.getElementById('consignment-detail-page');
    if (!detailContainer) {
        alert('Halaman detail konsinyasi belum tersedia');
        return;
    }
    detailContainer.style.display = 'block';

    try {
        const tx = db.transaction(['consignments'], 'readonly');
        const store = tx.objectStore('consignments');
        const consignment = await new Promise((resolve, reject) => {
            const req = store.get(consignmentId);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        if (!consignment) throw new Error('Konsinyasi tidak ditemukan');

        document.getElementById('detail-consignment-number').textContent = consignment.consignment_number;
        document.getElementById('detail-supplier').textContent = await getSupplierName(consignment.supplier_id);
        document.getElementById('detail-start-date').textContent = consignment.start_date ? new Date(consignment.start_date).toLocaleDateString('id-ID') : '-';
        document.getElementById('detail-end-date').textContent = consignment.end_date ? new Date(consignment.end_date).toLocaleDateString('id-ID') : '-';
        document.getElementById('detail-consignment-notes').textContent = consignment.notes || '-';
        document.getElementById('detail-consignment-status').innerHTML = getConsignmentStatusBadge(consignment.status);

        // Render daftar item
        await renderConsignmentItemList(consignmentId);
    } catch (error) {
        alert('Gagal memuat detail: ' + error.message);
    }
}

function closeConsignmentDetail() {
    const detailContainer = document.getElementById('consignment-detail-page');
    if (detailContainer) detailContainer.style.display = 'none';
    document.querySelector('.main-content').style.display = 'block';
    currentDetailConsignmentId = null;
}

// Render tabel item untuk menambah/melihat item konsinyasi
async function renderConsignmentItemList(consignmentId) {
    const tbody = document.getElementById('consignment-item-tbody');
    if (!tbody) return;
    try {
        const items = await loadConsignmentItems(consignmentId);
        let html = '';
        for (let item of items) {
            // Ambil nama item
            const itemName = await getItemName(item.item_id);
            html += `<tr>
                <td>${itemName}</td>
                <td>${item.batch_id ? 'Batch: ' + item.batch_id : '-'}</td>
                <td>${item.quantity}</td>
                <td>${formatRupiah(item.price_agreed || 0)}</td>
                <td>${item.sold_quantity || 0}</td>
                <td>${item.returned_quantity || 0}</td>
                <td>${(item.quantity - (item.sold_quantity || 0) - (item.returned_quantity || 0))}</td>
                <td>
                    <button class="action-btn delete-btn" onclick="deleteConsignmentItemPrompt(${item.id})" title="Hapus">🗑️</button>
                </td>
            </tr>`;
        }
        // Baris untuk tambah item baru
        html += `<tr id="new-consignment-item-row">
            <td>
                <select id="new-item-select" class="form-input">
                    <option value="">-- Pilih Item --</option>
                </select>
            </td>
            <td><input type="text" id="new-batch" class="form-input" placeholder="Batch (opsional)"></td>
            <td><input type="number" id="new-qty" class="form-input" min="0" step="0.01" value="1"></td>
            <td><input type="number" id="new-price" class="form-input" min="0" step="0.01" value="0"></td>
            <td colspan="3"></td>
            <td><button class="action-btn edit-btn" onclick="addConsignmentItem()" title="Tambah">➕</button></td>
        </tr>`;
        tbody.innerHTML = html;

        // Isi dropdown item
        const itemSelect = document.getElementById('new-item-select');
        if (itemSelect) {
            const items = await loadKasirItems(); // asumsikan ada di global
            items.forEach(it => {
                const opt = document.createElement('option');
                opt.value = it.id;
                opt.textContent = `${it.code} - ${it.name}`;
                itemSelect.appendChild(opt);
            });
        }
    } catch (error) {
        console.error('Gagal render item list:', error);
        tbody.innerHTML = `<tr><td colspan="8" style="color:red; text-align:center;">Gagal memuat data: ${error.message}</td></tr>`;
    }
}

// Helper untuk mendapatkan nama item
async function getItemName(itemId) {
    try {
        const tx = db.transaction(['kasirItems'], 'readonly');
        const store = tx.objectStore('kasirItems');
        const req = store.get(itemId);
        const result = await new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        return result ? result.name : '-';
    } catch {
        return '-';
    }
}

// Tambah item baru ke konsinyasi
async function addConsignmentItem() {
    const itemId = parseInt(document.getElementById('new-item-select').value);
    const batch = document.getElementById('new-batch').value.trim();
    const qty = parseFloat(document.getElementById('new-qty').value) || 0;
    const price = parseFloat(document.getElementById('new-price').value) || 0;

    if (!itemId || qty <= 0 || price <= 0) {
        alert('Item, jumlah, dan harga harus diisi dengan benar');
        return;
    }

    try {
        if (typeof showLoading === 'function') showLoading();
        const newItem = {
            consignment_id: currentDetailConsignmentId,
            item_id: itemId,
            batch_id: batch || null,
            quantity: qty,
            price_agreed: price,
            sold_quantity: 0,
            returned_quantity: 0
        };
        await saveConsignmentItem(newItem);
        if (typeof hideLoading === 'function') hideLoading();
        // Refresh daftar item
        await renderConsignmentItemList(currentDetailConsignmentId);
        if (typeof showNotification === 'function') {
            showNotification('Item berhasil ditambahkan', 'success');
        }
    } catch (error) {
        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showNotification === 'function') {
            showNotification('Gagal menambah item: ' + error.message, 'error');
        } else {
            alert('Gagal: ' + error.message);
        }
    }
}

async function deleteConsignmentItemPrompt(itemId) {
    if (!confirm('Hapus item ini dari konsinyasi?')) return;
    try {
        if (typeof showLoading === 'function') showLoading();
        await deleteConsignmentItem(itemId);
        if (typeof hideLoading === 'function') hideLoading();
        await renderConsignmentItemList(currentDetailConsignmentId);
        if (typeof showNotification === 'function') {
            showNotification('Item dihapus', 'success');
        }
    } catch (error) {
        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showNotification === 'function') {
            showNotification('Gagal hapus: ' + error.message, 'error');
        } else {
            alert('Gagal: ' + error.message);
        }
    }
}

// ==================== FUNGSI UNTUK PENJUALAN KONSINYASI ====================
// Fungsi ini akan dipanggil saat transaksi penjualan yang melibatkan item konsinyasi
async function recordConsignmentSale(consignmentId, itemId, qtySold, batchId = null) {
    try {
        // Cari item konsinyasi yang sesuai
        const items = await loadConsignmentItems(consignmentId);
        const target = items.find(i => i.item_id === itemId && i.batch_id === batchId);
        if (!target) throw new Error('Item konsinyasi tidak ditemukan');

        const newSold = (target.sold_quantity || 0) + qtySold;
        if (newSold > target.quantity) {
            throw new Error('Jumlah terjual melebihi stok konsinyasi');
        }

        target.sold_quantity = newSold;
        await saveConsignmentItem(target);
        return true;
    } catch (error) {
        console.error('Gagal mencatat penjualan konsinyasi:', error);
        throw error;
    }
}

// ==================== FUNGSI UNTUK PENGEMBALIAN KONSINYASI ====================
async function returnConsignmentItem(consignmentId, itemId, qtyReturn, batchId = null) {
    try {
        const items = await loadConsignmentItems(consignmentId);
        const target = items.find(i => i.item_id === itemId && i.batch_id === batchId);
        if (!target) throw new Error('Item konsinyasi tidak ditemukan');

        const newReturn = (target.returned_quantity || 0) + qtyReturn;
        if (newReturn > target.quantity - (target.sold_quantity || 0)) {
            throw new Error('Jumlah kembali melebihi sisa stok');
        }

        target.returned_quantity = newReturn;
        await saveConsignmentItem(target);
        return true;
    } catch (error) {
        console.error('Gagal mencatat pengembalian konsinyasi:', error);
        throw error;
    }
}

// ==================== MENUTUP KONSINYASI ====================
async function closeConsignment(id) {
    if (!confirm('Tutup konsinyasi ini? Semua sisa barang akan dianggap sebagai pengembalian?')) return;
    try {
        if (typeof showLoading === 'function') showLoading();
        const tx = db.transaction(['consignments'], 'readwrite');
        const store = tx.objectStore('consignments');
        const consignment = await new Promise((resolve, reject) => {
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        if (!consignment) throw new Error('Konsinyasi tidak ditemukan');
        consignment.status = 'closed';
        consignment.end_date = new Date().toISOString();
        await new Promise((resolve, reject) => {
            const req = store.put(consignment);
            req.onsuccess = resolve;
            req.onerror = reject;
        });
        if (typeof hideLoading === 'function') hideLoading();
        await renderConsignmentTable('consignment-table-container');
        if (typeof showNotification === 'function') {
            showNotification('Konsinyasi ditutup', 'success');
        }
    } catch (error) {
        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showNotification === 'function') {
            showNotification('Gagal menutup: ' + error.message, 'error');
        } else {
            alert('Gagal: ' + error.message);
        }
    }
}

// ==================== LAPORAN KONSINYASI SEDERHANA ====================
async function generateConsignmentReport(consignmentId) {
    try {
        const consignment = await new Promise((resolve, reject) => {
            const tx = db.transaction(['consignments'], 'readonly');
            const store = tx.objectStore('consignments');
            const req = store.get(consignmentId);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        const items = await loadConsignmentItems(consignmentId);
        const supplierName = await getSupplierName(consignment.supplier_id);

        let totalAgreed = 0;
        let totalSold = 0;
        let totalReturn = 0;
        let reportItems = [];

        for (let it of items) {
            const itemName = await getItemName(it.item_id);
            const subtotalAgreed = it.quantity * it.price_agreed;
            const subtotalSold = (it.sold_quantity || 0) * it.price_agreed;
            const subtotalReturn = (it.returned_quantity || 0) * it.price_agreed;

            totalAgreed += subtotalAgreed;
            totalSold += subtotalSold;
            totalReturn += subtotalReturn;

            reportItems.push({
                itemName,
                batch: it.batch_id,
                qty: it.quantity,
                price: it.price_agreed,
                sold: it.sold_quantity || 0,
                returned: it.returned_quantity || 0,
                subtotalAgreed,
                subtotalSold,
                subtotalReturn
            });
        }

        return {
            consignmentNumber: consignment.consignment_number,
            supplier: supplierName,
            startDate: consignment.start_date,
            endDate: consignment.end_date,
            status: consignment.status,
            items: reportItems,
            totalAgreed,
            totalSold,
            totalReturn,
            remaining: totalAgreed - totalSold - totalReturn
        };
    } catch (error) {
        console.error('Gagal generate report:', error);
        throw error;
    }
}

// Ekspor fungsi ke global
window.loadConsignments = loadConsignments;
window.generateConsignmentNumber = generateConsignmentNumber;
window.saveConsignment = saveConsignment;
window.deleteConsignment = deleteConsignment;
window.loadConsignmentItems = loadConsignmentItems;
window.saveConsignmentItem = saveConsignmentItem;
window.deleteConsignmentItem = deleteConsignmentItem;
window.renderConsignmentTable = renderConsignmentTable;
window.showAddConsignmentForm = showAddConsignmentForm;
window.editConsignment = editConsignment;
window.saveConsignmentFromForm = saveConsignmentFromForm;
window.closeConsignmentModal = closeConsignmentModal;
window.deleteConsignmentPrompt = deleteConsignmentPrompt;
window.openConsignmentDetail = openConsignmentDetail;
window.closeConsignmentDetail = closeConsignmentDetail;
window.addConsignmentItem = addConsignmentItem;
window.deleteConsignmentItemPrompt = deleteConsignmentItemPrompt;
window.recordConsignmentSale = recordConsignmentSale;
window.returnConsignmentItem = returnConsignmentItem;
window.closeConsignment = closeConsignment;
window.generateConsignmentReport = generateConsignmentReport;
