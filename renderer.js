const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const batFileList = document.getElementById('bat-file-list');
const addBatFileButton = document.getElementById('add-bat-file');
const consoleOutput = document.getElementById('console-output');
const categoryTabs = document.getElementById('category-tabs');


let currentEditIndex = null;

let selectedCategory = null;
// Navigation: Show Active Section
window.showSection = (sectionId) => {
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active-section');
    });
    document.getElementById(sectionId).classList.add('active-section');

    // Update active link in the tabs
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    document.querySelector(`.nav-link[onclick="showSection('${sectionId}')"]`).classList.add('active');

    // Load BAT files when switching to BAT Manager
    if (sectionId === 'bat-files-page') {
        loadCategories();
    }
};

// Ensure default page loads on startup
document.addEventListener('DOMContentLoaded', () => {
    loadCategories();
    showSection('bat-files-page'); // Default to BAT Files Manager
});

// UPnP Scanning
document.getElementById('scan-upnp').addEventListener('click', () => {
    const deviceList = document.getElementById('upnp-device-list');
    const loadingSpinner = document.getElementById('upnp-loading');

    deviceList.innerHTML = ''; // Clear previous results
    loadingSpinner.classList.remove('d-none'); // Show spinner

    ipcRenderer.send('scan-upnp');

    // Set a timeout for 60 seconds (60000 ms)
    window.upnpTimeout = setTimeout(() => {
        loadingSpinner.classList.add('d-none'); // Hide spinner
        deviceList.innerHTML = '<li class="list-group-item text-danger">No devices found (Timeout after 60s).</li>';
    }, 60000);
});

ipcRenderer.on('upnp-results', (event, devices) => {
    const deviceList = document.getElementById('upnp-device-list');
    const loadingSpinner = document.getElementById('upnp-loading');

    clearTimeout(window.upnpTimeout); // Cancel timeout if results arrive
    loadingSpinner.classList.add('d-none'); // Hide spinner

    if (devices.length === 0) {
        deviceList.innerHTML = '<li class="list-group-item text-danger">No devices found.</li>';
        return;
    }

    devices.forEach(device => {
        const listItem = document.createElement('li');
        listItem.className = 'list-group-item';
        listItem.textContent = `Name: ${device.name}, IP: ${device.ip}, Type: ${device.type}`;
        deviceList.appendChild(listItem);
    });
});


// Load categories and files
function loadCategories() {
    fs.readFile(path.join(__dirname, 'bat-files.json'), 'utf8', (err, data) => {
        if (err) return console.error('Error reading bat-files.json:', err);

        try {
            const categories = JSON.parse(data);
            categoryTabs.innerHTML = '';

            categories.forEach((category, index) => {
                const tab = document.createElement('li');
                tab.className = 'nav-item';
                tab.innerHTML = `
                    <a class="nav-link ${selectedCategory === category.category ? 'active' : ''}" 
                       href="#" onclick="setActiveCategory('${category.category}')">
                        ${category.category}
                    </a>
                `;
                categoryTabs.appendChild(tab);

                if (index === 0 && !selectedCategory) {
                    selectedCategory = category.category;
                }
            });

            loadBatFiles(selectedCategory);
        } catch (err) {
            console.error('Error parsing bat-files.json:', err);
        }
    });
}

window.setActiveCategory = (category) => {
    selectedCategory = category;
    document.querySelectorAll('.nav-link').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`.nav-link[href="#"][onclick="setActiveCategory('${category}')"]`).classList.add('active');

    loadBatFiles(category);
};


// Load BAT files for a selected category
function loadBatFiles(category) {
    selectedCategory = category;
    fs.readFile(path.join(__dirname, 'bat-files.json'), 'utf8', (err, data) => {
        if (err) return console.error('Error reading bat-files.json:', err);

        try {
            const categories = JSON.parse(data);
            const categoryData = categories.find(cat => cat.category === category);
            if (!categoryData) return;

            batFileList.innerHTML = '';
            categoryData.files.forEach((file, index) => {
                const listItem = document.createElement('div');
                listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
                listItem.innerHTML = `
                    <div>
                        <i class="fas ${file.icon} me-2"></i>
                        ${file.name}
                        <small class="d-block text-muted">${file.description}</small>
                    </div>
                    <div>
                        <button class="btn btn-success btn-sm me-2" onclick="runBatFile('${file.path}')">Run</button>
                        <button class="btn btn-warning btn-sm me-2" onclick="editBatFile('${category}', ${index})">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteBatFile('${category}', ${index})">Delete</button>
                    </div>
                `;
                batFileList.appendChild(listItem);
            });
        } catch (err) {
            console.error('Error parsing bat-files.json:', err);
        }
    });
}


