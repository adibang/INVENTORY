// ==================== inventory-core.js (FIXED) ====================
// Fungsi-fungsi inti untuk manajemen inventori skala industri
// Membutuhkan database yang sudah diinisialisasi (db) dan store-store baru

// ==================== KONSTANTA & CONFIG ====================
const STORES = {
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
    PRODUCTION_ITEMS: 'production_items',
    KASIR_ITEMS: 'kasirItems',
    SETTINGS: 'settings'
};

const MOVEMENT_TYPES = {
    IN: 'in',
    OUT: 'out',
    ADJUSTMENT: 'adjustment',
    TRANSFER_IN: 'transfer_in',
    TRANSFER_OUT: 'transfer_out',
    SALE: 'sale',
    PURCHASE: 'purchase',
    STOCKTAKE: 'stocktake',
    PRODUCTION_IN: 'production_in',
    PRODUCTION_OUT: 'production_out',
    CONSIGNMENT_IN: 'consignment_in',
    CONSIGNMENT_OUT: 'consignment_out'
};

const SERIAL_STATUS = {
    AVAILABLE: 'available',
    SOLD: 'sold',
    RETURNED: 'returned',
    DAMAGED: 'damaged',
    LOST: 'lost'
};

// ==================== GLOBAL VARIABLES ====================
let warehouses = [];
let itemStocks = [];
let itemBatches = [];
let itemSerials = [];
let stockMovements = [];
let transfers = [];
let stocktakes = [];

// ==================== SANITIZATION & VALIDATION ====================
function sanitizeInput(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function validateRequired(params, requiredFields) {
    const missing = requiredFields.filter(field => 
        params[field] === undefined || params[field] === null || params[field] === ''
    );
    if (missing.length > 0) {
        throw new Error(`Parameter wajib tidak lengkap: ${missing.join(', ')}`);
    }
    return true;
}

function validatePositiveNumber(value, fieldName) {
    if (typeof value !== 'number' || isNaN(value) || value <= 0) {
        throw new Error(`${fieldName} harus berupa angka positif`);
    }
    return true;
}

// ==================== DATABASE HELPER (ATOMIC TRANSACTION) ====================
async function dbTransaction(storeNames, mode, callback) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database belum diinisialisasi'));
            return;
        }
        try {
            const transaction = db.transaction(storeNames, mode);
            const stores = storeNames.map(name => transaction.objectStore(name));
            
            let completed = false;
            
            transaction.oncomplete = () => {
                completed = true;
                resolve(true);
            };
            
            transaction.onerror = (e) => {
                if (!completed) {
                    completed = true;
                    reject(e.target.error || new Error('Transaction failed'));
                }
            };
            
            transaction.onabort = () => {
                if (!completed) {
                    completed = true;
                    reject(new Error('Transaction aborted'));
                }
            };
            
            callback(stores, transaction);
        } catch (error) {
            reject(error);
        }
    });
}

// ==================== LOAD DATA FUNCTIONS (WITH ERROR HANDLING) ====================
async function loadWarehouses() {
    try {
        if (!db) throw new Error('Database not initialized');
        warehouses = await dbGetAll(STORES.WAREHOUSES);
        warehouses.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        return warehouses;
    } catch (error) {
        console.error('Error loading warehouses:', error);
        warehouses = [];
        throw error;
    }
}

async function loadItemStocks() {
    try {
        if (!db) throw new Error('Database not initialized');
        itemStocks = await dbGetAll(STORES.ITEM_STOCKS);
        return itemStocks;
    } catch (error) {
        console.error('Error loading item stocks:', error);
        itemStocks = [];
        throw error;
    }
}

async function loadItemBatches() {
    try {
        if (!db) throw new Error('Database not initialized');
        itemBatches = await dbGetAll(STORES.ITEM_BATCHES);
        return itemBatches;
    } catch (error) {
        console.error('Error loading item batches:', error);
        itemBatches = [];
        throw error;
    }
}

async function loadItemSerials() {
    try {
        if (!db) throw new Error('Database not initialized');
        itemSerials = await dbGetAll(STORES.ITEM_SERIALS);
        return itemSerials;
    } catch (error) {
        console.error('Error loading item serials:', error);
        itemSerials = [];
        throw error;
    }
}

async function loadStockMovements(limit = null) {
    try {
        if (!db) throw new Error('Database not initialized');
        let movements = await dbGetAll(STORES.STOCK_MOVEMENTS);
        if (limit) {
            movements = movements.slice(-limit);
        }
        movements.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        stockMovements = movements;
        return movements;
    } catch (error) {
        console.error('Error loading stock movements:', error);
        stockMovements = [];
        throw error;
    }
}

async function loadTransfers() {
    try {
        if (!db) throw new Error('Database not initialized');
        transfers = await dbGetAll(STORES.TRANSFERS);
        transfers.sort((a, b) => new Date(b.requestedAt || b.createdAt) - new Date(a.requestedAt || a.createdAt));
        return transfers;
    } catch (error) {
        console.error('Error loading transfers:', error);
        transfers = [];
        throw error;
    }
}

async function loadStocktakes() {
    try {
        if (!db) throw new Error('Database not initialized');
        stocktakes = await dbGetAll(STORES.STOCKTAKES);
        stocktakes.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
        return stocktakes;
    } catch (error) {
        console.error('Error loading stocktakes:', error);
        stocktakes = [];
        throw error;
    }
}

// ==================== GET STOCK FUNCTIONS ====================
function getItemStock(itemId, warehouseId) {
    if (!itemId || !warehouseId) return 0;
    const stock = itemStocks.find(s => s.itemId === itemId && s.warehouseId === warehouseId);
    return stock ? Math.max(0, stock.quantity) : 0;
}

function getItemStocksByItem(itemId) {
    if (!itemId) return [];
    return itemStocks.filter(s => s.itemId === itemId);
}

function getItemStockByWarehouse(itemId, warehouseId) {
    if (!itemId || !warehouseId) return null;
    return itemStocks.find(s => s.itemId === itemId && s.warehouseId === warehouseId) || null;
}

