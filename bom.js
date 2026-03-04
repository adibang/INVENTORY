// bom.js
// Manajemen Bill of Materials (BOM) untuk produk rakitan

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
                resolve(boms);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    } catch (error) {
        console.error('Error loadBOMs:', error);
        return [];
    }
}

// ==================== AMBIL BOM BERDASARKAN PRODUCT ID ====================
async function getBOMByProductId(productId) {
    try {
        const transaction = db.transaction(['bill_of_materials'], 'readonly');
        const store = transaction.objectStore('bill_of_materials');
        const index = store.index('product_id');
        const range = IDBKeyRange.only(productId);
        const request = index.get(range);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    } catch (error) {
        console.error('Error getBOMByProductId:', error);
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
            // Cek duplikasi product_id
            const existing = await getBOMByProductId(bomData.product_id);
            if (existing) {
                throw new Error('Produk ini sudah memiliki BOM');
            }
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

// ==================== VALIDASI KOMPONEN BOM ====================
function validateBOMComponents(components) {
    if (!components || !Array.isArray(components) || components.length === 0) {
        return 'Minimal satu komponen harus diisi';
    }
    for (let i = 0; i < components.length; i++) {
        const comp = components[i];
        if (!comp.item_id) {
            return `Komponen ke-${i+1} : Item harus dipilih`;
        }
        if (!comp.quantity || comp.quantity <= 0) {
            return `Komponen ke-${i+1} : Jumlah harus > 0`;
        }
    }
    return null;
}

// ==================== RENDER TABEL DAFTAR BOM ====================
async function renderBOMTable(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
        const boms = await loadBOMs();
        const items = await loadKasirItems(); // asumsikan global
        if (boms.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:20px;">Belum ada BOM. <button class="form-button-primary" onclick="showAddBOMForm()">Tambah BOM</button></p>';
            return;
        }
        let html = '<table class="data-table"><thead><tr><th>Produk Jadi</th><th>Jumlah Komponen</th><th>Total Biaya</th><th>Aksi</th></tr></thead><tbody>';
        for (let bom of boms) {
            const product = items.find(i => i.id === bom.product_id);
            const productName = product ? product.name : 'Unknown';
            const componentCount = bom.components ? bom.components.length : 0;
            let totalCost = 0;
            if (bom.components) {
                for (let comp of bom.components) {
                    const compItem = items.find(i => i.id === comp.item_id);
                    if (compItem) {
                        let qty = comp.quantity;
                        if (comp.unit_conversion_id && compItem.unitConversions) {
                            const conv = compItem.unitConversions.find(u => u.id == comp.unit_conversion_id);
                            if (conv) qty *= conv.value;
                        }
                        totalCost += (compItem.hargaDasar || 0) * qty;
                    }
                }
            }
            html += `<tr>
                <td>${productName}</td>
                <td>${componentCount}</td>
                <td>${formatRupiah(totalCost)}</td>
                <td>
                    <button class="action-btn edit-btn" onclick="editBOM(${bom.id})" title="Edit">✏️</button>
                    <button class="action-btn delete-btn" onclick="deleteBOMPrompt(${bom.id})" title="Hapus">🗑️</button>
                    <button class="action-btn" onclick="viewBOM(${bom.id})" title="Lihat">👁️</button>
                </td>
            </tr>`;
        }
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (error) {
        console.error('Gagal render tabel BOM:', error);
        container.innerHTML = `<p class="error-message" style="color:red; text-align:center;">Gagal memuat data: ${error.message}</p>`;
    }
}

// ==================== FORM TAMBAH/EDIT BOM ====================
let currentBOMId = null;

async function showAddBOMForm() {
    currentBOMId = null;
    const modal = document.getElementById('bom-modal');
    if (!modal) {
        alert('Modal BOM tidak ditemukan');
        return;
    }
    const productSelect = document.getElementById('bom-product');
    productSelect.innerHTML = '<option value="">-- Pilih Produk Jadi --</option>';
    const items = await loadKasirItems();
    const boms = await loadBOMs();
    const existingProductIds = boms.map(b => b.product_id);
    const availableProducts = items.filter(i => !existingProductIds.includes(i.id));
    availableProducts.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.code} - ${p.name}`;
        productSelect.appendChild(opt);
    });

    document.getElementById('bom-components-container').innerHTML = '';
    addBOMComponentRow();

    document.getElementById('bom-modal-title').innerHTML = `
        <svg class="icon icon-primary" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
        </svg> Tambah BOM
    `;
    modal.style.display = 'flex';
}

async function editBOM(id) {
    try {
        const tx = db.transaction(['bill_of_materials'], 'readonly');
        const store = tx.objectStore('bill_of_materials');
        const bom = await new Promise((resolve, reject) => {
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        if (!bom) throw new Error('BOM tidak ditemukan');
        currentBOMId = id;
        const modal = document.getElementById('bom-modal');
        
        const productSelect = document.getElementById('bom-product');
        productSelect.innerHTML = '<option value="">-- Pilih Produk Jadi --</option>';
        const items = await loadKasirItems();
        items.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.code} - ${p.name}`;
            if (p.id === bom.product_id) opt.selected = true;
            productSelect.appendChild(opt);
        });
        productSelect.disabled = true;

        const container = document.getElementById('bom-components-container');
        container.innerHTML = '';
        if (bom.components && bom.components.length > 0) {
            for (let i = 0; i < bom.components.length; i++) {
                const comp = bom.components[i];
                await addBOMComponentRow(comp.item_id, comp.quantity, comp.unit_conversion_id, i);
            }
        } else {
            addBOMComponentRow();
        }

        document.getElementById('bom-modal-title').innerHTML = `
            <svg class="icon icon-primary" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg> Edit BOM
        `;
        modal.style.display = 'flex';
    } catch (error) {
        alert('Gagal memuat data: ' + error.message);
    }
}