// Add BAT file
addBatFileButton.addEventListener('click', () => {
    ipcRenderer.send('open-file-dialog');
});

ipcRenderer.on('selected-file', (event, filePath) => {
    console.log("Selected file:", filePath);

    // Normalize path
    const normalizedPath = filePath.replace(/\\/g, "//");

    // Show modal to get category
    document.getElementById('edit-category').value = selectedCategory || '';
    document.getElementById('edit-name').value = path.basename(filePath);
    document.getElementById('edit-icon').value = 'fa-terminal';
    document.getElementById('edit-description').value = '';

    new bootstrap.Modal(document.getElementById('editModal')).show();

    document.getElementById('save-changes').onclick = function() {
        const category = document.getElementById('edit-category').value.trim();
        const name = document.getElementById('edit-name').value.trim();
        const icon = document.getElementById('edit-icon').value.trim();
        const description = document.getElementById('edit-description').value.trim();

        if (!category || !name) {
            alert('Category and Name are required.');
            return;
        }

        const newBatFile = { name, icon, description, path: normalizedPath };

        const jsonPath = path.join(__dirname, 'bat-files.json');

        fs.readFile(jsonPath, 'utf8', (err, data) => {
            let categories = [];

            if (!err) {
                try {
                    categories = JSON.parse(data);
                } catch (parseErr) {
                    console.error('Error parsing bat-files.json:', parseErr);
                }
            }

            // Check if category exists
            let categoryObj = categories.find(cat => cat.category === category);
            if (!categoryObj) {
                categoryObj = { category, files: [] };
                categories.push(categoryObj);
            }

            categoryObj.files.push(newBatFile);

            fs.writeFile(jsonPath, JSON.stringify(categories, null, 2), (err) => {
                if (err) {
                    console.error('Error writing to bat-files.json:', err);
                    return;
                }
                loadCategories(); // Reload UI with updated categories
                bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
            });
        });
    };
});



// Run BAT file and display console output
window.runBatFile = (filePath) => {
    consoleOutput.innerHTML = ''; // Clear previous output
    try {
        const batProcess = spawn('cmd.exe', ['/c', filePath]);

        batProcess.stdout.on('data', (data) => {
            consoleOutput.innerHTML += `<div>${data.toString()}</div>`;
            consoleOutput.scrollTop = consoleOutput.scrollHeight; // Auto-scroll
        });

        batProcess.stderr.on('data', (data) => {
            consoleOutput.innerHTML += `<div class="text-danger">${data.toString()}</div>`;
            consoleOutput.scrollTop = consoleOutput.scrollHeight; // Auto-scroll
        });

        batProcess.on('close', (code) => {
            consoleOutput.innerHTML += `<div class="text-info">Process exited with code ${code}</div>`;
            consoleOutput.scrollTop = consoleOutput.scrollHeight; // Auto-scroll
        });
    } catch (err) {
        consoleOutput.innerHTML += `<div class="text-danger">Error executing BAT file: ${err.message}</div>`;
    }
};

// Edit BAT file metadata
window.editBatFile = (category, index) => {
    fs.readFile(path.join(__dirname, 'bat-files.json'), 'utf8', (err, data) => {
        if (err) return console.error('Error reading bat-files.json:', err);

        try {
            const categories = JSON.parse(data);
            const categoryData = categories.find(cat => cat.category === category);
            if (!categoryData) return;

            const file = categoryData.files[index];
            document.getElementById('edit-category').value = category;
            document.getElementById('edit-name').value = file.name;
            document.getElementById('edit-path').value = file.path; // Display path
            document.getElementById('edit-icon').value = file.icon;
            document.getElementById('edit-description').value = file.description;

            new bootstrap.Modal(document.getElementById('editModal')).show();

            document.getElementById('save-changes').onclick = function () {
                file.name = document.getElementById('edit-name').value.trim();
                file.icon = document.getElementById('edit-icon').value.trim();
                file.description = document.getElementById('edit-description').value.trim();

                // Save changes back to JSON
                fs.writeFile(path.join(__dirname, 'bat-files.json'), JSON.stringify(categories, null, 2), (err) => {
                    if (err) return console.error('Error saving bat-files.json:', err);
                    loadBatFiles(selectedCategory); // Refresh UI
                    bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
                });
            };
        } catch (err) {
            console.error('Error parsing bat-files.json:', err);
        }
    });
};