function getAvailableBatches(itemId, warehouseId, options = {}) {
    if (!itemId || !warehouseId) return [];
    
    let batches = itemBatches.filter(b => 
        b.itemId === itemId && 
        b.warehouseId === warehouseId && 
        b.quantity > 0
    );
    
    // FEFO (First Expired, First Out) - REKOMENDASI untuk barang perishable
    if (options.sortByExpiry !== false) {
        batches.sort((a, b) => {
            const dateA = a.expiryDate ? new Date(a.expiryDate) : new Date('9999-12-31');
            const dateB = b.expiryDate ? new Date(b.expiryDate) : new Date('9999-12-31');
            return dateA - dateB;
        });
    }
    
    // Filter by expiry jika diperlukan
    if (options.onlyValid && options.onlyValid === true) {
        const now = new Date();
        batches = batches.filter(b => !b.expiryDate || new Date(b.expiryDate) > now);
    }
    
    return batches;
}

function getAvailableSerials(itemId, warehouseId, status = SERIAL_STATUS.AVAILABLE) {
    if (!itemId || !warehouseId) return [];
    return itemSerials.filter(s => 
        s.itemId === itemId && 
        s.warehouseId === warehouseId && 
        s.status === status
    );
}

function getSerialById(serialId) {
    return itemSerials.find(s => s.id === serialId) || null;
}

function getBatchById(batchId) {
    return itemBatches.find(b => b.id === batchId) || null;
}

// ==================== ADD STOCK (ATOMIC TRANSACTION) ====================
async function addStock({
    itemId,
    warehouseId,
    quantity,
    batchNumber = null,
    expiryDate = null,
    serialNumbers = [],
    purchasePrice = null,
    referenceId = null,
    referenceType = null,
    notes = '',
    createdBy = null
}) {
    // Validasi parameter
    validateRequired({ itemId, warehouseId, quantity }, ['itemId', 'warehouseId', 'quantity']);
    validatePositiveNumber(quantity, 'quantity');
    
    const item = kasirItems?.find(i => i.id === itemId);
    if (!item) throw new Error('Item tidak ditemukan');
    
    if (item.trackSerial && serialNumbers.length === 0) {
        throw new Error('Item dengan track serial memerlukan serialNumbers');
    }
    
    const now = new Date().toISOString();
    const userId = createdBy || (typeof currentUser !== 'undefined' ? currentUser?.id : null);
    
    // BUG FIX #1: Gunakan atomic transaction
    return await dbTransaction(
        [STORES.ITEM_STOCKS, STORES.ITEM_BATCHES, STORES.ITEM_SERIALS, STORES.STOCK_MOVEMENTS],
        'readwrite',
        async (stores) => {
            const [stockStore, batchStore, serialStore, movementStore] = stores;
            
            // 1. Update atau buat item_stocks
            let stockRecord = itemStocks.find(s => s.itemId === itemId && s.warehouseId === warehouseId);
            let stockOperation = 'update';
            
            if (stockRecord) {
                stockRecord.quantity = (stockRecord.quantity || 0) + quantity;
                stockRecord.updatedAt = now;
            } else {
                stockOperation = 'add';
                stockRecord = {
                    itemId,
                    warehouseId,
                    quantity: quantity,
                    minStock: item.minStock || 5,
                    maxStock: item.maxStock || null,
                    reorderPoint: item.reorderPoint || item.minStock || 5,
                    createdAt: now,
                    updatedAt: now
                };
            }
            
            await new Promise((resolve, reject) => {
                const req = stockOperation === 'add' ? stockStore.add(stockRecord) : stockStore.put(stockRecord);
                req.onsuccess = () => resolve(req.result);
                req.onerror = (e) => reject(e.target.error);
            });
            
            // 2. Jika item dilacak batch, buat/update batch
            let batchId = null;
            if (item.trackBatch && batchNumber) {
                // Cek duplicate batch number di gudang yang sama
                const existingBatch = itemBatches.find(b => 
                    b.batchNumber === batchNumber && 
                    b.itemId === itemId && 
                    b.warehouseId === warehouseId
                );
                
                if (existingBatch) {
                    // Update batch existing
                    existingBatch.quantity = (existingBatch.quantity || 0) + quantity;
                    existingBatch.purchasePrice = purchasePrice || existingBatch.purchasePrice;
                    existingBatch.expiryDate = expiryDate || existingBatch.expiryDate;
                    existingBatch.updatedAt = now;
                    
                    await new Promise((resolve, reject) => {
                        const req = batchStore.put(existingBatch);
                        req.onsuccess = () => resolve();
                        req.onerror = reject;
                    });
                    batchId = existingBatch.id;
                } else {
                    // Buat batch baru
                    const newBatch = {
                        itemId,
                        warehouseId,
                        batchNumber: sanitizeInput(batchNumber),
                        expiryDate: expiryDate ? new Date(expiryDate).toISOString() : null,
                        quantity: quantity,
                        purchasePrice: purchasePrice || 0,
                        receivedDate: now,
                        createdAt: now,
                        updatedAt: now,
                        notes: sanitizeInput(notes || '')
                    };
                    
                    batchId = await new Promise((resolve, reject) => {
                        const req = batchStore.add(newBatch);
                        req.onsuccess = () => resolve(req.result);
                        req.onerror = reject;
                    });
                    newBatch.id = batchId;
                    itemBatches.push(newBatch);
                }
            }
            
            // 3. Jika item dilacak serial, buat serial individual
            const createdSerialIds = [];
            if (item.trackSerial && serialNumbers.length > 0) {
                // BUG FIX #5: Validasi duplicate serial
                for (let sn of serialNumbers) {
                    const sanitizedSn = sanitizeInput(sn).trim();
                    
                    const existingSerial = itemSerials.find(s => 
                        s.serialNumber === sanitizedSn && 
                        s.itemId === itemId && 
                        s.warehouseId === warehouseId
                    );
                    
                    if (existingSerial) {
                        throw new Error(`Serial number "${sanitizedSn}" sudah terdaftar`);
                    }
                    
                    const serialRecord = {
                        itemId,
                        warehouseId,
                        serialNumber: sanitizedSn,
                        batchId: batchId,
                        status: SERIAL_STATUS.AVAILABLE,
                        purchasePrice: purchasePrice || 0,
                        soldPrice: null,
                        saleId: null,
                        createdAt: now,
                        updatedAt: now,
                        notes: sanitizeInput(notes || '')
                    };
                    
                    const serialId = await new Promise((resolve, reject) => {
                        const req = serialStore.add(serialRecord);
                        req.onsuccess = () => resolve(req.result);
                        req.onerror = reject;
                    });
                    
                    serialRecord.id = serialId;
                    itemSerials.push(serialRecord);
                    createdSerialIds.push(serialId);
                }
            }
            
            // 4. Catat stock movement
            const movement = {
                movementType: MOVEMENT_TYPES.IN,
                itemId,
                warehouseId,
                quantity: quantity,
                referenceId: referenceId || null,
                referenceType: referenceType || null,
                batchId: batchId || null,
                serialId: item.trackSerial ? createdSerialIds[0] || null : null,
                unitCost: purchasePrice || item.hargaDasar || 0,
                createdAt: now,
                createdBy: userId,
                notes: sanitizeInput(notes || '')
            };
            
            await new Promise((resolve, reject) => {
                const req = movementStore.add(movement);
                req.onsuccess = () => resolve();
                req.onerror = reject;
            });
            stockMovements.unshift(movement);
            
            // BUG FIX #3: Update local arrays setelah transaction complete
            if (stockOperation === 'add') {
                stockRecord.id = await new Promise(r => r(stockRecord.id || Date.now()));
                itemStocks.push(stockRecord);
            }
            
            return { 
                stockRecord, 
                batchId, 
                serialIds: createdSerialIds,
                movementId: movement.id 
            };
        }
    );
}

