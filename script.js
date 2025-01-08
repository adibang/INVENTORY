let inventoryData = [];

// Fungsi untuk memuat data dari LocalStorage
function loadFromLocalStorage() {
  const storedData = localStorage.getItem("inventoryData");
  if (storedData) {
    inventoryData = JSON.parse(storedData);
    renderTable();
  }
}

// Fungsi untuk menyimpan data ke LocalStorage
function saveToLocalStorage() {
  localStorage.setItem("inventoryData", JSON.stringify(inventoryData));
}

// Menambahkan item baru ke inventaris
document.getElementById("addItem").addEventListener("click", () => {
  const employeeName = document.getElementById("employeeName").value;
  const supervisorName = document.getElementById("supervisorName").value;
  const storeNumber = document.getElementById("storeNumber").value;
  const storeLocation = document.getElementById("storeLocation").value;
  const date = document.getElementById("date").value;
  const itemName = document.getElementById("itemName").value;
  const itemPrice = parseFloat(document.getElementById("itemPrice").value);
  const itemStock = parseFloat(document.getElementById("itemStock").value);

  const newItem = {
    employeeName,
    supervisorName,
    storeNumber,
    storeLocation,
    date,
    itemName,
    itemPrice,
    itemStock,
    sold: 0,
    remaining: itemStock,
    damaged: 0,
    sellable: itemStock,
    shrinkage: 0,
    notes: ""
  };

  inventoryData.push(newItem);
  saveToLocalStorage();
  renderTable();
  document.getElementById("inventoryForm").reset();
});

// Fungsi untuk merender tabel
function renderTable() {
  const tableBody = document.querySelector("#inventoryTable tbody");
  tableBody.innerHTML = "";

  inventoryData.forEach((item, index) => {
    // Menghitung nilai penyusutan
    const shrinkageValue = (item.itemPrice * item.damaged);

    const row = `
      <tr>
        <td>${item.itemName}</td>
        <td>${item.itemPrice.toFixed(2)}</td>
        <td>${item.itemStock}</td>
        <td>${item.sold}</td>
        <td>${item.remaining}</td>
        <td>${item.damaged}</td>
        <td>${item.sellable}</td>
        <td>${item.shrinkage.toFixed(2)}%</td>
        <td>${shrinkageValue.toFixed(2)}</td> <!-- Kolom Nilai Penyusutan -->
        <td>${item.notes}</td>
        <td><button class="btn edit-btn" data-index="${index}">Edit</button></td>
        <td><button class="btn delete-btn" data-index="${index}">Delete</button></td>
      </tr>
    `;
    tableBody.innerHTML += row;
  });

  // Menambahkan event listener untuk tombol Edit
  const editButtons = document.querySelectorAll(".edit-btn");
  editButtons.forEach(button => {
    button.addEventListener("click", () => {
      const index = button.getAttribute("data-index");
      const item = inventoryData[index];
      document.getElementById("sold").value = item.sold;
      document.getElementById("damaged").value = item.damaged;
      document.getElementById("notes").value = item.notes;
      document.getElementById("editModal").style.display = "block";
      document.getElementById("saveEdit").setAttribute("data-index", index);
    });
  });

  // Menambahkan event listener untuk tombol Delete
  const deleteButtons = document.querySelectorAll(".delete-btn");
  deleteButtons.forEach(button => {
    button.addEventListener("click", () => {
      const index = button.getAttribute("data-index");
      // Menghapus item dari array inventoryData
      inventoryData.splice(index, 1);
      // Menyimpan perubahan ke LocalStorage
      saveToLocalStorage();
      // Render ulang tabel
      renderTable();
    });
  });
}



// Menyimpan Edit ke Data
document.getElementById("saveEdit").addEventListener("click", () => {
  const index = document.getElementById("saveEdit").getAttribute("data-index");
  const sold = parseFloat(document.getElementById("sold").value);
  const damaged = parseFloat(document.getElementById("damaged").value);
  const notes = document.getElementById("notes").value;

  inventoryData[index].sold = sold;
  inventoryData[index].damaged = damaged;
  inventoryData[index].notes = notes;
  inventoryData[index].remaining = inventoryData[index].itemStock - sold - damaged;
  inventoryData[index].sellable = inventoryData[index].remaining;  // Update layak jual
  inventoryData[index].shrinkage = (damaged / inventoryData[index].itemStock) * 100;  // Update susut

  saveToLocalStorage();
  renderTable();
  document.getElementById("editModal").style.display = "none";  // Menutup modal
});

// Menutup Modal Edit
document.getElementById("cancelEdit").addEventListener("click", () => {
  document.getElementById("editModal").style.display = "none";
});

// Fungsi untuk mengekspor data ke file Excel
document.getElementById("exportData").addEventListener("click", () => {
  if (inventoryData.length === 0) {
    alert("Tidak ada data untuk diekspor!");
    return;
  }

  const exportData = inventoryData.map((item, index) => ({
    "No": index + 1,
    "Nama Barang": item.itemName,
    "Harga Barang": item.itemPrice.toFixed(2),
    "Stok Awal": item.itemStock,
    "Barang Terjual": item.sold,
    "Barang Rusak": item.damaged,
    "Sisa Barang": item.remaining,
    "Barang Layak Jual": item.sellable,
    "Penyusutan (%)": item.shrinkage.toFixed(2),
    "Keterangan": item.notes
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");

  // Export file XLSX
  XLSX.writeFile(workbook, "Inventory_Data.xlsx");
});

// Muat data dari LocalStorage saat halaman dimuat
loadFromLocalStorage();