async function addBOMComponentRow(itemId = '', qty = 1, unitConvId = '', index = null) {
    const container = document.getElementById('bom-components-container');
    if (!container) return;
    const rowIndex = index !== null ? index : container.children.length;
    const items = await loadKasirItems();
    let itemOptions = '<option value="">-- Pilih Item --</option>';
    items.forEach(it => {
        itemOptions += `<option value="${it.id}" ${it.id == itemId ? 'selected' : ''}>${it.code} - ${it.name}</option>`;
    });

    const row = document.createElement('div');
    row.className = 'bom-component-row';
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.marginBottom = '10px';
    row.style.alignItems = 'center';
    row.innerHTML = `
        <select class="form-input component-item" style="flex:2;" onchange="updateUnitOptions(this, ${rowIndex})">
            ${itemOptions}
        </select>
        <input type="number" class="form-input component-qty" style="flex:1;" value="${qty}" min="0.01" step="0.01">
        <select class="form-input component-unit" style="flex:1;" data-index="${rowIndex}">
            <option value="">Tanpa Satuan</option>
        </select>
        <button type="button" class="level-harga-remove" onclick="this.closest('.bom-component-row').remove()">×</button>
    `;
    container.appendChild(row);
    if (itemId) {
        const item = items.find(i => i.id == itemId);
        if (item && item.unitConversions) {
            const unitSelect = row.querySelector('.component-unit');
            unitSelect.innerHTML = '<option value="">Tanpa Satuan</option>';
            const satuan = await loadKasirSatuan();
            item.unitConversions.forEach(conv => {
                const unitName = satuan.find(s => s.id == conv.unit)?.name || '?';
                unitSelect.innerHTML += `<option value="${conv.id}" ${conv.id == unitConvId ? 'selected' : ''}>${unitName} (${conv.value})</option>`;
            });
        }
    }
}

async function updateUnitOptions(select, index) {
    const itemId = select.value;
    const row = select.closest('.bom-component-row');
    const unitSelect = row.querySelector('.component-unit');
    unitSelect.innerHTML = '<option value="">Tanpa Satuan</option>';
    if (!itemId) return;
    const items = await loadKasirItems();
    const item = items.find(i => i.id == itemId);
    if (item && item.unitConversions) {
        const satuan = await loadKasirSatuan();
        item.unitConversions.forEach(conv => {
            const unitName = satuan.find(s => s.id == conv.unit)?.name || '?';
            unitSelect.innerHTML += `<option value="${conv.id}">${unitName} (${conv.value})</option>`;
        });
    }
}

function collectBOMComponents() {
    const rows = document.querySelectorAll('.bom-component-row');
    const components = [];
    rows.forEach(row => {
        const itemId = row.querySelector('.component-item').value;
        const qty = parseFloat(row.querySelector('.component-qty').value);
        const unitConvId = row.querySelector('.component-unit').value;
        if (itemId && qty > 0) {
            components.push({
                item_id: parseInt(itemId),
                quantity: qty,
                unit_conversion_id: unitConvId ? parseInt(unitConvId) : null
            });
        }
    });
    return components;
}