// ==================== REMOVE STOCK (ATOMIC, FIFO/FEFO) ====================
async function removeStock({
    itemId,
    warehouseId,
    quantity,
    referenceId = null,
    referenceType = null,
    notes = '',
    createdBy = null,
    useFifo = true,
    selectedBatchId = null,
    selectedSerialIds = [],
    allowNegative = false
}) {
    // Validasi parameter
    validateRequired({ itemId, warehouseId, quantity }, ['itemId', 'warehouseId', 'quantity']);
    validatePositiveNumber(quantity, 'quantity');
    
    const item = kasirItems?.find(i => i.id === itemId);
    if (!item) throw new Error('Item tidak ditemukan');
    
    const now = new Date().toISOString();
    const userId = createdBy || (typeof currentUser !== 'undefined' ? currentUser?.id : null);
    
    return await dbTransaction(
        [STORES.ITEM_STOCKS, STORES.ITEM_BATCHES, STORES.ITEM_SERIALS, STORES.STOCK_MOVEMENTS],
        'readwrite',
        async (stores) => {
            const [stockStore, batchStore, serialStore, movementStore] = stores;
            
            // Cek stok keseluruhan
            let stockRecord = itemStocks.find(s => s.itemId === itemId && s.warehouseId === warehouseId);
            const currentStock = stockRecord ? stockRecord.quantity : 0;
            
            if (!allowNegative && currentStock < quantity) {
                throw new Error(`Stok tidak cukup. Tersedia: ${currentStock}, Dibutuhkan: ${quantity}`);
            }
            
            let remainingQty = quantity;
            const usedBatches = [];
            const usedSerials = [];
            
            // BUG FIX #8: Handle serial items properly
            if (item.trackSerial) {
                if (selectedSerialIds.length > 0) {
                    // Use specific serials
                    if (selectedSerialIds.length !== quantity) {
                        throw new Error('Jumlah serial harus sama dengan quantity');
                    }
                    
                    for (let serialId of selectedSerialIds) {
                        const serial = itemSerials.find(s => s.id === serialId);
                        if (!serial || serial.status !== SERIAL_STATUS.AVAILABLE) {
                            throw new Error(`Serial ${serialId} tidak tersedia`);
                        }
                        
                        serial.status = SERIAL_STATUS.SOLD;
                        serial.soldPrice = null;
                        serial.saleId = referenceId;
                        serial.updatedAt = now;
                        
                        await new Promise((resolve, reject) => {
                            const req = serialStore.put(serial);
                            req.onsuccess = resolve;
                            req.onerror = reject;
                        });
                        
                        // Catat movement per serial
                        const movement = {
                            movementType: MOVEMENT_TYPES.OUT,
                            itemId,
                            warehouseId,
                            quantity: 1,
                            referenceId,
                            referenceType,
                            batchId: serial.batchId,
                            serialId: serial.id,
                            unitCost: serial.purchasePrice,
                            createdAt: now,
                            createdBy: userId,
                            notes: sanitizeInput(notes || '')
                        };
                        
                        await new Promise((resolve, reject) => {
                            const req = movementStore.add(movement);
                            req.onsuccess = resolve;
                            req.onerror = reject;
                        });
                        stockMovements.unshift(movement);
                        
                        // Update batch quantity
                        if (serial.batchId) {
                            const batch = itemBatches.find(b => b.id === serial.batchId);
                            if (batch && batch.quantity > 0) {
                                batch.quantity -= 1;
                                batch.updatedAt = now;
                                await new Promise((resolve, reject) => {
                                    const req = batchStore.put(batch);
                                    req.onsuccess = resolve;
                                    req.onerror = reject;
                                });
                                usedBatches.push({ 
                                    batchId: batch.id, 
                                    quantity: 1, 
                                    unitCost: batch.purchasePrice 
                                });
                            }
                        }
                        usedSerials.push({ serialId: serial.id, unitCost: serial.purchasePrice });
                    }
                } else {
                    // Auto-select available serials (FIFO by created date)
                    const availableSerials = getAvailableSerials(itemId, warehouseId)
                        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                    
                    if (availableSerials.length < quantity) {
                        throw new Error(`Serial tersedia tidak cukup. Tersedia: ${availableSerials.length}, Dibutuhkan: ${quantity}`);
                    }
                    
                    for (let i = 0; i < quantity; i++) {
                        const serial = availableSerials[i];
                        serial.status = SERIAL_STATUS.SOLD;
                        serial.saleId = referenceId;
                        serial.updatedAt = now;
                        
                        await new Promise((resolve, reject) => {
                            const req = serialStore.put(serial);
                            req.onsuccess = resolve;
                            req.onerror = reject;
                        });
                        
                        const movement = {
                            movementType: MOVEMENT_TYPES.OUT,
                            itemId,
                            warehouseId,
                            quantity: 1,
                            referenceId,
                            referenceType,
                            batchId: serial.batchId,
                            serialId: serial.id,
                            unitCost: serial.purchasePrice,
                            createdAt: now,
                            createdBy: userId,
                            notes: sanitizeInput(notes || '')
                        };
                        
                        await new Promise((resolve, reject) => {
                            const req = movementStore.add(movement);
                            req.onsuccess = resolve;
                            req.onerror = reject;
                        });
                        stockMovements.unshift(movement);
                        
                        if (serial.batchId) {
                            const batch = itemBatches.find(b => b.id === serial.batchId);
                            if (batch && batch.quantity > 0) {
                                batch.quantity -= 1;
                                batch.updatedAt = now;
                                await new Promise((resolve, reject) => {
                                    const req = batchStore.put(batch);
                                    req.onsuccess = resolve;
                                    req.onerror = reject;
                                });
                                usedBatches.push({ 
                                    batchId: batch.id, 
                                    quantity: 1, 
                                    unitCost: batch.purchasePrice 
                                });
                            }
                        }
                        usedSerials.push({ serialId: serial.id, unitCost: serial.purchasePrice });
                    }
                }
            }
            // BUG FIX #2: Handle batch items dengan FEFO/FIFO yang jelas
            else if (item.trackBatch) {
                let batches = getAvailableBatches(itemId, warehouseId, { sortByExpiry: !useFifo });
                
                if (selectedBatchId) {
                    batches = batches.filter(b => b.id === selectedBatchId);
                    if (batches.length === 0) {
                        throw new Error('Batch yang dipilih tidak ditemukan atau stok habis');
                    }
                }
                
                for (let batch of batches) {
                    if (remainingQty <= 0) break;
                    
                    const take = Math.min(batch.quantity, remainingQty);
                    if (take <= 0) continue;
                    
                    batch.quantity -= take;
                    batch.updatedAt = now;
                    
                    await new Promise((resolve, reject) => {
                        const req = batchStore.put(batch);
                        req.onsuccess = resolve;
                        req.onerror = reject;
                    });
                    
                    usedBatches.push({ 
                        batchId: batch.id, 
                        quantity: take, 
                        unitCost: batch.purchasePrice 
                    });
                    
                    // Catat movement per batch
                    const movement = {
                        movementType: MOVEMENT_TYPES.OUT,
                        itemId,
                        warehouseId,
                        quantity: take,
                        referenceId,
                        referenceType,
                        batchId: batch.id,
                        serialId: null,
                        unitCost: batch.purchasePrice,
                        createdAt: now,
                        createdBy: userId,
                        notes: sanitizeInput(notes || '')
                    };
                    
                    await new Promise((resolve, reject) => {
                        const req = movementStore.add(movement);
                        req.onsuccess = resolve;
                        req.onerror = reject;
                    });
                    stockMovements.unshift(movement);
                    
                    remainingQty -= take;
                }
                
                if (remainingQty > 0 && !allowNegative) {
                    throw new Error(`Stok batch tidak cukup. Sisa kebutuhan: ${remainingQty}`);
                }
            }
            // Item tanpa batch/serial - kurangi stok biasa
            else {
                if (stockRecord) {
                    stockRecord.quantity = Math.max(0, stockRecord.quantity - quantity);
                    stockRecord.updatedAt = now;
                    
                    await new Promise((resolve, reject) => {
                        const req = stockStore.put(stockRecord);
                        req.onsuccess = resolve;
                        req.onerror = reject;
                    });
                }
                
                // Catat movement agregat
                const movement = {
                    movementType: MOVEMENT_TYPES.OUT,
                    itemId,
                    warehouseId,
                    quantity: quantity,
                    referenceId,
                    referenceType,
                    batchId: null,
                    serialId: null,
                    unitCost: item.hargaDasar || 0,
                    createdAt: now,
                    createdBy: userId,
                    notes: sanitizeInput(notes || '')
                };
                
                await new Promise((resolve, reject) => {
                    const req = movementStore.add(movement);
                    req.onsuccess = resolve;
                    req.onerror = reject;
                });
                stockMovements.unshift(movement);
            }
            
            // BUG FIX #8: Recalculate stockRecord quantity dari batch/serial untuk konsistensi
            if (item.trackBatch || item.trackSerial) {
                let recalculatedQty = 0;
                
                if (item.trackSerial) {
                    recalculatedQty = itemSerials.filter(s => 
                        s.itemId === itemId && 
                        s.warehouseId === warehouseId && 
                        s.status === SERIAL_STATUS.AVAILABLE
                    ).length;
                } else if (item.trackBatch) {
                    recalculatedQty = itemBatches
                        .filter(b => b.itemId === itemId && b.warehouseId === warehouseId)
                        .reduce((sum, b) => sum + Math.max(0, b.quantity), 0);
                }
                
                if (stockRecord && stockRecord.quantity !== recalculatedQty) {
                    stockRecord.quantity = recalculatedQty;
                    stockRecord.updatedAt = now;
                    
                    await new Promise((resolve, reject) => {
                        const req = stockStore.put(stockRecord);
                        req.onsuccess = resolve;
                        req.onerror = reject;
                    });
                }
            }
            
            return { 
                usedBatches, 
                usedSerials,
                totalCost: usedBatches.reduce((sum, u) => sum + (u.quantity * u.unitCost), 0) +
                          usedSerials.reduce((sum, u) => sum + u.unitCost, 0)
            };
        }
    );
}

