// ==================== inventory-core.js ====================
// Fungsi-fungsi inti untuk manajemen inventori skala industri
// Membutuhkan database yang sudah diinisialisasi (db) dan store-store baru

// ==================== GLOBAL VARIABLES ====================
let warehouses = [];
let itemStocks = [];        // array of { id, itemId, warehouseId, quantity, minStock, maxStock, reorderPoint, updatedAt }
let itemBatches = [];        // array of { id, itemId, warehouseId, batchNumber, expiryDate, quantity, purchasePrice, receivedDate, notes }
let itemSerials = [];        // array of { id, itemId, warehouseId, serialNumber, batchId, status, purchasePrice, soldPrice, saleId, notes }
let stockMovements = [];     // array of { id, movementType, itemId, warehouseId, quantity, referenceId, referenceType, batchId, serialId, unitCost, createdAt, createdBy, notes }

// ==================== LOAD DATA FUNCTIONS ====================
async function loadWarehouses() {
    try {
        warehouses = await dbGetAll('warehouses');
        warehouses.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error('Error loading warehouses:', error);
        warehouses = [];
    }
}

async function loadItemStocks() {
    try {
        itemStocks = await dbGetAll('item_stocks');
    } catch (error) {
        console.error('Error loading item stocks:', error);
        itemStocks = [];
    }
}

async function loadItemBatches() {
    try {
        itemBatches = await dbGetAll('item_batches');
    } catch (error) {
        console.error('Error loading item batches:', error);
        itemBatches = [];
    }
}

async function loadItemSerials() {
    try {
        itemSerials = await dbGetAll('item_serials');
    } catch (error) {
        console.error('Error loading item serials:', error);
        itemSerials = [];
    }
}

async function loadStockMovements() {
    try {
        stockMovements = await dbGetAll('stock_movements');
    } catch (error) {
        console.error('Error loading stock movements:', error);
        stockMovements = [];
    }
}

// ==================== GET STOCK FUNCTIONS ====================
function getItemStock(itemId, warehouseId) {
    const stock = itemStocks.find(s => s.itemId === itemId && s.warehouseId === warehouseId);
    return stock ? stock.quantity : 0;
}

function getItemStocksByItem(itemId) {
    return itemStocks.filter(s => s.itemId === itemId);
}

function getAvailableBatches(itemId, warehouseId) {
    return itemBatches.filter(b => b.itemId === itemId && b.warehouseId === warehouseId && b.quantity > 0)
        .sort((a, b) => new Date(a.expiryDate || '9999-12-31') - new Date(b.expiryDate || '9999-12-31')); // FIFO by expiry
}

function getAvailableSerials(itemId, warehouseId, status = 'available') {
    return itemSerials.filter(s => s.itemId === itemId && s.warehouseId === warehouseId && s.status === status);
}

// ==================== UPDATE STOCK FUNCTIONS ====================
/**
 * Menambah stok item di gudang tertentu, dengan batch dan serial opsional.
 * Digunakan untuk pembelian, transfer masuk, produksi, adjustment positif.
 */
