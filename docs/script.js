document.addEventListener('DOMContentLoaded', () => {
  // DOM
  const entriesGrid = document.getElementById('entriesGrid');
  const searchInput = document.getElementById('searchInput');
  const categoryFilters = document.getElementById('categoryFilters');
  const statsBar = document.getElementById('statsBar');
  const totalEntries = document.getElementById('totalEntries');
  const lastUpdate = document.getElementById('lastUpdate');
  const modal = document.getElementById('entryModal');
  const modalClose = document.getElementById('modalClose');
  const modalBody = document.getElementById('modalBody');

  let wikiData = { entries: [] };
  let currentFilter = 'all';
  let searchTerm = '';

  async function loadWikiData() {
    try {
      const res = await fetch('data/wiki-data.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      wikiData = await res.json();
      initializeFilters();
      updateStats();
      renderEntries();
      updateLastSync();
    } catch (err) {
      console.error('Error loading wiki data:', err);
      // Render basic UI even on failure
      initializeFilters(); // at least 'All'
      updateStats();
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

  function initializeFilters() {
    const categories = ['all', ...new Set((wikiData.entries || []).map(e => e.category))];
    const categoryGroups = [
      ['all'],
      ['NPC','Faction','Ship','Species','Organization'],
      ['Moon','Planet','System','Station','Location'],
      ['Lore','Event','Technology','Item','Other']
    ];

    let html = '';
    categoryGroups.forEach((group, i) => {
      const groupCats = group.filter(c => categories.includes(c));
      if (groupCats.length) {
        if (i > 0) html += '<div class="filter-divider"></div>';
        groupCats.forEach(cat => {
          html += `
            <button class="filter-btn ${cat === 'all' ? 'active':''}"
                    data-category="${cat}"
                    onclick="filterByCategory('${cat}')">
              ${cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>`;
        });
      }
    });
    if (categoryFilters) categoryFilters.innerHTML = html;
  }

  function updateStats() {
    const entries = wikiData.entries || [];
    const counts = entries.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + 1;
      return acc;
    }, {});
    const catStats = Object.entries(counts).map(([c,n]) => `
      <div class="stat">
        <span class="stat-number">${n}</span>
        <span class="stat-label">${c}</span>
      </div>`).join('');
    if (statsBar) {
      statsBar.innerHTML = `
        <div class="stat">
          <span class="stat-number">${entries.length}</span>
          <span class="stat-label">Total Entries</span>
        </div>
        ${catStats}`;
    }
    if (totalEntries) totalEntries.textContent = entries.length;
  }

  function renderEntries() {
    const entries = (wikiData.entries || []).filter(e => {
      const catOK = currentFilter === 'all' || e.category === currentFilter;
      const q = (searchTerm || '').toLowerCase();
      const txtOK = !q || e.name.toLowerCase().includes(q) || (e.description||'').toLowerCase().includes(q);
      return catOK && txtOK;
    });
    if (!entriesGrid) return;
    if (!entries.length) {
      entriesGrid.innerHTML = '<div class="loading">No entries match your search.</div>';
      return;
    }
    entriesGrid.innerHTML = entries.map(entry => `
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

  function filterByCategory(category) {
    currentFilter = category;
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.category === category);
    });
    renderEntries();
  }
  window.filterByCategory = filterByCategory; // <-- needed if script is a module

  if (searchInput) {
    searchInput.addEventListener('input', e => {
      searchTerm = e.target.value;
      renderEntries();
    });
  }

  function openModal(entryId) { /* unchanged */ }
  window.openModal = openModal; // same reason as above, if needed

  function formatDate(s) { /* unchanged */ }
  function autoLinkDescription(d) { /* unchanged */ }
  function updateLastSync() { /* unchanged */ }

  // Close modal listeners with null checks
  if (modalClose && modal) {
    modalClose.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
  }

  setInterval(() => { loadWikiData(); }, 30000);

  // Theme (optional null guards)
  function switchTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wiki-theme', theme);
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  }
  window.switchTheme = switchTheme;

  const savedTheme = localStorage.getItem('wiki-theme') || 'default';
  if (savedTheme !== 'default') switchTheme(savedTheme);

  loadWikiData();
});