window.deleteBatFile = (category, index) => {
    if (!confirm("Are you sure you want to delete this BAT file?")) return;

    fs.readFile(path.join(__dirname, 'bat-files.json'), 'utf8', (err, data) => {
        if (err) return console.error('Error reading bat-files.json:', err);

        try {
            let categories = JSON.parse(data);
            let categoryData = categories.find(cat => cat.category === category);
            if (!categoryData) return;

            // Remove the file from the category
            categoryData.files.splice(index, 1);

            // Save the updated file without deleting the category
            fs.writeFile(path.join(__dirname, 'bat-files.json'), JSON.stringify(categories, null, 2), (err) => {
                if (err) return console.error('Error saving bat-files.json:', err);

                loadBatFiles(selectedCategory); // Reload BAT files only, keep category
            });
        } catch (err) {
            console.error('Error parsing bat-files.json:', err);
        }
    });
};




// Save changes to metadata
document.getElementById('save-changes').addEventListener('click', () => {
    const name = document.getElementById('edit-name').value;
    const icon = document.getElementById('edit-icon').value;
    const description = document.getElementById('edit-description').value;

    fs.readFile(path.join(__dirname, 'bat-files.json'), 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading bat-files.json:', err);
            return;
        }
        const batFiles = JSON.parse(data);
        batFiles[currentEditIndex] = { ...batFiles[currentEditIndex], name, icon, description };
        fs.writeFile(path.join(__dirname, 'bat-files.json'), JSON.stringify(batFiles, null, 2), (err) => {
            if (err) {
                console.error('Error writing to bat-files.json:', err);
                return;
            }
            loadBatFiles();
            bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
        });
    });
});

document.getElementById('icon-picker-btn').addEventListener('click', () => {
    const iconContainer = document.getElementById('icon-picker-container');

    // Show/Hide icon picker
    if (iconContainer.classList.contains('d-none')) {
        iconContainer.classList.remove('d-none');
    } else {
        iconContainer.classList.add('d-none');
        return;
    }

    // Check if icons are already loaded
    if (iconContainer.innerHTML.trim() !== '') return;

    // FontAwesome Icons List
    const icons = [
        "fa-terminal", "fa-broom", "fa-save", "fa-network-wired", "fa-play", "fa-stop",
        "fa-cog", "fa-folder-open", "fa-file-code", "fa-tools", "fa-rocket", "fa-hdd",
        "fa-keyboard", "fa-microchip", "fa-server", "fa-cloud", "fa-database", "fa-laptop-code",
        "fa-code", "fa-bolt", "fa-power-off", "fa-wrench", "fa-file-alt", "fa-folder",
        "fa-cube", "fa-magic", "fa-bug", "fa-clock", "fa-download", "fa-upload", "fa-sync",
        "fa-clipboard", "fa-edit", "fa-exclamation-triangle", "fa-shield-alt", "fa-user-cog",
        "fa-plug", "fa-history", "fa-lightbulb", "fa-mouse-pointer", "fa-globe", "fa-magnet",
        "fa-hammer", "fa-user", "fa-mobile-alt", "fa-battery-full", "fa-memory", "fa-wifi",
        "fa-check-circle", "fa-exclamation-circle", "fa-sitemap", "fa-share-alt", "fa-expand",
        "fa-compress", "fa-rss", "fa-clipboard-list", "fa-vial", "fa-user-secret", "fa-balance-scale",
        "fa-paper-plane", "fa-certificate", "fa-list", "fa-signal", "fa-bell", "fa-hand-pointer",
        "fa-screwdriver", "fa-briefcase", "fa-map-marker-alt", "fa-key", "fa-eye", "fa-arrow-circle-right",
        "fa-chart-bar", "fa-paperclip", "fa-stopwatch", "fa-camera", "fa-globe-americas",
        "fa-cloud-upload-alt", "fa-cloud-download-alt", "fa-network-wired", "fa-code-branch"
    ];

    let html = '<div class="d-flex flex-wrap gap-2">';
    icons.forEach(icon => {
        html += `
            <button type="button" class="btn btn-light border icon-picker-btn m-1" data-icon="${icon}" style="width:50px; height:50px;">
                <i class="fas ${icon} fa-lg"></i>
            </button>
        `;
    });
    html += '</div>';
    iconContainer.innerHTML = html;

    // Event Listener for Icon Selection
    document.querySelectorAll('.icon-picker-btn').forEach(button => {
        button.addEventListener('click', function () {
            const selectedIcon = this.getAttribute('data-icon');
            document.getElementById('edit-icon').value = selectedIcon;
            iconContainer.classList.add('d-none'); // Hide picker after selection
        });
    });
});


// Save console output
document.getElementById('save-console').addEventListener('click', () => {
    const output = consoleOutput.innerText;
    ipcRenderer.send('save-console-output', output);
});

ipcRenderer.on('save-console-output-success', () => {
    alert('Console output saved successfully!');
});

ipcRenderer.on('save-console-output-error', () => {
    alert('Error saving console output.');
});

// Initial Load
loadCategories();