// ==================== HPP CALCULATION (FIFO/FEFO) ====================
function calculateHPP(itemId, warehouseId, quantity, options = {}) {
    const item = kasirItems?.find(i => i.id === itemId);
    if (!item) return 0;
    
    // BUG FIX #6: Handle serial items
    if (item.trackSerial && options.useSerials !== false) {
        const serials = itemSerials
            .filter(s => s.itemId === itemId && s.warehouseId === warehouseId && s.status === SERIAL_STATUS.AVAILABLE)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        
        let totalCost = 0;
        const taken = Math.min(quantity, serials.length);
        for (let i = 0; i < taken; i++) {
            totalCost += serials[i].purchasePrice;
        }
        return totalCost;
    }
    
    // BUG FIX #2: FEFO untuk batch (First Expired, First Out)
    const batches = getAvailableBatches(itemId, warehouseId, { sortByExpiry: true });
    
    let remaining = quantity;
    let totalCost = 0;
    
    for (let batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(batch.quantity, remaining);
        totalCost += take * (batch.purchasePrice || 0);
        remaining -= take;
    }
    
    // Fallback ke harga dasar jika stok tidak cukup
    if (remaining > 0) {
        const fallbackPrice = item.hargaDasar || 0;
        totalCost += remaining * fallbackPrice;
        console.warn(`Stok tidak cukup untuk HPP item ${itemId}, menggunakan harga dasar untuk ${remaining} unit`);
    }
    
    return totalCost;
}