async function saveBOMFromForm() {
    const productId = parseInt(document.getElementById('bom-product').value);
    if (!productId) {
        alert('Pilih produk jadi');
        return;
    }
    const components = collectBOMComponents();
    const error = validateBOMComponents(components);
    if (error) {
        alert(error);
        return;
    }

    try {
        if (typeof showLoading === 'function') showLoading();
        const bomData = {
            product_id: productId,
            components: components
        };
        await saveBOM(bomData, currentBOMId);
        if (typeof hideLoading === 'function') hideLoading();
        closeBOMModal();
        await renderBOMTable('bom-table-container');
        if (typeof showNotification === 'function') {
            showNotification('BOM berhasil disimpan', 'success');
        } else {
            alert('BOM berhasil disimpan');
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

function closeBOMModal() {
    const modal = document.getElementById('bom-modal');
    if (modal) modal.style.display = 'none';
    currentBOMId = null;
    const productSelect = document.getElementById('bom-product');
    if (productSelect) productSelect.disabled = false;
}

async function deleteBOMPrompt(id) {
    if (!confirm('Hapus BOM ini?')) return;
    try {
        if (typeof showLoading === 'function') showLoading();
        await deleteBOM(id);
        if (typeof hideLoading === 'function') hideLoading();
        await renderBOMTable('bom-table-container');
        if (typeof showNotification === 'function') {
            showNotification('BOM dihapus', 'success');
        } else {
            alert('BOM dihapus');
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

async function viewBOM(id) {
    try {
        const tx = db.transaction(['bill_of_materials'], 'readonly');
        const store = tx.objectStore('bill_of_materials');
        const bom = await new Promise((resolve, reject) => {
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        if (!bom) throw new Error('BOM tidak ditemukan');
        const items = await loadKasirItems();
        const product = items.find(i => i.id === bom.product_id);
        let detailHtml = `<h3>${product ? product.name : 'Produk'}</h3>`;
        detailHtml += '<table class="data-table"><thead><tr><th>Komponen</th><th>Jumlah</th><th>Satuan</th></tr></thead><tbody>';
        for (let comp of bom.components) {
            const compItem = items.find(i => i.id === comp.item_id);
            const compName = compItem ? compItem.name : 'Unknown';
            let unitText = '';
            if (comp.unit_conversion_id && compItem && compItem.unitConversions) {
                const conv = compItem.unitConversions.find(u => u.id == comp.unit_conversion_id);
                if (conv) {
                    const satuan = await loadKasirSatuan();
                    const unitName = satuan.find(s => s.id == conv.unit)?.name || '?';
                    unitText = `${unitName} (${conv.value} ${compItem.satuanDasar || 'pcs'})`;
                }
            }
            detailHtml += `<tr><td>${compName}</td><td>${comp.quantity}</td><td>${unitText || '-'}</td></tr>`;
        }
        detailHtml += '</tbody></table>';
        
        const modal = document.getElementById('bom-view-modal');
        if (modal) {
            document.getElementById('bom-view-content').innerHTML = detailHtml;
            modal.style.display = 'flex';
        } else {
            alert('Lihat BOM:\n' + detailHtml.replace(/<[^>]*>/g, ''));
        }
    } catch (error) {
        alert('Gagal melihat BOM: ' + error.message);
    }
}

function closeBOMViewModal() {
    const modal = document.getElementById('bom-view-modal');
    if (modal) modal.style.display = 'none';
}

// Ekspor fungsi ke global
window.loadBOMs = loadBOMs;
window.getBOMByProductId = getBOMByProductId;
window.saveBOM = saveBOM;
window.deleteBOM = deleteBOM;
window.renderBOMTable = renderBOMTable;
window.showAddBOMForm = showAddBOMForm;
window.editBOM = editBOM;
window.addBOMComponentRow = addBOMComponentRow;
window.updateUnitOptions = updateUnitOptions;
window.saveBOMFromForm = saveBOMFromForm;
window.closeBOMModal = closeBOMModal;
window.deleteBOMPrompt = deleteBOMPrompt;
window.viewBOM = viewBOM;
window.closeBOMViewModal = closeBOMViewModal;