async function addStock({
    itemId,
    warehouseId,
    quantity,
    batchNumber = null,
    expiryDate = null,
    serialNumbers = [], // array of serial numbers (untuk item serial)
    purchasePrice = null,
    referenceId = null,
    referenceType = null,
    notes = '',
    createdBy = null
}) {
    if (!itemId || !warehouseId || quantity <= 0) {
        throw new Error('Parameter tidak valid untuk addStock');
    }

    const item = kasirItems.find(i => i.id === itemId);
    if (!item) throw new Error('Item tidak ditemukan');

    const now = new Date().toISOString();
    const transaction = db.transaction(['item_stocks', 'item_batches', 'item_serials', 'stock_movements'], 'readwrite');
    const stockStore = transaction.objectStore('item_stocks');
    const batchStore = transaction.objectStore('item_batches');
    const serialStore = transaction.objectStore('item_serials');
    const movementStore = transaction.objectStore('stock_movements');

    try {
        // 1. Update atau buat item_stocks
        let stockRecord = itemStocks.find(s => s.itemId === itemId && s.warehouseId === warehouseId);
        if (stockRecord) {
            stockRecord.quantity += quantity;
            stockRecord.updatedAt = now;
            await new Promise((resolve, reject) => {
                const req = stockStore.put(stockRecord);
                req.onsuccess = resolve;
                req.onerror = reject;
            });
        } else {
            stockRecord = {
                itemId,
                warehouseId,
                quantity,
                minStock: item.minStock || 5,
                maxStock: null,
                reorderPoint: item.minStock || 5,
                updatedAt: now
            };
            const id = await new Promise((resolve, reject) => {
                const req = stockStore.add(stockRecord);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            stockRecord.id = id;
            itemStocks.push(stockRecord);
        }

        // 2. Jika item dilacak batch, buat batch baru
        let batchId = null;
        if (item.trackBatch && batchNumber) {
            const batchRecord = {
                itemId,
                warehouseId,
                batchNumber,
                expiryDate: expiryDate || null,
                quantity,
                purchasePrice: purchasePrice || 0,
                receivedDate: now,
                notes
            };
            const id = await new Promise((resolve, reject) => {
                const req = batchStore.add(batchRecord);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
            batchRecord.id = id;
            itemBatches.push(batchRecord);
            batchId = id;
        }

        // 3. Jika item dilacak serial, buat serial individual
        if (item.trackSerial && serialNumbers.length > 0) {
            for (let sn of serialNumbers) {
                const serialRecord = {
                    itemId,
                    warehouseId,
                    serialNumber: sn,
                    batchId,
                    status: 'available',
                    purchasePrice: purchasePrice || 0,
                    soldPrice: null,
                    saleId: null,
                    notes
                };
                const id = await new Promise((resolve, reject) => {
                    const req = serialStore.add(serialRecord);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = reject;
                });
                serialRecord.id = id;
                itemSerials.push(serialRecord);
            }
        }

        // 4. Catat stock movement
        const movement = {
            movementType: 'in',
            itemId,
            warehouseId,
            quantity,
            referenceId,
            referenceType,
            batchId,
            serialId: null, // untuk movement agregat, serialId bisa null
            unitCost: purchasePrice || 0,
            createdAt: now,
            createdBy: createdBy || (currentUser ? currentUser.id : null),
            notes
        };
        await new Promise((resolve, reject) => {
            const req = movementStore.add(movement);
            req.onsuccess = resolve;
            req.onerror = reject;
        });
        stockMovements.push(movement);

        return { stockRecord, batchId };
    } catch (error) {
        console.error('Error in addStock:', error);
        throw error;
    }
}

/**
 * Mengurangi stok item dari gudang tertentu, dengan metode FIFO untuk batch.
 * Digunakan untuk penjualan, transfer keluar, adjustment negatif.
 * Mengembalikan array of { batchId, quantity, unitCost } yang digunakan.
 */
async function removeStock({
    itemId,
    warehouseId,
    quantity,
    referenceId = null,
    referenceType = null,
    notes = '',
    createdBy = null,
    useFifo = true, // jika true, ambil dari batch tertua
    selectedBatchId = null, // jika ingin pilih batch tertentu (misal untuk penjualan batch spesifik)
    selectedSerialIds = [] // jika item serial, pilih serial tertentu
}) {
    if (!itemId || !warehouseId || quantity <= 0) {
        throw new Error('Parameter tidak valid untuk removeStock');
    }

    const item = kasirItems.find(i => i.id === itemId);
    if (!item) throw new Error('Item tidak ditemukan');

    const now = new Date().toISOString();
    const transaction = db.transaction(['item_stocks', 'item_batches', 'item_serials', 'stock_movements'], 'readwrite');
    const stockStore = transaction.objectStore('item_stocks');
    const batchStore = transaction.objectStore('item_batches');
    const serialStore = transaction.objectStore('item_serials');
    const movementStore = transaction.objectStore('stock_movements');

    try {
        // Cek stok keseluruhan
        let stockRecord = itemStocks.find(s => s.itemId === itemId && s.warehouseId === warehouseId);
        if (!stockRecord || stockRecord.quantity < quantity) {
            throw new Error('Stok tidak cukup');
        }

        let remainingQty = quantity;
        const usedBatches = []; // untuk mencatat batch yang digunakan

        if (item.trackSerial) {
            // Untuk item serial, kita harus mengurangi serial yang dipilih
            if (selectedSerialIds.length !== quantity) {
                throw new Error('Jumlah serial harus sama dengan quantity');
            }
            for (let serialId of selectedSerialIds) {
                const serial = itemSerials.find(s => s.id === serialId);
                if (!serial || serial.status !== 'available') {
                    throw new Error(`Serial ${serialId} tidak tersedia`);
                }
                serial.status = 'sold';
                serial.soldPrice = null; // akan diisi nanti dari transaksi
                serial.saleId = referenceId;
                await new Promise((resolve, reject) => {
                    const req = serialStore.put(serial);
                    req.onsuccess = resolve;
                    req.onerror = reject;
                });

                // Catat movement per serial
                const movement = {
                    movementType: 'out',
                    itemId,
                    warehouseId,
                    quantity: 1,
                    referenceId,
                    referenceType,
                    batchId: serial.batchId,
                    serialId,
                    unitCost: serial.purchasePrice,
                    createdAt: now,
                    createdBy: createdBy || (currentUser ? currentUser.id : null),
                    notes
                };
                await new Promise((resolve, reject) => {
                    const req = movementStore.add(movement);
                    req.onsuccess = resolve;
                    req.onerror = reject;
                });
                stockMovements.push(movement);

                // Catat batch yang digunakan (untuk keperluan HPP)
                const batch = itemBatches.find(b => b.id === serial.batchId);
                if (batch) {
                    batch.quantity -= 1;
                    await new Promise((resolve, reject) => {
                        const req = batchStore.put(batch);
                        req.onsuccess = resolve;
                        req.onerror = reject;
                    });
                    usedBatches.push({ batchId: batch.id, quantity: 1, unitCost: batch.purchasePrice });
                }
            }
        } else if (item.trackBatch) {
            // Untuk item batch, ambil dari batch sesuai metode
            let batches = itemBatches.filter(b => b.itemId === itemId && b.warehouseId === warehouseId && b.quantity > 0);
            if (useFifo) {
                batches.sort((a, b) => new Date(a.expiryDate || '9999-12-31') - new Date(b.expiryDate || '9999-12-31'));
            }
            if (selectedBatchId) {
                batches = batches.filter(b => b.id === selectedBatchId);
                if (batches.length === 0) throw new Error('Batch tidak ditemukan');
            }

            for (let batch of batches) {
                if (remainingQty <= 0) break;
                const take = Math.min(batch.quantity, remainingQty);
                batch.quantity -= take;
                remainingQty -= take;
                await new Promise((resolve, reject) => {
                    const req = batchStore.put(batch);
                    req.onsuccess = resolve;
                    req.onerror = reject;
                });
                usedBatches.push({ batchId: batch.id, quantity: take, unitCost: batch.purchasePrice });

                // Catat movement per batch (bisa diagregat)
                const movement = {
                    movementType: 'out',
                    itemId,
                    warehouseId,
                    quantity: take,
                    referenceId,
                    referenceType,
                    batchId: batch.id,
                    serialId: null,
                    unitCost: batch.purchasePrice,
                    createdAt: now,
                    createdBy: createdBy || (currentUser ? currentUser.id : null),
                    notes
                };
                await new Promise((resolve, reject) => {
                    const req = movementStore.add(movement);
                    req.onsuccess = resolve;
                    req.onerror = reject;
                });
                stockMovements.push(movement);
            }
            if (remainingQty > 0) {
                throw new Error('Stok batch tidak cukup (konsistensi error)');
            }
        } else {
            // Item tanpa batch/serial, kurangi stok biasa
            stockRecord.quantity -= quantity;
            await new Promise((resolve, reject) => {
                const req = stockStore.put(stockRecord);
                req.onsuccess = resolve;
                req.onerror = reject;
            });

            // Catat movement agregat
            const movement = {
                movementType: 'out',
                itemId,
                warehouseId,
                quantity,
                referenceId,
                referenceType,
                batchId: null,
                serialId: null,
                unitCost: item.hargaDasar || 0,
                createdAt: now,
                createdBy: createdBy || (currentUser ? currentUser.id : null),
                notes
            };
            await new Promise((resolve, reject) => {
                const req = movementStore.add(movement);
                req.onsuccess = resolve;
                req.onerror = reject;
            });
            stockMovements.push(movement);
        }

        // Update stockRecord quantity setelah semua pengurangan
        if (!item.trackBatch && !item.trackSerial) {
            // sudah diupdate di atas
        } else {
            // Hitung ulang stok dari batch/serial (untuk memastikan konsisten)
            const totalBatchQty = itemBatches
                .filter(b => b.itemId === itemId && b.warehouseId === warehouseId)
                .reduce((sum, b) => sum + b.quantity, 0);
            const totalSerialQty = itemSerials
                .filter(s => s.itemId === itemId && s.warehouseId === warehouseId && s.status === 'available')
                .length;
            // Jika item punya batch dan serial, stok diambil dari serial (karena serial lebih detail)
            let newStockQty = item.trackSerial ? totalSerialQty : totalBatchQty;
            if (stockRecord) {
                stockRecord.quantity = newStockQty;
                await new Promise((resolve, reject) => {
                    const req = stockStore.put(stockRecord);
                    req.onsuccess = resolve;
                    req.onerror = reject;
                });
            }
        }

        return usedBatches;
    } catch (error) {
        console.error('Error in removeStock:', error);
        throw error;
    }
}

// ==================== HPP CALCULATION (FIFO) ====================
/**
 * Menghitung Harga Pokok Penjualan untuk sejumlah unit item dari gudang tertentu,
 * menggunakan metode FIFO berdasarkan batch.
 * Mengembalikan total HPP.
 */
function calculateHPPFIFO(itemId, warehouseId, quantity) {
    let batches = itemBatches
        .filter(b => b.itemId === itemId && b.warehouseId === warehouseId && b.quantity > 0)
        .sort((a, b) => new Date(a.expiryDate || '9999-12-31') - new Date(b.expiryDate || '9999-12-31'));

    let remaining = quantity;
    let totalCost = 0;
    for (let batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(batch.quantity, remaining);
        totalCost += take * batch.purchasePrice;
        remaining -= take;
    }
    if (remaining > 0) {
        console.warn('Stok tidak cukup untuk menghitung HPP, gunakan harga dasar');
        totalCost += remaining * (kasirItems.find(i => i.id === itemId)?.hargaDasar || 0);
    }
    return totalCost;
}

// ==================== TRANSFER STOK ====================
async function createTransfer(transferData) {
    // transferData: { fromWarehouseId, toWarehouseId, items: [{ itemId, quantity, batchId? }], requestedBy, notes }
    const now = new Date().toISOString();
    const transferNumber = await generateTransferNumber();
    const transfer = {
        transferNumber,
        fromWarehouseId: transferData.fromWarehouseId,
        toWarehouseId: transferData.toWarehouseId,
        status: 'draft',
        requestedBy: transferData.requestedBy,
        requestedAt: now,
        notes: transferData.notes
    };
    const id = await dbAdd('transfers', transfer);
    transfer.id = id;

    // Simpan item transfer
    const transferItems = transferData.items.map(item => ({
        transferId: id,
        itemId: item.itemId,
        batchId: item.batchId || null,
        quantity: item.quantity,
        unitCost: 0 // nanti diisi saat diterima
    }));
    for (let ti of transferItems) {
        await dbAdd('transfer_items', ti);
    }
    return transfer;
}

async function receiveTransfer(transferId, receivedBy) {
    const transfer = await dbGet('transfers', transferId);
    if (!transfer || transfer.status !== 'sent') throw new Error('Transfer tidak valid');
    const items = await dbGetAll('transfer_items');
    const transferItems = items.filter(ti => ti.transferId === transferId);

    const now = new Date().toISOString();
    for (let ti of transferItems) {
        // Kurangi stok dari gudang asal (seharusnya sudah dikurang saat dikirim, tapi kita pastikan)
        // Di sini kita asumsikan saat kirim sudah mengurangi, saat terima kita tambah ke gudang tujuan
        await addStock({
            itemId: ti.itemId,
            warehouseId: transfer.toWarehouseId,
            quantity: ti.quantity,
            batchNumber: null, // jika perlu, bisa dicari dari batch asal
            referenceId: transferId,
            referenceType: 'transfer',
            notes: `Transfer from ${transfer.fromWarehouseId}`,
            createdBy: receivedBy
        });
    }

    transfer.status = 'received';
    transfer.receivedBy = receivedBy;
    transfer.receivedAt = now;
    await dbPut('transfers', transfer);
    return transfer;
}

async function generateTransferNumber() {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    // sederhana, bisa dikembangkan dengan counter
    return `TRF-${dateStr}-${Math.floor(Math.random()*1000)}`;
}

// ==================== STOCK OPNAME ====================
async function createStocktake(stocktakeData) {
    // stocktakeData: { warehouseId, items: [{ itemId, systemQty, physicalQty, notes }], createdBy }
    const now = new Date().toISOString();
    const number = `ST-${now.slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*1000)}`;
    const stocktake = {
        stocktakeNumber: number,
        warehouseId: stocktakeData.warehouseId,
        startDate: now,
        status: 'in_progress',
        createdBy: stocktakeData.createdBy,
        notes: ''
    };
    const id = await dbAdd('stocktakes', stocktake);
    stocktake.id = id;

    for (let item of stocktakeData.items) {
        const diff = item.physicalQty - item.systemQty;
        const stocktakeItem = {
            stocktakeId: id,
            itemId: item.itemId,
            batchId: item.batchId || null,
            systemQty: item.systemQty,
            physicalQty: item.physicalQty,
            difference: diff,
            unitCost: 0, // bisa diisi
            notes: item.notes || ''
        };
        await dbAdd('stocktake_items', stocktakeItem);
    }
    return stocktake;
}

async function completeStocktake(stocktakeId, userId) {
    const stocktake = await dbGet('stocktakes', stocktakeId);
    if (!stocktake) throw new Error('Stocktake tidak ditemukan');
    const items = await dbGetAll('stocktake_items');
    const stocktakeItems = items.filter(si => si.stocktakeId === stocktakeId);

    const now = new Date().toISOString();
    for (let si of stocktakeItems) {
        if (si.difference !== 0) {
            // Lakukan adjustment
            if (si.difference > 0) {
                await addStock({
                    itemId: si.itemId,
                    warehouseId: stocktake.warehouseId,
                    quantity: si.difference,
                    batchNumber: null,
                    referenceId: stocktakeId,
                    referenceType: 'stocktake',
                    notes: `Adjustment from stocktake, diff ${si.difference}`,
                    createdBy: userId
                });
            } else {
                await removeStock({
                    itemId: si.itemId,
                    warehouseId: stocktake.warehouseId,
                    quantity: -si.difference,
                    referenceId: stocktakeId,
                    referenceType: 'stocktake',
                    notes: `Adjustment from stocktake, diff ${si.difference}`,
                    createdBy: userId
                });
            }
        }
    }

    stocktake.status = 'completed';
    stocktake.endDate = now;
    await dbPut('stocktakes', stocktake);
    return stocktake;
}

// ==================== INTEGRASI DENGAN TRANSAKSI (PENJUALAN) ====================
/**
 * Fungsi ini dipanggil saat proses pembayaran untuk mengurangi stok berdasarkan item di cart.
 * Mengembalikan total HPP.
 */
async function processStockForSale(saleItems, warehouseId, saleId, userId) {
    let totalHPP = 0;
    for (let item of saleItems) {
        if (item.isBundle) {
            // Untuk bundle, kurangi stok komponen
            for (let comp of item.components) {
                const compItem = kasirItems.find(i => i.id === comp.itemId);
                if (!compItem) continue;
                let qtyNeeded = comp.qty * item.qty;
                if (comp.unitConversionId) {
                    const conv = compItem.unitConversions?.find(u => u.id == comp.unitConversionId);
                    if (conv) qtyNeeded *= conv.value;
                }
                const used = await removeStock({
                    itemId: comp.itemId,
                    warehouseId,
                    quantity: qtyNeeded,
                    referenceId: saleId,
                    referenceType: 'sale',
                    notes: `Penjualan bundle ${item.item.name}`,
                    createdBy: userId
                });
                // Hitung HPP dari batch yang digunakan
                for (let u of used) {
                    totalHPP += u.quantity * u.unitCost;
                }
            }
        } else {
            // Item biasa
            let qty = item.qty;
            if (item.unitConversion) {
                qty *= item.unitConversion.value;
            }
            const used = await removeStock({
                itemId: item.item.id,
                warehouseId,
                quantity: qty,
                referenceId: saleId,
                referenceType: 'sale',
                notes: '',
                createdBy: userId,
                selectedBatchId: item.batchId,
                selectedSerialIds: item.serialIds || []
            });
            for (let u of used) {
                totalHPP += u.quantity * u.unitCost;
            }
        }
    }
    return totalHPP;
}

// ==================== EXPOSE KE GLOBAL ====================
window.warehouses = warehouses;
window.itemStocks = itemStocks;
window.itemBatches = itemBatches;
window.itemSerials = itemSerials;
window.stockMovements = stockMovements;

window.loadWarehouses = loadWarehouses;
window.loadItemStocks = loadItemStocks;
window.loadItemBatches = loadItemBatches;
window.loadItemSerials = loadItemSerials;
window.loadStockMovements = loadStockMovements;

window.getItemStock = getItemStock;
window.getAvailableBatches = getAvailableBatches;
window.getAvailableSerials = getAvailableSerials;
window.addStock = addStock;
window.removeStock = removeStock;
window.calculateHPPFIFO = calculateHPPFIFO;
window.createTransfer = createTransfer;
window.receiveTransfer = receiveTransfer;
window.createStocktake = createStocktake;
window.completeStocktake = completeStocktake;
window.processStockForSale = processStockForSale;