function getAverageCost(itemId, warehouseId) {
    const batches = itemBatches.filter(b => 
        b.itemId === itemId && 
        b.warehouseId === warehouseId && 
        b.quantity > 0
    );
    
    if (batches.length === 0) {
        const item = kasirItems?.find(i => i.id === itemId);
        return item?.hargaDasar || 0;
    }
    
    const totalQty = batches.reduce((sum, b) => sum + b.quantity, 0);
    const totalValue = batches.reduce((sum, b) => sum + (b.quantity * (b.purchasePrice || 0)), 0);
    
    return totalQty > 0 ? totalValue / totalQty : 0;
}

// ==================== TRANSFER STOK (ATOMIC) ====================
async function generateTransferNumber() {
    // BUG FIX #11: Gunakan counter, bukan random
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    
    try {
        const settings = await dbGet(STORES.SETTINGS, 'transferCounter');
        let counter = settings?.value?.[dateStr] || 0;
        counter++;
        
        await dbPut(STORES.SETTINGS, {
            key: 'transferCounter',
            value: { ...(settings?.value || {}), [dateStr]: counter }
        });
        
        return `TRF-${dateStr}-${String(counter).padStart(5, '0')}`;
    } catch (error) {
        console.warn('Gagal generate transfer number, menggunakan fallback:', error);
        return `TRF-${dateStr}-${Math.floor(Math.random()*9000+1000)}`;
    }
}

async function createTransfer(transferData) {
    validateRequired(transferData, ['fromWarehouseId', 'toWarehouseId', 'items', 'requestedBy']);
    
    if (transferData.fromWarehouseId === transferData.toWarehouseId) {
        throw new Error('Gudang asal dan tujuan tidak boleh sama');
    }
    
    const now = new Date().toISOString();
    const transferNumber = await generateTransferNumber();
    
    const transfer = {
        transferNumber,
        fromWarehouseId: transferData.fromWarehouseId,
        toWarehouseId: transferData.toWarehouseId,
        status: 'draft',
        requestedBy: transferData.requestedBy,
        requestedAt: now,
        sentAt: null,
        receivedAt: null,
        receivedBy: null,
        notes: sanitizeInput(transferData.notes || ''),
        createdAt: now,
        updatedAt: now
    };
    
    const id = await dbAdd(STORES.TRANSFERS, transfer);
    transfer.id = id;
    
    // Simpan item transfer dengan validasi
    const transferItems = [];
    for (let item of transferData.items) {
        validateRequired(item, ['itemId', 'quantity']);
        validatePositiveNumber(item.quantity, 'quantity');
        
        // Validasi stok di gudang asal
        const availableStock = getItemStock(item.itemId, transferData.fromWarehouseId);
        if (availableStock < item.quantity) {
            throw new Error(`Stok tidak cukup untuk item ${item.itemId} di gudang asal`);
        }
        
        const transferItem = {
            transferId: id,
            itemId: item.itemId,
            batchId: item.batchId || null,
            quantity: item.quantity,
            unitCost: getAverageCost(item.itemId, transferData.fromWarehouseId),
            receivedQuantity: 0,
            notes: sanitizeInput(item.notes || '')
        };
        transferItems.push(transferItem);
    }
    
    for (let ti of transferItems) {
        await dbAdd(STORES.TRANSFER_ITEMS, ti);
    }
    
    transfers.unshift(transfer);
    return transfer;
}

async function sendTransfer(transferId, sentBy) {
    const transfer = await dbGet(STORES.TRANSFERS, transferId);
    if (!transfer) throw new Error('Transfer tidak ditemukan');
    if (transfer.status !== 'draft') throw new Error('Transfer sudah diproses');
    
    const now = new Date().toISOString();
    
    // BUG FIX #7: Atomic transaction untuk send transfer
    return await dbTransaction(
        [STORES.TRANSFERS, STORES.TRANSFER_ITEMS, STORES.ITEM_STOCKS, STORES.ITEM_BATCHES, STORES.STOCK_MOVEMENTS],
        'readwrite',
        async (stores) => {
            const [transferStore, transferItemStore, stockStore, batchStore, movementStore] = stores;
            
            // Kurangi stok dari gudang asal
            const transferItems = (await dbGetAll(STORES.TRANSFER_ITEMS))
                .filter(ti => ti.transferId === transferId);
            
            for (let ti of transferItems) {
                // Kurangi stok menggunakan removeStock logic
                const item = kasirItems?.find(i => i.id === ti.itemId);
                if (!item) continue;
                
                if (item.trackBatch && ti.batchId) {
                    const batch = itemBatches.find(b => b.id === ti.batchId);
                    if (batch && batch.quantity >= ti.quantity) {
                        batch.quantity -= ti.quantity;
                        batch.updatedAt = now;
                        await new Promise((resolve, reject) => {
                            const req = batchStore.put(batch);
                            req.onsuccess = resolve;
                            req.onerror = reject;
                        });
                    }
                }
                
                // Update stock record
                const stock = itemStocks.find(s => s.itemId === ti.itemId && s.warehouseId === transfer.fromWarehouseId);
                if (stock) {
                    stock.quantity = Math.max(0, stock.quantity - ti.quantity);
                    stock.updatedAt = now;
                    await new Promise((resolve, reject) => {
                        const req = stockStore.put(stock);
                        req.onsuccess = resolve;
                        req.onerror = reject;
                    });
                }
                
                // Catat movement
                const movement = {
                    movementType: MOVEMENT_TYPES.TRANSFER_OUT,
                    itemId: ti.itemId,
                    warehouseId: transfer.fromWarehouseId,
                    quantity: -ti.quantity,
                    referenceId: transferId,
                    referenceType: 'transfer',
                    batchId: ti.batchId,
                    serialId: null,
                    unitCost: ti.unitCost,
                    createdAt: now,
                    createdBy: sentBy,
                    notes: `Transfer keluar: ${transfer.transferNumber}`
                };
                await new Promise((resolve, reject) => {
                    const req = movementStore.add(movement);
                    req.onsuccess = resolve;
                    req.onerror = reject;
                });
            }
            
            // Update status transfer
            transfer.status = 'sent';
            transfer.sentAt = now;
            transfer.updatedAt = now;
            
            await new Promise((resolve, reject) => {
                const req = transferStore.put(transfer);
                req.onsuccess = resolve;
                req.onerror = reject;
            });
            
            return transfer;
        }
    );
}

