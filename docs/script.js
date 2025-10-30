// Global state
let wikiData = { entries: [] };
let currentFilter = 'all';
let searchTerm = '';
let lastVisitTime = null;

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
        // Get last read time from localStorage
        lastVisitTime = localStorage.getItem('wiki-last-read');
        console.log('Last read time:', lastVisitTime);
        
        // Try to load from the data folder
        const response = await fetch('data/wiki-data.json');
        if (!response.ok) throw new Error('Data not found');
        
        wikiData = await response.json();
        console.log('Loaded entries:', wikiData.entries.length);
        
        // Log all entry dates for debugging
        wikiData.entries.forEach(entry => {
            console.log(`Entry: ${entry.name}, Created: ${entry.createdAt}, Updated: ${entry.updatedAt || 'none'}`);
        });
        
        initializeFilters();
        updateStats();
        renderEntries();
        updateLastSync();
        
        // Show "Mark as Read" button if there are new entries
        const newCount = countNewEntries();
        const markReadContainer = document.getElementById('markAsReadContainer');
        if (newCount > 0) {
            markReadContainer.style.display = 'block';
        } else {
            markReadContainer.style.display = 'none';
        }
        
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

// Mark all entries as read
function markAllAsRead() {
    const now = new Date().toISOString();
    localStorage.setItem('wiki-last-read', now);
    console.log('Marked all as read at:', now);
    
    // Reload to update UI
    location.reload();
}

// Clear read status (for testing)
function clearReadStatus() {
    localStorage.removeItem('wiki-last-read');
    console.log('Cleared read status');
    location.reload();
}

// Initialize category filters
function initializeFilters() {
    const categories = ['all', ...new Set(wikiData.entries.map(e => e.category))];
    
    // Count new entries
    const newCount = countNewEntries();
    
    // Define category groups - add 'new' at the beginning
    const categoryGroups = [
        newCount > 0 ? ['new', 'all'] : ['all'],
        ['NPC', 'Faction', 'Ship', 'Species', 'Organization'],
        ['Moon', 'Planet', 'System', 'Station', 'Location'],
        ['Lore', 'Event', 'Technology', 'Item', 'Other']
    ];
    
    // Build filter HTML with dividers
    let filterHTML = '';
    categoryGroups.forEach((group, groupIndex) => {
        const groupCategories = group.filter(cat => cat === 'new' || cat === 'all' || categories.includes(cat));
        if (groupCategories.length > 0) {
            if (groupIndex > 0) {
                filterHTML += '<div class="filter-divider"></div>';
            }
            groupCategories.forEach(cat => {
                const displayName = cat === 'new' 
                    ? `New (${newCount})` 
                    : cat.charAt(0).toUpperCase() + cat.slice(1);
                    
                filterHTML += `
                    <button 
                        class="filter-btn ${cat === 'all' ? 'active' : ''} ${cat === 'new' ? 'new-filter' : ''}" 
                        data-category="${cat}"
                        onclick="filterByCategory('${cat}')"
                    >
                        ${displayName}
                    </button>
                `;
            });
        }
    });
    
    categoryFilters.innerHTML = filterHTML;
}

// Count new entries since last visit
function countNewEntries() {
    if (!lastVisitTime) {
        console.log('No last visit time, returning 0');
        return 0;
    }
    
    const lastVisit = new Date(lastVisitTime);
    console.log('Last visit as Date object:', lastVisit);
    console.log('Last visit timestamp:', lastVisit.getTime());
    
    const count = wikiData.entries.filter(entry => {
        const entryDate = new Date(entry.updatedAt || entry.createdAt);
        const isNew = entryDate > lastVisit;
        
        console.log(`Entry "${entry.name}":`, {
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
            entryDate: entryDate.toISOString(),
            entryTimestamp: entryDate.getTime(),
            lastVisitTimestamp: lastVisit.getTime(),
            isNew: isNew,
            comparison: `${entryDate.getTime()} > ${lastVisit.getTime()} = ${isNew}`
        });
        
        return isNew;
    }).length;
    
    console.log('New entries count:', count);
    return count;
}

// Check if entry is new
function isNewEntry(entry) {
    if (!lastVisitTime) return false;
    const entryDate = new Date(entry.updatedAt || entry.createdAt);
    const lastVisit = new Date(lastVisitTime);
    return entryDate > lastVisit;
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
        const matchesCategory = currentFilter === 'all' 
            || currentFilter === 'new' && isNewEntry(entry)
            || entry.category === currentFilter;
        const matchesSearch = !searchTerm || 
            entry.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            entry.description.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    if (filteredEntries.length === 0) {
        const message = currentFilter === 'new' 
            ? 'No new entries since your last visit!' 
            : 'No entries match your search.';
        entriesGrid.innerHTML = `<div class="loading">${message}</div>`;
        return;
    }

    entriesGrid.innerHTML = filteredEntries.map(entry => {
        const isNew = isNewEntry(entry);
        const newBadge = isNew ? '<span class="new-badge">NEW</span>' : '';
        
        return `
        <div class="entry-card ${isNew ? 'new-entry' : ''}" onclick="openModal('${entry.id}')">
            <div class="entry-header">
                <h3 class="entry-name">${entry.name}${newBadge}</h3>
                <span class="entry-category">${entry.category}</span>
            </div>
            <p class="entry-description">${autoLinkDescription(entry.description)}</p>
            <div class="entry-meta">
                <span>By ${entry.createdBy || 'Unknown'}</span>
                <span>${formatDate(entry.createdAt)}</span>
            </div>
        </div>
    `}).join('');
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

// Theme switching
function switchTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wiki-theme', theme);
    
    // Update active button
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
}

// Load saved theme
const savedTheme = localStorage.getItem('wiki-theme') || 'default';
if (savedTheme !== 'default') {
    switchTheme(savedTheme);
}

// Initialize on page load
loadWikiData();
