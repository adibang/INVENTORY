// transfer.js
// Manajemen transfer stok antar gudang

// ==================== LOAD SEMUA TRANSFER ====================
async function loadTransfers() {
    try {
        if (!db) throw new Error('Database belum diinisialisasi');
        const transaction = db.transaction(['transfers'], 'readonly');
        const store = transaction.objectStore('transfers');
        const request = store.getAll();
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const transfers = request.result || [];
                transfers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                resolve(transfers);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    } catch (error) {
        console.error('Error loadTransfers:', error);
        return [];
    }
}

// ==================== LOAD ITEM TRANSFER BERDASARKAN TRANSFER ID ====================
async function loadTransferItems(transferId) {
    try {
        if (!db) throw new Error('Database belum diinisialisasi');
        const transaction = db.transaction(['transfer_items'], 'readonly');
        const store = transaction.objectStore('transfer_items');
        const index = store.index('transferId');
        const range = IDBKeyRange.only(transferId);
        const request = index.getAll(range);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    } catch (error) {
        console.error('Error loadTransferItems:', error);
        return [];
    }
}

// ==================== GENERATE NOMOR TRANSFER ====================
async function generateTransferNumber() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    let lastCounter = 0;
    try {
        const transaction = db.transaction([STORES.SETTINGS], 'readonly');
        const store = transaction.objectStore(STORES.SETTINGS);
        const request = store.get('lastTransferNumber');
        await new Promise((resolve, reject) => {
            request.onsuccess = () => {
                if (request.result) {
                    const data = request.result.value;
                    if (data.date === dateStr) {
                        lastCounter = data.counter;
                    }
                }
                resolve();
            };
            request.onerror = reject;
        });
    } catch (error) {
        console.warn('Gagal membaca counter transfer:', error);
    }

    const newCounter = lastCounter + 1;
    const transferNumber = `TRF-${dateStr}-${String(newCounter).padStart(5, '0')}`;

    try {
        await dbPut(STORES.SETTINGS, {
            key: 'lastTransferNumber',
            value: { date: dateStr, counter: newCounter }
        });
    } catch (error) {
        console.error('Gagal menyimpan counter transfer:', error);
    }

    return transferNumber;
}

// ==================== MEMBUAT TRANSFER BARU (DRAFT) ====================
async function createTransfer(transferData, items) {
    try {
        if (!db) throw new Error('Database belum diinisialisasi');
        const now = new Date().toISOString();
        const transferNumber = await generateTransferNumber();

        const transaction = db.transaction(['transfers', 'transfer_items'], 'readwrite');
        const transferStore = transaction.objectStore('transfers');
        const itemStore = transaction.objectStore('transfer_items');

        // Simpan header transfer
        const newTransfer = {
            transferNumber,
            fromWarehouseId: transferData.fromWarehouseId,
            toWarehouseId: transferData.toWarehouseId,
            status: 'draft', // draft, sent, received, cancelled
            requestedBy: currentUser ? currentUser.id : null,
            requestedAt: now,
            notes: transferData.notes || '',
            createdAt: now,
            updatedAt: now
        };
        const transferId = await new Promise((resolve, reject) => {
            const req = transferStore.add(newTransfer);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });

        // Simpan item-item transfer
        for (let item of items) {
            const transferItem = {
                transferId,
                itemId: item.itemId,
                batchId: item.batchId || null,
                serialIds: item.serialIds || [], // array of serial ids jika ada
                quantity: item.quantity,
                unitCost: item.unitCost || 0, // harga pokok saat transfer (untuk akuntansi)
                notes: item.notes || ''
            };
            await new Promise((resolve, reject) => {
                const req = itemStore.add(transferItem);
                req.onsuccess = resolve;
                req.onerror = reject;
            });
        }

        return transferId;
    } catch (error) {
        console.error('Error createTransfer:', error);
        throw error;
    }
}