async function receiveTransfer(transferId, receivedBy, receivedQuantities = {}) {
    const transfer = await dbGet(STORES.TRANSFERS, transferId);
    if (!transfer) throw new Error('Transfer tidak ditemukan');
    if (transfer.status !== 'sent') throw new Error('Transfer belum dikirim');
    
    const now = new Date().toISOString();
    
    return await dbTransaction(
        [STORES.TRANSFERS, STORES.TRANSFER_ITEMS, STORES.ITEM_STOCKS, STORES.ITEM_BATCHES, STORES.STOCK_MOVEMENTS],
        'readwrite',
        async (stores) => {
            const [transferStore, transferItemStore, stockStore, batchStore, movementStore] = stores;
            
            const transferItems = (await dbGetAll(STORES.TRANSFER_ITEMS))
                .filter(ti => ti.transferId === transferId);
            
            for (let ti of transferItems) {
                const receivedQty = receivedQuantities[ti.id] || ti.quantity;
                if (receivedQty <= 0) continue;
                
                // Tambah stok ke gudang tujuan
                const item = kasirItems?.find(i => i.id === ti.itemId);
                if (!item) continue;
                
                // Update atau buat stock record di gudang tujuan
                let stock = itemStocks.find(s => s.itemId === ti.itemId && s.warehouseId === transfer.toWarehouseId);
                if (stock) {
                    stock.quantity += receivedQty;
                    stock.updatedAt = now;
                    await new Promise((resolve, reject) => {
                        const req = stockStore.put(stock);
                        req.onsuccess = resolve;
                        req.onerror = reject;
                    });
                } else {
                    stock = {
                        itemId: ti.itemId,
                        warehouseId: transfer.toWarehouseId,
                        quantity: receivedQty,
                        minStock: item.minStock || 5,
                        maxStock: item.maxStock || null,
                        reorderPoint: item.reorderPoint || item.minStock || 5,
                        createdAt: now,
                        updatedAt: now
                    };
                    const id = await new Promise((resolve, reject) => {
                        const req = stockStore.add(stock);
                        req.onsuccess = () => resolve(req.result);
                        req.onerror = reject;
                    });
                    stock.id = id;
                    itemStocks.push(stock);
                }
                
                // Jika item track batch, buat batch baru di gudang tujuan
                if (item.trackBatch && ti.batchId) {
                    const sourceBatch = itemBatches.find(b => b.id === ti.batchId);
                    if (sourceBatch) {
                        const newBatch = {
                            itemId: ti.itemId,
                            warehouseId: transfer.toWarehouseId,
                            batchNumber: `${sourceBatch.batchNumber}-TRF`,
                            expiryDate: sourceBatch.expiryDate,
                            quantity: receivedQty,
                            purchasePrice: sourceBatch.purchasePrice,
                            receivedDate: now,
                            createdAt: now,
                            updatedAt: now,
                            notes: `Transfer dari ${transfer.fromWarehouseId}`
                        };
                        const batchId = await new Promise((resolve, reject) => {
                            const req = batchStore.add(newBatch);
                            req.onsuccess = () => resolve(req.result);
                            req.onerror = reject;
                        });
                        newBatch.id = batchId;
                        itemBatches.push(newBatch);
                    }
                }
                
                // Catat movement masuk
                const movement = {
                    movementType: MOVEMENT_TYPES.TRANSFER_IN,
                    itemId: ti.itemId,
                    warehouseId: transfer.toWarehouseId,
                    quantity: receivedQty,
                    referenceId: transferId,
                    referenceType: 'transfer',
                    batchId: ti.batchId,
                    serialId: null,
                    unitCost: ti.unitCost,
                    createdAt: now,
                    createdBy: receivedBy,
                    notes: `Transfer masuk: ${transfer.transferNumber}`
                };
                await new Promise((resolve, reject) => {
                    const req = movementStore.add(movement);
                    req.onsuccess = resolve;
                    req.onerror = reject;
                });
                
                // Update received quantity
                ti.receivedQuantity = (ti.receivedQuantity || 0) + receivedQty;
                await new Promise((resolve, reject) => {
                    const req = transferItemStore.put(ti);
                    req.onsuccess = resolve;
                    req.onerror = reject;
                });
            }
            
            // Update status transfer
            const allReceived = transferItems.every(ti => ti.receivedQuantity >= ti.quantity);
            transfer.status = allReceived ? 'received' : 'partial';
            transfer.receivedBy = receivedBy;
            transfer.receivedAt = now;
            transfer.updatedAt = now;
            
            await new Promise((resolve, reject) => {
                const req = transferStore.put(transfer);
                req.onsuccess = resolve;
                req.onerror = reject;
            });
            
            return transfer;
        }
    );
}

async function cancelTransfer(transferId, cancelledBy, reason = '') {
    const transfer = await dbGet(STORES.TRANSFERS, transferId);
    if (!transfer) throw new Error('Transfer tidak ditemukan');
    if (transfer.status === 'received') throw new Error('Transfer sudah diterima, tidak bisa dibatalkan');
    
    const now = new Date().toISOString();
    
    // Jika status 'sent', kembalikan stok ke gudang asal
    if (transfer.status === 'sent') {
        const transferItems = (await dbGetAll(STORES.TRANSFER_ITEMS))
            .filter(ti => ti.transferId === transferId);
        
        for (let ti of transferItems) {
            // Kembalikan stok ke gudang asal (simplified - dalam production perlu lebih robust)
            const stock = itemStocks.find(s => 
                s.itemId === ti.itemId && s.warehouseId === transfer.fromWarehouseId
            );
            if (stock) {
                stock.quantity += ti.quantity;
                stock.updatedAt = now;
                await dbPut(STORES.ITEM_STOCKS, stock);
            }
        }
    }
    
    transfer.status = 'cancelled';
    transfer.cancelledBy = cancelledBy;
    transfer.cancelledAt = now;
    transfer.notes = sanitizeInput(reason || transfer.notes || '');
    transfer.updatedAt = now;
    
    await dbPut(STORES.TRANSFERS, transfer);
    return transfer;
}

