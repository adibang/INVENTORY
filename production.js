// production.js
// Manajemen Produksi (Manufacturing) untuk sistem inventori multi-gudang

// ==================== LOAD SEMUA BOM ====================
async function loadBOMs() {
    try {
        if (!db) throw new Error('Database belum diinisialisasi');
        const transaction = db.transaction(['bill_of_materials'], 'readonly');
        const store = transaction.objectStore('bill_of_materials');
        const request = store.getAll();
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const boms = request.result || [];
                boms.sort((a, b) => a.name.localeCompare(b.name));
                resolve(boms);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    } catch (error) {
        console.error('Error loadBOMs:', error);
        return [];
    }
}

// ==================== LOAD SATU BOM ====================
async function getBOM(id) {
    try {
        const tx = db.transaction(['bill_of_materials'], 'readonly');
        const store = tx.objectStore('bill_of_materials');
        const request = store.get(id);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = reject;
        });
    } catch (error) {
        console.error('Error getBOM:', error);
        return null;
    }
}

// ==================== SIMPAN BOM ====================
async function saveBOM(bomData, id = null) {
    try {
        const now = new Date().toISOString();
        if (id) {
            // Update
            const tx = db.transaction(['bill_of_materials'], 'readwrite');
            const store = tx.objectStore('bill_of_materials');
            const existing = await new Promise((resolve, reject) => {
                const req = store.get(id);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            if (!existing) throw new Error('BOM tidak ditemukan');
            const updated = { ...existing, ...bomData, updatedAt: now };
            await new Promise((resolve, reject) => {
                const req = store.put(updated);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            return updated;
        } else {
            // Tambah baru
            const newBOM = {
                ...bomData,
                createdAt: now,
                updatedAt: now
            };
            const tx = db.transaction(['bill_of_materials'], 'readwrite');
            const store = tx.objectStore('bill_of_materials');
            const newId = await new Promise((resolve, reject) => {
                const req = store.add(newBOM);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            newBOM.id = newId;
            return newBOM;
        }
    } catch (error) {
        console.error('Gagal menyimpan BOM:', error);
        throw error;
    }
}

// ==================== HAPUS BOM ====================
async function deleteBOM(id) {
    try {
        const tx = db.transaction(['bill_of_materials'], 'readwrite');
        const store = tx.objectStore('bill_of_materials');
        await new Promise((resolve, reject) => {
            const req = store.delete(id);
            req.onsuccess = resolve;
            req.onerror = reject;
        });
        return true;
    } catch (error) {
        console.error('Gagal menghapus BOM:', error);
        throw error;
    }
}

// ==================== LOAD SEMUA PRODUKSI ====================
async function loadProductions() {
    try {
        if (!db) throw new Error('Database belum diinisialisasi');
        const transaction = db.transaction(['productions'], 'readonly');
        const store = transaction.objectStore('productions');
        const request = store.getAll();
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const productions = request.result || [];
                productions.sort((a, b) => new Date(b.production_date) - new Date(a.production_date));
                resolve(productions);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    } catch (error) {
        console.error('Error loadProductions:', error);
        return [];
    }
}

// ==================== LOAD ITEM PRODUKSI ====================
async function loadProductionItems(productionId) {
    try {
        const tx = db.transaction(['production_items'], 'readonly');
        const store = tx.objectStore('production_items');
        const index = store.index('productionId');
        const range = IDBKeyRange.only(productionId);
        const request = index.getAll(range);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = reject;
        });
    } catch (error) {
        console.error('Error loadProductionItems:', error);
        return [];
    }
}

// ==================== GENERATE NOMOR PRODUKSI ====================
async function generateProductionNumber() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    try {
        const transaction = db.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get('lastProductionNumber');
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
        const productionNumber = `PR-${dateStr}-${String(newCounter).padStart(4, '0')}`;

        // Simpan counter terbaru
        const putTx = db.transaction(['settings'], 'readwrite');
        const putStore = putTx.objectStore('settings');
        await new Promise((resolve, reject) => {
            const req = putStore.put({
                key: 'lastProductionNumber',
                value: { date: dateStr, counter: newCounter }
            });
            req.onsuccess = resolve;
            req.onerror = reject;
        });

        return productionNumber;
    } catch (error) {
        console.warn('Gagal generate nomor produksi, pakai fallback', error);
        return `PR-${dateStr}-${Date.now().toString().slice(-4)}`;
    }
}

// ==================== SIMPAN PRODUKSI (HEADER) ====================
async function saveProduction(data, id = null) {
    try {
        const now = new Date().toISOString();
        if (id) {
            // Update
            const tx = db.transaction(['productions'], 'readwrite');
            const store = tx.objectStore('productions');
            const existing = await new Promise((resolve, reject) => {
                const req = store.get(id);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            if (!existing) throw new Error('Produksi tidak ditemukan');
            const updated = { ...existing, ...data, updatedAt: now };
            await new Promise((resolve, reject) => {
                const req = store.put(updated);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            return updated;
        } else {
            // Tambah baru
            const newProduction = {
                ...data,
                createdAt: now,
                updatedAt: now,
                status: data.status || 'draft' // draft, completed, cancelled
            };
            const tx = db.transaction(['productions'], 'readwrite');
            const store = tx.objectStore('productions');
            const newId = await new Promise((resolve, reject) => {
                const req = store.add(newProduction);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            newProduction.id = newId;
            return newProduction;
        }
    } catch (error) {
        console.error('Gagal menyimpan produksi:', error);
        throw error;
    }
}

// ==================== HAPUS PRODUKSI ====================
async function deleteProduction(id) {
    try {
        // Cek apakah sudah completed? Jika ya, sebaiknya tidak dihapus
        const tx = db.transaction(['productions', 'production_items'], 'readwrite');
        const prodStore = tx.objectStore('productions');
        const itemStore = tx.objectStore('production_items');

        // Hapus semua item terkait
        const itemIndex = itemStore.index('productionId');
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
            const req = prodStore.delete(id);
            req.onsuccess = resolve;
            req.onerror = reject;
        });

        return true;
    } catch (error) {
        console.error('Gagal menghapus produksi:', error);
        throw error;
    }
}

// ==================== SIMPAN ITEM PRODUKSI (KOMPONEN YANG DIGUNAKAN) ====================
async function saveProductionItem(itemData) {
    try {
        const now = new Date().toISOString();
        const tx = db.transaction(['production_items'], 'readwrite');
        const store = tx.objectStore('production_items');
        if (itemData.id) {
            // Update
            const existing = await new Promise((resolve, reject) => {
                const req = store.get(itemData.id);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            if (!existing) throw new Error('Item produksi tidak ditemukan');
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
        console.error('Gagal menyimpan item produksi:', error);
        throw error;
    }
}

// ==================== HAPUS ITEM PRODUKSI ====================
async function deleteProductionItem(itemId) {
    try {
        const tx = db.transaction(['production_items'], 'readwrite');
        const store = tx.objectStore('production_items');
        await new Promise((resolve, reject) => {
            const req = store.delete(itemId);
            req.onsuccess = resolve;
            req.onerror = reject;
        });
        return true;
    } catch (error) {
        console.error('Gagal menghapus item produksi:', error);
        throw error;
    }
}

// ==================== PROSES PRODUKSI (KONVERSI KOMPONEN MENJADI PRODUK JADI) ====================
async function processProduction(productionId, userId = null) {
    try {
        // Ambil data produksi
        const tx = db.transaction(['productions'], 'readonly');
        const store = tx.objectStore('productions');
        const production = await new Promise((resolve, reject) => {
            const req = store.get(productionId);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        if (!production) throw new Error('Produksi tidak ditemukan');
        if (production.status === 'completed') throw new Error('Produksi sudah selesai diproses');

        // Ambil komponen yang dibutuhkan dari BOM
        const bom = await getBOM(production.bom_id);
        if (!bom) throw new Error('BOM tidak ditemukan');

        // Ambil item produksi (mungkin sudah ada yang diinput manual, tapi kita bisa generate dari BOM)
        let components = await loadProductionItems(productionId);
        if (components.length === 0) {
            // Jika belum ada, generate dari BOM
            components = bom.components.map(comp => ({
                production_id: productionId,
                item_id: comp.item_id,
                batch_id: comp.batch_id || null,
                quantity_required: comp.quantity * production.quantity_produced,
                quantity_used: 0,
                status: 'pending'
            }));
        }

        // Mulai transaksi besar untuk update stok
        const tx2 = db.transaction(['item_stocks', 'stock_movements', 'productions', 'production_items', 'kasirItems'], 'readwrite');
        const stockStore = tx2.objectStore('item_stocks');
        const movementStore = tx2.objectStore('stock_movements');
        const prodStore = tx2.objectStore('productions');
        const prodItemStore = tx2.objectStore('production_items');
        const itemStore = tx2.objectStore('kasirItems');

        // 1. Kurangi stok komponen
        for (let comp of components) {
            // Cari stok komponen di gudang produksi (production.warehouse_id)
            const stockIndex = stockStore.index('item_warehouse');
            const range = IDBKeyRange.only([comp.item_id, production.warehouse_id]);
            const stock = await new Promise((resolve, reject) => {
                const req = stockIndex.get(range);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });

            if (!stock || stock.quantity < comp.quantity_required) {
                throw new Error(`Stok komponen ${comp.item_id} tidak mencukupi di gudang`);
            }

            // Kurangi stok
            stock.quantity -= comp.quantity_required;
            stock.updated_at = new Date().toISOString();
            await new Promise((resolve, reject) => {
                const req = stockStore.put(stock);
                req.onsuccess = resolve;
                req.onerror = reject;
            });

            // Catat stock movement (keluar)
            const movement = {
                movement_type: 'production_out',
                item_id: comp.item_id,
                warehouse_id: production.warehouse_id,
                quantity: -comp.quantity_required,
                reference_id: production.id,
                reference_type: 'production',
                batch_id: comp.batch_id || null,
                serial_id: null,
                unit_cost: comp.unit_cost || 0,
                created_at: new Date().toISOString(),
                created_by: userId,
                notes: `Produksi ${production.production_number} - komponen`
            };
            await new Promise((resolve, reject) => {
                const req = movementStore.add(movement);
                req.onsuccess = resolve;
                req.onerror = reject;
            });

            // Update item produksi
            comp.quantity_used = comp.quantity_required;
            comp.status = 'used';
            await new Promise((resolve, reject) => {
                const req = prodItemStore.put(comp);
                req.onsuccess = resolve;
                req.onerror = reject;
            });
        }

        // 2. Tambah stok produk jadi
        // Cari atau buat stok untuk produk jadi
        const productStockIndex = stockStore.index('item_warehouse');
        const productRange = IDBKeyRange.only([production.product_id, production.warehouse_id]);
        let productStock = await new Promise((resolve, reject) => {
            const req = productStockIndex.get(productRange);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });

        if (productStock) {
            productStock.quantity += production.quantity_produced;
            productStock.updated_at = new Date().toISOString();
            await new Promise((resolve, reject) => {
                const req = stockStore.put(productStock);
                req.onsuccess = resolve;
                req.onerror = reject;
            });
        } else {
            // Buat record stok baru
            const newStock = {
                item_id: production.product_id,
                warehouse_id: production.warehouse_id,
                quantity: production.quantity_produced,
                min_stock: 0,
                max_stock: 0,
                reorder_point: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            await new Promise((resolve, reject) => {
                const req = stockStore.add(newStock);
                req.onsuccess = resolve;
                req.onerror = reject;
            });
        }

        // Catat stock movement (masuk)
        const movementIn = {
            movement_type: 'production_in',
            item_id: production.product_id,
            warehouse_id: production.warehouse_id,
            quantity: production.quantity_produced,
            reference_id: production.id,
            reference_type: 'production',
            batch_id: null,
            serial_id: null,
            unit_cost: production.production_cost || 0, // Bisa dihitung dari total biaya komponen
            created_at: new Date().toISOString(),
            created_by: userId,
            notes: `Hasil produksi ${production.production_number}`
        };
        await new Promise((resolve, reject) => {
            const req = movementStore.add(movementIn);
            req.onsuccess = resolve;
            req.onerror = reject;
        });

        // 3. Update status produksi
        production.status = 'completed';
        production.completed_at = new Date().toISOString();
        await new Promise((resolve, reject) => {
            const req = prodStore.put(production);
            req.onsuccess = resolve;
            req.onerror = reject;
        });

        return { success: true, components_used: components.length };
    } catch (error) {
        console.error('Gagal proses produksi:', error);
        throw error;
    }
}

// ==================== RENDER TABEL DAFTAR PRODUKSI ====================
async function renderProductionTable(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
        const productions = await loadProductions();
        if (productions.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:20px;">Belum ada produksi. <button class="form-button-primary" onclick="showAddProductionForm()">Buat Produksi Baru</button></p>';
            return;
        }
        let html = '<table class="data-table"><thead><tr><th>No. Produksi</th><th>Produk Jadi</th><th>Jumlah</th><th>Gudang</th><th>Tanggal</th><th>Status</th><th>Aksi</th></tr></thead><tbody>';
        for (let p of productions) {
            const productName = await getItemName(p.product_id);
            const warehouseName = await getWarehouseName(p.warehouse_id);
            html += `<tr>
                <td>${p.production_number}</td>
                <td>${productName}</td>
                <td>${p.quantity_produced}</td>
                <td>${warehouseName}</td>
                <td>${new Date(p.production_date).toLocaleDateString('id-ID')}</td>
                <td>${getProductionStatusBadge(p.status)}</td>
                <td>
                    ${p.status === 'draft' ? 
                        `<button class="action-btn edit-btn" onclick="editProduction(${p.id})" title="Edit">✏️</button>
                         <button class="action-btn" onclick="processProductionPrompt(${p.id})" title="Proses">⚡</button>
                         <button class="action-btn delete-btn" onclick="deleteProductionPrompt(${p.id})" title="Hapus">🗑️</button>` : 
                        `<button class="action-btn" onclick="viewProductionDetail(${p.id})" title="Lihat Detail">👁️</button>`}
                </td>
            </tr>`;
        }
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (error) {
        console.error('Gagal render tabel produksi:', error);
        container.innerHTML = `<p class="error-message" style="color:red; text-align:center;">Gagal memuat data: ${error.message}</p>`;
    }
}

function getProductionStatusBadge(status) {
    const map = {
        'draft': '<span style="background:#ccc; padding:2px 8px; border-radius:10px;">Draft</span>',
        'completed': '<span style="background:#28a745; color:white; padding:2px 8px; border-radius:10px;">Selesai</span>',
        'cancelled': '<span style="background:#dc3545; color:white; padding:2px 8px; border-radius:10px;">Dibatalkan</span>'
    };
    return map[status] || status;
}

// ==================== FORM TAMBAH/EDIT PRODUKSI ====================
let currentProductionId = null;

async function showAddProductionForm() {
    currentProductionId = null;
    const modal = document.getElementById('production-modal');
    if (!modal) {
        alert('Modal produksi tidak ditemukan');
        return;
    }
    document.getElementById('production-number').value = await generateProductionNumber();
    document.getElementById('production-number').disabled = false;
    // Isi dropdown produk jadi (item)
    const productSelect = document.getElementById('production-product');
    productSelect.innerHTML = '<option value="">-- Pilih Produk Jadi --</option>';
    const items = await loadKasirItems(); // asumsikan ada di global
    items.forEach(it => {
        const opt = document.createElement('option');
        opt.value = it.id;
        opt.textContent = `${it.code} - ${it.name}`;
        productSelect.appendChild(opt);
    });
    // Isi dropdown gudang
    const warehouseSelect = document.getElementById('production-warehouse');
    warehouseSelect.innerHTML = '<option value="">-- Pilih Gudang --</option>';
    const warehouses = await loadWarehouses();
    warehouses.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.id;
        opt.textContent = `${w.code} - ${w.name}`;
        warehouseSelect.appendChild(opt);
    });
    // Isi dropdown BOM (opsional, bisa dipilih)
    const bomSelect = document.getElementById('production-bom');
    bomSelect.innerHTML = '<option value="">-- Pilih BOM (opsional) --</option>';
    const boms = await loadBOMs();
    boms.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = `${b.name} (${b.product_id})`;
        bomSelect.appendChild(opt);
    });

    document.getElementById('production-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('production-quantity').value = 1;
    document.getElementById('production-cost').value = 0;
    document.getElementById('production-notes').value = '';

    document.getElementById('production-modal-title').innerHTML = `
        <svg class="icon icon-primary" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="16"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
        </svg> Buat Produksi Baru
    `;
    modal.style.display = 'flex';
}

async function editProduction(id) {
    try {
        const tx = db.transaction(['productions'], 'readonly');
        const store = tx.objectStore('productions');
        const production = await new Promise((resolve, reject) => {
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        if (!production) throw new Error('Produksi tidak ditemukan');
        currentProductionId = id;
        const modal = document.getElementById('production-modal');
        document.getElementById('production-number').value = production.production_number;
        document.getElementById('production-number').disabled = true; // nomor tidak bisa diubah

        // Isi dropdown
        const items = await loadKasirItems();
        const productSelect = document.getElementById('production-product');
        productSelect.innerHTML = '';
        items.forEach(it => {
            const opt = document.createElement('option');
            opt.value = it.id;
            opt.textContent = `${it.code} - ${it.name}`;
            if (it.id == production.product_id) opt.selected = true;
            productSelect.appendChild(opt);
        });

        const warehouses = await loadWarehouses();
        const warehouseSelect = document.getElementById('production-warehouse');
        warehouseSelect.innerHTML = '';
        warehouses.forEach(w => {
            const opt = document.createElement('option');
            opt.value = w.id;
            opt.textContent = `${w.code} - ${w.name}`;
            if (w.id == production.warehouse_id) opt.selected = true;
            warehouseSelect.appendChild(opt);
        });

        const boms = await loadBOMs();
        const bomSelect = document.getElementById('production-bom');
        bomSelect.innerHTML = '<option value="">-- Pilih BOM (opsional) --</option>';
        boms.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = `${b.name} (${b.product_id})`;
            if (b.id == production.bom_id) opt.selected = true;
            bomSelect.appendChild(opt);
        });

        document.getElementById('production-date').value = production.production_date.split('T')[0];
        document.getElementById('production-quantity').value = production.quantity_produced;
        document.getElementById('production-cost').value = production.production_cost || 0;
        document.getElementById('production-notes').value = production.notes || '';

        document.getElementById('production-modal-title').innerHTML = `
            <svg class="icon icon-primary" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg> Edit Produksi
        `;
        modal.style.display = 'flex';
    } catch (error) {
        alert('Gagal memuat data: ' + error.message);
    }
}

async function saveProductionFromForm() {
    const number = document.getElementById('production-number').value.trim();
    const product_id = parseInt(document.getElementById('production-product').value);
    const warehouse_id = parseInt(document.getElementById('production-warehouse').value);
    const bom_id = document.getElementById('production-bom').value ? parseInt(document.getElementById('production-bom').value) : null;
    const production_date = document.getElementById('production-date').value;
    const quantity = parseFloat(document.getElementById('production-quantity').value) || 0;
    const cost = parseFloat(document.getElementById('production-cost').value) || 0;
    const notes = document.getElementById('production-notes').value.trim();

    if (!number || !product_id || !warehouse_id || !production_date || quantity <= 0) {
        alert('Nomor, Produk Jadi, Gudang, Tanggal, dan Jumlah harus diisi dengan benar');
        return;
    }

    try {
        if (typeof showLoading === 'function') showLoading();
        const data = {
            production_number: number,
            product_id,
            warehouse_id,
            bom_id,
            production_date: new Date(production_date).toISOString(),
            quantity_produced: quantity,
            production_cost: cost,
            notes,
            status: 'draft'
        };
        await saveProduction(data, currentProductionId);
        if (typeof hideLoading === 'function') hideLoading();
        closeProductionModal();
        await renderProductionTable('production-table-container');
        if (typeof showNotification === 'function') {
            showNotification('Produksi berhasil disimpan', 'success');
        } else {
            alert('Produksi berhasil disimpan');
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

function closeProductionModal() {
    const modal = document.getElementById('production-modal');
    if (modal) modal.style.display = 'none';
    currentProductionId = null;
}

async function deleteProductionPrompt(id) {
    if (!confirm('Hapus produksi ini? Semua data item akan ikut terhapus.')) return;
    try {
        if (typeof showLoading === 'function') showLoading();
        await deleteProduction(id);
        if (typeof hideLoading === 'function') hideLoading();
        await renderProductionTable('production-table-container');
        if (typeof showNotification === 'function') {
            showNotification('Produksi dihapus', 'success');
        } else {
            alert('Produksi dihapus');
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

// ==================== PROSES PRODUKSI PROMPT ====================
async function processProductionPrompt(id) {
    if (!confirm('Proses produksi sekarang? Stok komponen akan dikurangi dan stok produk jadi akan ditambah.')) return;
    try {
        if (typeof showLoading === 'function') showLoading();
        const result = await processProduction(id, currentUser?.id);
        if (typeof hideLoading === 'function') hideLoading();
        await renderProductionTable('production-table-container');
        if (typeof showNotification === 'function') {
            showNotification(`Produksi selesai. ${result.components_used} komponen digunakan.`, 'success');
        } else {
            alert('Produksi selesai');
        }
    } catch (error) {
        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showNotification === 'function') {
            showNotification('Gagal proses produksi: ' + error.message, 'error');
        } else {
            alert('Gagal: ' + error.message);
        }
    }
}

// ==================== DETAIL PRODUKSI ====================
async function viewProductionDetail(id) {
    // Bisa buka modal atau halaman terpisah
    alert('Fitur lihat detail produksi sedang dalam pengembangan');
}

// Ekspor fungsi ke global
window.loadBOMs = loadBOMs;
window.getBOM = getBOM;
window.saveBOM = saveBOM;
window.deleteBOM = deleteBOM;
window.loadProductions = loadProductions;
window.loadProductionItems = loadProductionItems;
window.generateProductionNumber = generateProductionNumber;
window.saveProduction = saveProduction;
window.deleteProduction = deleteProduction;
window.saveProductionItem = saveProductionItem;
window.deleteProductionItem = deleteProductionItem;
window.processProduction = processProduction;
window.renderProductionTable = renderProductionTable;
window.showAddProductionForm = showAddProductionForm;
window.editProduction = editProduction;
window.saveProductionFromForm = saveProductionFromForm;
window.closeProductionModal = closeProductionModal;
window.deleteProductionPrompt = deleteProductionPrompt;
window.processProductionPrompt = processProductionPrompt;
window.viewProductionDetail = viewProductionDetail;