// ==================== MENGIRIM TRANSFER (UBAH STATUS MENJADI SENT) ====================
async function sendTransfer(transferId) {
    try {
        if (!db) throw new Error('Database belum diinisialisasi');
        const transaction = db.transaction(['transfers', 'transfer_items', 'item_stocks', 'stock_movements'], 'readwrite');
        const transferStore = transaction.objectStore('transfers');
        const itemStore = transaction.objectStore('transfer_items');
        const stockStore = transaction.objectStore('item_stocks');
        const movementStore = transaction.objectStore('stock_movements');

        // Ambil data transfer
        const transfer = await new Promise((resolve, reject) => {
            const req = transferStore.get(transferId);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        if (!transfer) throw new Error('Transfer tidak ditemukan');
        if (transfer.status !== 'draft') throw new Error('Transfer sudah diproses');

        // Ambil item-item transfer
        const index = itemStore.index('transferId');
        const range = IDBKeyRange.only(transferId);
        const items = await new Promise((resolve, reject) => {
            const req = index.getAll(range);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });

        // Kurangi stok dari gudang asal
        for (let item of items) {
            // Cari stok di gudang asal
            const stockIndex = stockStore.index('item_warehouse');
            const stockRange = IDBKeyRange.only([item.itemId, transfer.fromWarehouseId]);
            const stockRequest = stockIndex.get(stockRange);
            const stock = await new Promise((resolve, reject) => {
                stockRequest.onsuccess = () => resolve(stockRequest.result);
                stockRequest.onerror = reject;
            });
            if (!stock || stock.quantity < item.quantity) {
                throw new Error(`Stok item ID ${item.itemId} tidak cukup di gudang asal`);
            }

            // Kurangi stok
            stock.quantity -= item.quantity;
            stock.updatedAt = new Date().toISOString();
            await new Promise((resolve, reject) => {
                const req = stockStore.put(stock);
                req.onsuccess = resolve;
                req.onerror = reject;
            });

            // Catat stock movement (pengurangan)
            const movement = {
                movementType: 'transfer_out',
                itemId: item.itemId,
                warehouseId: transfer.fromWarehouseId,
                quantity: -item.quantity,
                referenceId: transferId,
                referenceType: 'transfer',
                batchId: item.batchId,
                serialId: null, // nanti bisa dipecah per serial
                unitCost: item.unitCost,
                createdAt: new Date().toISOString(),
                createdBy: currentUser ? currentUser.id : null,
                notes: `Transfer ke gudang ${transfer.toWarehouseId}`
            };
            await new Promise((resolve, reject) => {
                const req = movementStore.add(movement);
                req.onsuccess = resolve;
                req.onerror = reject;
            });
        }

        // Update status transfer menjadi 'sent'
        transfer.status = 'sent';
        transfer.sentAt = new Date().toISOString();
        transfer.updatedAt = new Date().toISOString();
        await new Promise((resolve, reject) => {
            const req = transferStore.put(transfer);
            req.onsuccess = resolve;
            req.onerror = reject;
        });

        return true;
    } catch (error) {
        console.error('Error sendTransfer:', error);
        throw error;
    }
}

// ==================== MENERIMA TRANSFER (UBAH STATUS MENJADI RECEIVED) ====================
async function receiveTransfer(transferId) {
    try {
        if (!db) throw new Error('Database belum diinisialisasi');
        const transaction = db.transaction(['transfers', 'transfer_items', 'item_stocks', 'stock_movements'], 'readwrite');
        const transferStore = transaction.objectStore('transfers');
        const itemStore = transaction.objectStore('transfer_items');
        const stockStore = transaction.objectStore('item_stocks');
        const movementStore = transaction.objectStore('stock_movements');

        // Ambil data transfer
        const transfer = await new Promise((resolve, reject) => {
            const req = transferStore.get(transferId);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        if (!transfer) throw new Error('Transfer tidak ditemukan');
        if (transfer.status !== 'sent') throw new Error('Transfer belum dikirim atau sudah diterima');

        // Ambil item-item transfer
        const index = itemStore.index('transferId');
        const range = IDBKeyRange.only(transferId);
        const items = await new Promise((resolve, reject) => {
            const req = index.getAll(range);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });

        // Tambah stok ke gudang tujuan
        for (let item of items) {
            // Cari atau buat stok di gudang tujuan
            const stockIndex = stockStore.index('item_warehouse');
            const stockRange = IDBKeyRange.only([item.itemId, transfer.toWarehouseId]);
            let stock = await new Promise((resolve, reject) => {
                const req = stockIndex.get(stockRange);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });

            if (stock) {
                stock.quantity += item.quantity;
                stock.updatedAt = new Date().toISOString();
            } else {
                // Buat entri stok baru
                stock = {
                    itemId: item.itemId,
                    warehouseId: transfer.toWarehouseId,
                    quantity: item.quantity,
                    minStock: 0,
                    maxStock: null,
                    reorderPoint: 0,
                    updatedAt: new Date().toISOString()
                };
            }
            await new Promise((resolve, reject) => {
                const req = stockStore.put(stock);
                req.onsuccess = resolve;
                req.onerror = reject;
            });

            // Catat stock movement (penambahan)
            const movement = {
                movementType: 'transfer_in',
                itemId: item.itemId,
                warehouseId: transfer.toWarehouseId,
                quantity: item.quantity,
                referenceId: transferId,
                referenceType: 'transfer',
                batchId: item.batchId,
                serialId: null,
                unitCost: item.unitCost,
                createdAt: new Date().toISOString(),
                createdBy: currentUser ? currentUser.id : null,
                notes: `Transfer dari gudang ${transfer.fromWarehouseId}`
            };
            await new Promise((resolve, reject) => {
                const req = movementStore.add(movement);
                req.onsuccess = resolve;
                req.onerror = reject;
            });
        }

        // Update status transfer menjadi 'received'
        transfer.status = 'received';
        transfer.receivedAt = new Date().toISOString();
        transfer.updatedAt = new Date().toISOString();
        await new Promise((resolve, reject) => {
            const req = transferStore.put(transfer);
            req.onsuccess = resolve;
            req.onerror = reject;
        });

        return true;
    } catch (error) {
        console.error('Error receiveTransfer:', error);
        throw error;
    }
}

// ==================== MEMBATALKAN TRANSFER ====================
async function cancelTransfer(transferId) {
    try {
        if (!db) throw new Error('Database belum diinisialisasi');
        const transaction = db.transaction(['transfers'], 'readwrite');
        const transferStore = transaction.objectStore('transfers');

        const transfer = await new Promise((resolve, reject) => {
            const req = transferStore.get(transferId);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        if (!transfer) throw new Error('Transfer tidak ditemukan');
        if (transfer.status !== 'draft') {
            throw new Error('Hanya transfer dengan status draft yang dapat dibatalkan');
        }

        transfer.status = 'cancelled';
        transfer.updatedAt = new Date().toISOString();
        await new Promise((resolve, reject) => {
            const req = transferStore.put(transfer);
            req.onsuccess = resolve;
            req.onerror = reject;
        });

        return true;
    } catch (error) {
        console.error('Error cancelTransfer:', error);
        throw error;
    }
}

// ==================== MENGHAPUS TRANSFER (HANYA DRAFT) ====================
async function deleteTransfer(transferId) {
    try {
        if (!db) throw new Error('Database belum diinisialisasi');
        const transaction = db.transaction(['transfers', 'transfer_items'], 'readwrite');
        const transferStore = transaction.objectStore('transfers');
        const itemStore = transaction.objectStore('transfer_items');

        const transfer = await new Promise((resolve, reject) => {
            const req = transferStore.get(transferId);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        if (!transfer) throw new Error('Transfer tidak ditemukan');
        if (transfer.status !== 'draft') {
            throw new Error('Hanya transfer draft yang dapat dihapus');
        }

        // Hapus item-item terkait
        const index = itemStore.index('transferId');
        const range = IDBKeyRange.only(transferId);
        const items = await new Promise((resolve, reject) => {
            const req = index.getAll(range);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        for (let item of items) {
            await new Promise((resolve, reject) => {
                const req = itemStore.delete(item.id);
                req.onsuccess = resolve;
                req.onerror = reject;
            });
        }

        // Hapus header transfer
        await new Promise((resolve, reject) => {
            const req = transferStore.delete(transferId);
            req.onsuccess = resolve;
            req.onerror = reject;
        });

        return true;
    } catch (error) {
        console.error('Error deleteTransfer:', error);
        throw error;
    }
}

// ==================== RENDER TABEL TRANSFER ====================
async function renderTransferTable(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
        const transfers = await loadTransfers();
        const warehouses = await loadWarehouses();
        if (transfers.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:20px;">Belum ada transfer. <button class="form-button-primary" onclick="showAddTransferPage()">Buat Transfer Baru</button></p>';
            return;
        }
        let html = '<table class="data-table"><thead><tr><th>No. Transfer</th><th>Tanggal</th><th>Dari Gudang</th><th>Ke Gudang</th><th>Status</th><th>Aksi</th></tr></thead><tbody>';
        for (let t of transfers) {
            const fromWarehouse = warehouses.find(w => w.id === t.fromWarehouseId);
            const toWarehouse = warehouses.find(w => w.id === t.toWarehouseId);
            const fromName = fromWarehouse ? fromWarehouse.name : 'Unknown';
            const toName = toWarehouse ? toWarehouse.name : 'Unknown';
            let statusClass = '';
            if (t.status === 'draft') statusClass = 'status-draft';
            else if (t.status === 'sent') statusClass = 'status-sent';
            else if (t.status === 'received') statusClass = 'status-received';
            else if (t.status === 'cancelled') statusClass = 'status-cancelled';

            html += `<tr>
                <td>${t.transferNumber}</td>
                <td>${new Date(t.createdAt).toLocaleDateString('id-ID')}</td>
                <td>${fromName}</td>
                <td>${toName}</td>
                <td class="${statusClass}">${t.status}</td>
                <td>
                    <button class="action-btn view-btn" onclick="viewTransfer(${t.id})" title="Lihat Detail">
                        <svg viewBox="0 0 24 24" width="18" height="18">
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        </svg>
                    </button>
                    ${t.status === 'draft' ? `
                        <button class="action-btn edit-btn" onclick="editTransfer(${t.id})" title="Edit">
                            <svg viewBox="0 0 24 24" width="18" height="18">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="action-btn send-btn" onclick="sendTransferPrompt(${t.id})" title="Kirim">
                            <svg viewBox="0 0 24 24" width="18" height="18">
                                <line x1="22" y1="2" x2="11" y2="13"/>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                            </svg>
                        </button>
                        <button class="action-btn delete-btn" onclick="deleteTransferPrompt(${t.id})" title="Hapus">
                            <svg viewBox="0 0 24 24" width="18" height="18">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    ` : t.status === 'sent' ? `
                        <button class="action-btn receive-btn" onclick="receiveTransferPrompt(${t.id})" title="Terima">
                            <svg viewBox="0 0 24 24" width="18" height="18">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                        </button>
                    ` : ''}
                    ${t.status === 'draft' ? `
                        <button class="action-btn cancel-btn" onclick="cancelTransferPrompt(${t.id})" title="Batal">
                            <svg viewBox="0 0 24 24" width="18" height="18">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="18" y1="6" x2="6" y2="18"/>
                            </svg>
                        </button>
                    ` : ''}
                </td>
            </tr>`;
        }
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (error) {
        console.error('Gagal render tabel transfer:', error);
        container.innerHTML = `<p class="error-message" style="color:red; text-align:center;">Gagal memuat data: ${error.message}</p>`;
    }
}

// ==================== FUNGSI PROMPT UNTUK KONFIRMASI ====================
async function sendTransferPrompt(id) {
    if (!confirm('Kirim transfer ini? Stok akan dikurangi dari gudang asal.')) return;
    try {
        if (typeof showLoading === 'function') showLoading();
        await sendTransfer(id);
        if (typeof hideLoading === 'function') hideLoading();
        await renderTransferTable('transfer-table-container');
        if (typeof showNotification === 'function') {
            showNotification('Transfer berhasil dikirim', 'success');
        }
    } catch (error) {
        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showNotification === 'function') {
            showNotification('Gagal mengirim: ' + error.message, 'error');
        } else {
            alert('Gagal: ' + error.message);
        }
    }
}

async function receiveTransferPrompt(id) {
    if (!confirm('Terima transfer ini? Stok akan ditambahkan ke gudang tujuan.')) return;
    try {
        if (typeof showLoading === 'function') showLoading();
        await receiveTransfer(id);
        if (typeof hideLoading === 'function') hideLoading();
        await renderTransferTable('transfer-table-container');
        if (typeof showNotification === 'function') {
            showNotification('Transfer berhasil diterima', 'success');
        }
    } catch (error) {
        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showNotification === 'function') {
            showNotification('Gagal menerima: ' + error.message, 'error');
        } else {
            alert('Gagal: ' + error.message);
        }
    }
}

async function cancelTransferPrompt(id) {
    if (!confirm('Batalkan transfer ini?')) return;
    try {
        if (typeof showLoading === 'function') showLoading();
        await cancelTransfer(id);
        if (typeof hideLoading === 'function') hideLoading();
        await renderTransferTable('transfer-table-container');
        if (typeof showNotification === 'function') {
            showNotification('Transfer dibatalkan', 'success');
        }
    } catch (error) {
        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showNotification === 'function') {
            showNotification('Gagal membatalkan: ' + error.message, 'error');
        } else {
            alert('Gagal: ' + error.message);
        }
    }
}

async function deleteTransferPrompt(id) {
    if (!confirm('Hapus transfer ini? (Hanya draft yang bisa dihapus)')) return;
    try {
        if (typeof showLoading === 'function') showLoading();
        await deleteTransfer(id);
        if (typeof hideLoading === 'function') hideLoading();
        await renderTransferTable('transfer-table-container');
        if (typeof showNotification === 'function') {
            showNotification('Transfer dihapus', 'success');
        }
    } catch (error) {
        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showNotification === 'function') {
            showNotification('Gagal menghapus: ' + error.message, 'error');
        } else {
            alert('Gagal: ' + error.message);
        }
    }
}

// ==================== FUNGSI UNTUK HALAMAN FORM TRANSFER ====================
let editingTransferId = null;

async function showAddTransferPage() {
    // Redirect atau tampilkan form di halaman terpisah
    window.location.href = 'transfer.html?action=add';
}

async function showEditTransferPage(id) {
    window.location.href = `transfer.html?action=edit&id=${id}`;
}

async function viewTransfer(id) {
    window.location.href = `transfer.html?action=view&id=${id}`;
}

// Ekspor fungsi ke global
window.loadTransfers = loadTransfers;
window.loadTransferItems = loadTransferItems;
window.createTransfer = createTransfer;
window.sendTransfer = sendTransfer;
window.receiveTransfer = receiveTransfer;
window.cancelTransfer = cancelTransfer;
window.deleteTransfer = deleteTransfer;
window.renderTransferTable = renderTransferTable;
window.sendTransferPrompt = sendTransferPrompt;
window.receiveTransferPrompt = receiveTransferPrompt;
window.cancelTransferPrompt = cancelTransferPrompt;
window.deleteTransferPrompt = deleteTransferPrompt;
window.showAddTransferPage = showAddTransferPage;
window.showEditTransferPage = showEditTransferPage;
window.viewTransfer = viewTransfer;