// ==================== STOCK OPNAME ====================
async function createStocktake(stocktakeData) {
    validateRequired(stocktakeData, ['warehouseId', 'items', 'createdBy']);
    
    const now = new Date().toISOString();
    const number = `ST-${now.slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*9000+1000)}`;
    
    const stocktake = {
        stocktakeNumber: number,
        warehouseId: stocktakeData.warehouseId,
        startDate: now,
        endDate: null,
        status: 'in_progress',
        createdBy: stocktakeData.createdBy,
        completedBy: null,
        notes: sanitizeInput(stocktakeData.notes || ''),
        createdAt: now,
        updatedAt: now
    };
    
    const id = await dbAdd(STORES.STOCKTAKES, stocktake);
    stocktake.id = id;
    
    for (let item of stocktakeData.items) {
        validateRequired(item, ['itemId', 'systemQty', 'physicalQty']);
        
        const diff = item.physicalQty - item.systemQty;
        const stocktakeItem = {
            stocktakeId: id,
            itemId: item.itemId,
            batchId: item.batchId || null,
            systemQty: item.systemQty,
            physicalQty: item.physicalQty,
            difference: diff,
            unitCost: item.unitCost || getAverageCost(item.itemId, stocktakeData.warehouseId),
            adjustmentApplied: false,
            notes: sanitizeInput(item.notes || ''),
            createdAt: now
        };
        await dbAdd(STORES.STOCKTAKE_ITEMS, stocktakeItem);
    }
    
    stocktakes.unshift(stocktake);
    return stocktake;
}

async function completeStocktake(stocktakeId, completedBy, applyAdjustments = true) {
    const stocktake = await dbGet(STORES.STOCKTAKES, stocktakeId);
    if (!stocktake) throw new Error('Stocktake tidak ditemukan');
    if (stocktake.status !== 'in_progress') throw new Error('Stocktake sudah diproses');
    
    const stocktakeItems = (await dbGetAll(STORES.STOCKTAKE_ITEMS))
        .filter(si => si.stocktakeId === stocktakeId);
    
    const now = new Date().toISOString();
    const adjustments = [];
    
    if (applyAdjustments) {
        for (let si of stocktakeItems) {
            if (si.difference === 0) continue;
            
            const item = kasirItems?.find(i => i.id === si.itemId);
            if (!item) continue;
            
            // BUG FIX #12: Validasi untuk adjustment negatif
            const currentStock = getItemStock(si.itemId, stocktake.warehouseId);
            if (si.difference < 0 && currentStock < Math.abs(si.difference)) {
                console.warn(`Adjustment negatif melebihi stok untuk item ${si.itemId}`);
                // Lanjutkan dengan stok yang tersedia
                si.difference = -currentStock;
            }
            
            if (si.difference > 0) {
                await addStock({
                    itemId: si.itemId,
                    warehouseId: stocktake.warehouseId,
                    quantity: si.difference,
                    batchNumber: si.batchId ? `ST-ADJ-${stocktake.stocktakeNumber}` : null,
                    referenceId: stocktakeId,
                    referenceType: 'stocktake',
                    notes: `Adjustment dari stocktake ${stocktake.stocktakeNumber}`,
                    createdBy: completedBy
                });
            } else if (si.difference < 0) {
                await removeStock({
                    itemId: si.itemId,
                    warehouseId: stocktake.warehouseId,
                    quantity: Math.abs(si.difference),
                    referenceId: stocktakeId,
                    referenceType: 'stocktake',
                    notes: `Adjustment dari stocktake ${stocktake.stocktakeNumber}`,
                    createdBy: completedBy,
                    allowNegative: false
                });
            }
            
            si.adjustmentApplied = true;
            si.adjustedAt = now;
            await dbPut(STORES.STOCKTAKE_ITEMS, si);
            
            adjustments.push({
                itemId: si.itemId,
                difference: si.difference,
                unitCost: si.unitCost,
                totalValue: si.difference * si.unitCost
            });
        }
    }
    
    stocktake.status = 'completed';
    stocktake.endDate = now;
    stocktake.completedBy = completedBy;
    stocktake.updatedAt = now;
    await dbPut(STORES.STOCKTAKES, stocktake);
    
    return { stocktake, adjustments };
}

// ==================== INTEGRASI DENGAN TRANSAKSI PENJUALAN ====================
async function processStockForSale(saleItems, warehouseId, saleId, userId) {
    let totalHPP = 0;
    const processedItems = [];
    
    for (let item of saleItems) {
        try {
            if (item.isBundle) {
                // Handle bundle components
                for (let comp of item.components) {
                    const compItem = kasirItems?.find(i => i.id === comp.itemId);
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
                        notes: `Penjualan bundle ${item.itemName || item.name}`,
                        createdBy: userId,
                        selectedBatchId: comp.batchId,
                        selectedSerialIds: comp.serialIds || []
                    });
                    
                    totalHPP += used.totalCost || 0;
                }
            } else {
                // Handle regular item
                let qty = item.qty;
                if (item.unitConversion) {
                    qty *= item.unitConversion.value;
                }
                
                const used = await removeStock({
                    itemId: item.itemId || item.item?.id,
                    warehouseId,
                    quantity: qty,
                    referenceId: saleId,
                    referenceType: 'sale',
                    notes: '',
                    createdBy: userId,
                    selectedBatchId: item.batchId,
                    selectedSerialIds: item.serialIds || []
                });
                
                totalHPP += used.totalCost || 0;
            }
            
            processedItems.push({ success: true, item: item });
        } catch (error) {
            processedItems.push({ success: false, item: item, error: error.message });
            throw error; // Re-throw untuk rollback
        }
    }
    
    return { totalHPP, processedItems };
}

// ==================== REPORTING FUNCTIONS ====================
function getStockValue(warehouseId = null) {
    let totalValue = 0;
    
    for (let stock of itemStocks) {
        if (warehouseId && stock.warehouseId !== warehouseId) continue;
        
        const item = kasirItems?.find(i => i.id === stock.itemId);
        if (!item) continue;
        
        const unitCost = getAverageCost(stock.itemId, stock.warehouseId);
        totalValue += stock.quantity * unitCost;
    }
    
    return totalValue;
}

