// Global state
let wikiData = { entries: [] };
let currentFilter = 'all';
let searchTerm = '';

// DOM Elements
const entriesGrid = document.getElementById('entriesGrid');
const searchInput = document.getElementById('searchInput');
const categoryFilters = document.getElementById('categoryFilters');
const statsBar = document.getElementById('statsBar');
const totalEntries = document.getElementById('totalEntries');
const lastUpdate = document.getElementById('lastUpdate');
const modal = document.getElementById('entryModal');
const modalClose = document.getElementById('modalClose');
const modalBody = document.getElementById('modalBody');

// Load wiki data
async function loadWikiData() {
    try {
        // Try to load from the data folder
        const response = await fetch('data/wiki-data.json');
        if (!response.ok) throw new Error('Data not found');
        
        wikiData = await response.json();
        initializeFilters();
        updateStats();
        renderEntries();
        updateLastSync();
    } catch (error) {
        console.error('Error loading wiki data:', error);
        entriesGrid.innerHTML = `
            <div class="loading">
                No wiki entries yet! Use the Discord bot to add your first entry.<br>
                <small style="margin-top: 1rem; display: block; opacity: 0.7;">
                    Command: !wiki [content]
                </small>
            </div>
        `;
    }
}

// Initialize category filters
function initializeFilters() {
    const categories = ['all', ...new Set(wikiData.entries.map(e => e.category))];
    
    // Define category groups
    const categoryGroups = [
        ['all'],
        ['NPC', 'Faction', 'Ship', 'Species', 'Organization'],
        ['Moon', 'Planet', 'System', 'Station', 'Location'],
        ['Lore', 'Event', 'Technology', 'Item', 'Other']
    ];
    
    // Build filter HTML with dividers
    let filterHTML = '';
    categoryGroups.forEach((group, groupIndex) => {
        const groupCategories = group.filter(cat => categories.includes(cat));
        if (groupCategories.length > 0) {
            if (groupIndex > 0) {
                filterHTML += '<div class="filter-divider"></div>';
            }
            groupCategories.forEach(cat => {
                filterHTML += `
                    <button 
                        class="filter-btn ${cat === 'all' ? 'active' : ''}" 
                        data-category="${cat}"
                        onclick="filterByCategory('${cat}')"
                    >
                        ${cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </button>
                `;
            });
        }
    });
    
    categoryFilters.innerHTML = filterHTML;
}

// Update statistics
function updateStats() {
    totalEntries.textContent = wikiData.entries.length;
    
    // Add category counts
    const categories = {};
    wikiData.entries.forEach(entry => {
        categories[entry.category] = (categories[entry.category] || 0) + 1;
    });
    
    const categoryStats = Object.entries(categories)
        .map(([cat, count]) => `
            <div class="stat">
                <span class="stat-number">${count}</span>
                <span class="stat-label">${cat}</span>
            </div>
        `).join('');
    
    statsBar.innerHTML = `
        <div class="stat">
            <span class="stat-number">${wikiData.entries.length}</span>
            <span class="stat-label">Total Entries</span>
        </div>
        ${categoryStats}
    `;
}

// Render entries
function renderEntries() {
    const filteredEntries = wikiData.entries.filter(entry => {
        const matchesCategory = currentFilter === 'all' || entry.category === currentFilter;
        const matchesSearch = !searchTerm || 
            entry.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            entry.description.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    if (filteredEntries.length === 0) {
        entriesGrid.innerHTML = '<div class="loading">No entries match your search.</div>';
        return;
    }

    entriesGrid.innerHTML = filteredEntries.map(entry => `
        <div class="entry-card" onclick="openModal('${entry.id}')">
            <div class="entry-header">
                <h3 class="entry-name">${entry.name}</h3>
                <span class="entry-category">${entry.category}</span>
            </div>
            <p class="entry-description">${autoLinkDescription(entry.description)}</p>
            <div class="entry-meta">
                <span>By ${entry.createdBy || 'Unknown'}</span>
                <span>${formatDate(entry.createdAt)}</span>
            </div>
        </div>
    `).join('');
}

// Filter by category
function filterByCategory(category) {
    currentFilter = category;
    
    // Update active button
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    
    renderEntries();
}

// Search functionality
searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderEntries();
});

// Open modal with entry details
function openModal(entryId) {
    const entry = wikiData.entries.find(e => e.id === entryId);
    if (!entry) return;

    const relatedSection = entry.relatedTopics && entry.relatedTopics.length > 0 ? `
        <div class="modal-related">
            <h3>Related Topics</h3>
            <div class="related-tags">
                ${entry.relatedTopics.map(topic => `
                    <span class="related-tag">${topic}</span>
                `).join('')}
            </div>
        </div>
    ` : '';

    modalBody.innerHTML = `
        <h2 class="modal-title">${entry.name}</h2>
        <span class="modal-category">${entry.category}</span>
        <p class="modal-description">${autoLinkDescription(entry.description)}</p>
        ${relatedSection}
        <div class="modal-footer">
            <div>Added by <strong>${entry.createdBy || 'Unknown'}</strong> on ${formatDate(entry.createdAt)}</div>
            ${entry.updatedAt ? `<div>Last updated: ${formatDate(entry.updatedAt)}</div>` : ''}
        </div>
    `;

    modal.classList.add('active');
}

// Close modal
modalClose.addEventListener('click', () => {
    modal.classList.remove('active');
});

modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.classList.remove('active');
    }
});

// Utility: Format date
function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

// Utility: Auto-link existing entries in descriptions
function autoLinkDescription(description) {
    if (!description) return '';
    
    let linkedDescription = description;
    
    // Sort entries by name length (longest first) to handle overlapping names
    const sortedEntries = [...wikiData.entries].sort((a, b) => b.name.length - a.name.length);
    
    sortedEntries.forEach(entry => {
        // Create a case-insensitive regex that matches whole words
        const regex = new RegExp(`\\b(${entry.name})\\b`, 'gi');
        linkedDescription = linkedDescription.replace(regex, (match) => {
            return `<span class="wiki-link" onclick="event.stopPropagation(); openModal('${entry.id}')">${match}</span>`;
        });
    });
    
    return linkedDescription;
}

// Update last sync time
function updateLastSync() {
    const now = new Date();
    lastUpdate.textContent = now.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

// Auto-refresh every 30 seconds
setInterval(() => {
    loadWikiData();
}, 30000);

// Initialize on page load
loadWikiData();