function getLowStockItems(warehouseId = null, threshold = null) {
    return kasirItems?.filter(item => {
        const stock = getItemStockByWarehouse(item.id, warehouseId);
        if (!stock) return false;
        
        const minStock = threshold !== null ? threshold : (item.minStock || 5);
        return stock.quantity <= minStock;
    }).map(item => {
        const stock = getItemStockByWarehouse(item.id, warehouseId);
        const warehouse = warehouses.find(w => w.id === stock?.warehouseId);
        return {
            item,
            warehouse: warehouse?.name || '-',
            currentStock: stock?.quantity || 0,
            minStock: item.minStock || 5,
            reorderPoint: item.reorderPoint || item.minStock || 5
        };
    });
}

function getStockMovementReport(filters = {}) {
    let movements = [...stockMovements];
    
    if (filters.itemId) {
        movements = movements.filter(m => m.itemId === filters.itemId);
    }
    if (filters.warehouseId) {
        movements = movements.filter(m => m.warehouseId === filters.warehouseId);
    }
    if (filters.movementType) {
        movements = movements.filter(m => m.movementType === filters.movementType);
    }
    if (filters.startDate) {
        movements = movements.filter(m => new Date(m.createdAt) >= new Date(filters.startDate));
    }
    if (filters.endDate) {
        movements = movements.filter(m => new Date(m.createdAt) <= new Date(filters.endDate));
    }
    
    return movements.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ==================== UTILITY FUNCTIONS ====================
async function syncLocalArrays() {
    // Refresh semua local arrays dari database
    await Promise.all([
        loadWarehouses(),
        loadItemStocks(),
        loadItemBatches(),
        loadItemSerials(),
        loadStockMovements(),
        loadTransfers(),
        loadStocktakes()
    ]);
}

function getWarehouseName(warehouseId) {
    const wh = warehouses.find(w => w.id === warehouseId);
    return wh ? sanitizeInput(wh.name) : '-';
}

function getItemName(itemId) {
    const item = kasirItems?.find(i => i.id === itemId);
    return item ? sanitizeInput(item.name) : '-';
}

function formatMovementType(type) {
    const labels = {
        [MOVEMENT_TYPES.IN]: 'Stok Masuk',
        [MOVEMENT_TYPES.OUT]: 'Stok Keluar',
        [MOVEMENT_TYPES.ADJUSTMENT]: 'Adjustment',
        [MOVEMENT_TYPES.TRANSFER_IN]: 'Transfer Masuk',
        [MOVEMENT_TYPES.TRANSFER_OUT]: 'Transfer Keluar',
        [MOVEMENT_TYPES.SALE]: 'Penjualan',
        [MOVEMENT_TYPES.PURCHASE]: 'Pembelian',
        [MOVEMENT_TYPES.STOCKTAKE]: 'Stock Opname',
        [MOVEMENT_TYPES.PRODUCTION_IN]: 'Produksi Masuk',
        [MOVEMENT_TYPES.PRODUCTION_OUT]: 'Produksi Keluar',
        [MOVEMENT_TYPES.CONSIGNMENT_IN]: 'Konsinyasi Masuk',
        [MOVEMENT_TYPES.CONSIGNMENT_OUT]: 'Konsinyasi Keluar'
    };
    return labels[type] || type;
}

// ==================== EXPOSE TO GLOBAL ====================
window.STORES = STORES;
window.MOVEMENT_TYPES = MOVEMENT_TYPES;
window.SERIAL_STATUS = SERIAL_STATUS;

window.warehouses = warehouses;
window.itemStocks = itemStocks;
window.itemBatches = itemBatches;
window.itemSerials = itemSerials;
window.stockMovements = stockMovements;
window.transfers = transfers;
window.stocktakes = stocktakes;

// Load functions
window.loadWarehouses = loadWarehouses;
window.loadItemStocks = loadItemStocks;
window.loadItemBatches = loadItemBatches;
window.loadItemSerials = loadItemSerials;
window.loadStockMovements = loadStockMovements;
window.loadTransfers = loadTransfers;
window.loadStocktakes = loadStocktakes;
window.syncLocalArrays = syncLocalArrays;

// Get functions
window.getItemStock = getItemStock;
window.getItemStocksByItem = getItemStocksByItem;
window.getItemStockByWarehouse = getItemStockByWarehouse;
window.getAvailableBatches = getAvailableBatches;
window.getAvailableSerials = getAvailableSerials;
window.getSerialById = getSerialById;
window.getBatchById = getBatchById;
window.getWarehouseName = getWarehouseName;
window.getItemName = getItemName;
window.formatMovementType = formatMovementType;

// Stock operations
window.addStock = addStock;
window.removeStock = removeStock;
window.calculateHPP = calculateHPP;
window.calculateHPPFIFO = calculateHPP; // Alias untuk backward compatibility
window.getAverageCost = getAverageCost;

// Transfer functions
window.generateTransferNumber = generateTransferNumber;
window.createTransfer = createTransfer;
window.sendTransfer = sendTransfer;
window.receiveTransfer = receiveTransfer;
window.cancelTransfer = cancelTransfer;

// Stocktake functions
window.createStocktake = createStocktake;
window.completeStocktake = completeStocktake;

// Sale integration
window.processStockForSale = processStockForSale;

// Reporting
window.getStockValue = getStockValue;
window.getLowStockItems = getLowStockItems;
window.getStockMovementReport = getStockMovementReport;

// Utilities
window.dbTransaction = dbTransaction;
window.sanitizeInput = sanitizeInput;
window.validateRequired = validateRequired;
window.validatePositiveNumber = validatePositiveNumber;

// ==================== INITIALIZATION ====================
async function initInventoryModule() {
    try {
        await syncLocalArrays();
        console.log('Inventory module initialized');
        return true;
    } catch (error) {
        console.error('Failed to initialize inventory module:', error);
        return false;
    }
}

window.initInventoryModule = initInventoryModule;

// Auto-init jika DOM ready dan db tersedia
if (typeof document !== 'undefined' && typeof db !== 'undefined' && db) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInventoryModule);
    } else {
        initInventoryModule();
    }
}
