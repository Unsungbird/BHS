require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Initialize Discord bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Path to wiki data file
const dataPath = path.join(__dirname, '../data/wiki-data.json');

// Load existing wiki data
function loadWikiData() {
  if (fs.existsSync(dataPath)) {
    const data = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(data);
  }
  return { entries: [] };
}

// Save wiki data
function saveWikiData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// Auto-sync to GitHub
function syncToGitHub() {
  try {
    const projectRoot = path.join(__dirname, '..');
    
    // Copy data file to docs folder
    const sourceFile = path.join(projectRoot, 'data', 'wiki-data.json');
    const destFile = path.join(projectRoot, 'docs', 'data', 'wiki-data.json');
    
    // Ensure docs/data directory exists
    const docsDataDir = path.join(projectRoot, 'docs', 'data');
    if (!fs.existsSync(docsDataDir)) {
      fs.mkdirSync(docsDataDir, { recursive: true });
    }
    
    fs.copyFileSync(sourceFile, destFile);
    
    // Git commands
    const timestamp = new Date().toISOString();
    execSync('git add docs/data/wiki-data.json', { cwd: projectRoot });
    execSync(`git commit -m "Auto-update wiki entries - ${timestamp}"`, { cwd: projectRoot });
    execSync('git push', { cwd: projectRoot });
    
    console.log('✅ Wiki synced to GitHub successfully!');
    return true;
  } catch (error) {
    console.error('❌ Error syncing to GitHub:', error.message);
    return false;
  }
}

// Retroactively update related entries
function updateRelatedEntries(wikiData, newEntryName) {
  let updatesCount = 0;
  
  // Scan all existing entries
  wikiData.entries.forEach(entry => {
    if (entry.name.toLowerCase() === newEntryName.toLowerCase()) {
      return; // Skip the entry we just added
    }
    
    // Check if this entry's description mentions the new entry
    const descriptionLower = entry.description.toLowerCase();
    const newEntryLower = newEntryName.toLowerCase();
    
    // Use word boundary regex to match whole words only
    const regex = new RegExp(`\\b${newEntryLower}\\b`, 'i');
    
    if (regex.test(descriptionLower)) {
      // Initialize relatedTopics if it doesn't exist
      if (!entry.relatedTopics) {
        entry.relatedTopics = [];
      }
      
      // Add the new entry to relatedTopics if not already there
      if (!entry.relatedTopics.some(topic => topic.toLowerCase() === newEntryLower)) {
        entry.relatedTopics.push(newEntryName);
        updatesCount++;
      }
    }
  });
  
  if (updatesCount > 0) {
    saveWikiData(wikiData);
    console.log(`🔗 Updated ${updatesCount} existing entries with links to "${newEntryName}"`);
  }
  
  return updatesCount;
}

// Process wiki entry with ChatGPT
async function processWikiEntry(content, existingEntries, userCategory = null) {
  const existingNames = existingEntries.map(e => e.name);
  
  const categoryInstruction = userCategory 
    ? `The user has specified the category as: ${userCategory}. Use this category.`
    : `Categorize it as one of: Location, NPC, Item, Lore, Event, Faction, Moon, Planet, System, Station, Ship, Species, Organization, Technology, or Other`;
  
  const prompt = `You are a helpful assistant that processes TTRPG world-building information for a wiki.

Given the following information: "${content}"

Existing wiki entry names: ${JSON.stringify(existingNames)}

Please:
1. Extract the main subject/topic name
2. ${categoryInstruction}
3. Write a clean, wiki-style description (2-4 sentences)
4. Check if this topic already exists in the wiki. If it does, indicate you're updating it.
5. IMPORTANT: Identify any mentions of existing wiki entries in your description and list them in relatedTopics. Look for exact matches (case-insensitive) of entry names that appear in the description.

Respond in JSON format:
{
  "name": "Topic Name",
  "category": "${userCategory || 'Category'}",
  "description": "Clean description here",
  "isUpdate": false,
  "relatedTopics": ["ExistingEntry1", "ExistingEntry2"]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content);
}

// Bot ready event
client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  console.log(`📚 Wiki bot is ready to process entries!`);
});

// Message handler
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Check for !wiki command
  if (message.content.startsWith('!wiki ')) {
    const content = message.content.slice(6).trim();

    if (!content) {
      return message.reply('❌ Please provide content after `!wiki`.\n\n**Format:** `!wiki [Category] [Name] [Description]`\n**Example:** `!wiki Moon Heliograss A habitable moon with bioluminescent forests`\n\nOr use old format: `!wiki [any content]` and AI will categorize it.');
    }

    try {
      // Show processing message
      const processingMsg = await message.reply('🔄 Processing wiki entry...');

      // Load existing data
      const wikiData = loadWikiData();

      // Parse the command - check if first word is a category
      const parts = content.split(' ');
      let userCategory = null;
      let restOfContent = content;
      
      // List of valid categories
      const validCategories = ['Location', 'NPC', 'Item', 'Lore', 'Event', 'Faction', 'Moon', 'Planet', 'System', 'Station', 'Ship', 'Species', 'Organization', 'Technology', 'Other'];
      
      // Check if first word matches a category (case-insensitive)
      if (parts.length > 1) {
        const potentialCategory = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
        if (validCategories.includes(potentialCategory)) {
          userCategory = potentialCategory;
          restOfContent = parts.slice(1).join(' ');
        }
      }

      // Process with ChatGPT
      const processed = await processWikiEntry(restOfContent, wikiData.entries, userCategory);

      // Check if entry exists
      const existingIndex = wikiData.entries.findIndex(
        entry => entry.name.toLowerCase() === processed.name.toLowerCase()
      );

      if (existingIndex !== -1) {
        // Update existing entry
        wikiData.entries[existingIndex] = {
          ...processed,
          updatedAt: new Date().toISOString(),
          updatedBy: message.author.username,
        };
        await processingMsg.edit(`✅ Updated **${processed.name}** in category **${processed.category}**!\n\n*"${processed.description}"*`);
      } else {
        // Add new entry
        wikiData.entries.push({
          ...processed,
          id: Date.now().toString(),
          createdAt: new Date().toISOString(),
          createdBy: message.author.username,
        });
        await processingMsg.edit(`✅ Added **${processed.name}** to the wiki under **${processed.category}**!\n\n*"${processed.description}"*`);
      }

      // Save data
      saveWikiData(wikiData);

      // Retroactively update related entries
      updateRelatedEntries(wikiData, processed.name);

      // Auto-sync to GitHub
      const synced = syncToGitHub();
      if (synced) {
        await processingMsg.edit(processingMsg.content + '\n\n🔄 *Synced to website!*');
      }

    } catch (error) {
      console.error('Error processing wiki entry:', error);
      message.reply('❌ Sorry, there was an error processing that entry. Please try again.');
    }
  }

  // Help command
  if (message.content === '!wiki-help') {
    message.reply(`📚 **TTRPG Wiki Bot Commands**

\`!wiki [Category] [Name] [Description]\` - Add entry with specific category
Example: \`!wiki Moon Heliograss A habitable moon with forests\`

\`!wiki [content]\` - Add entry (AI chooses category)
Example: \`!wiki Gandor is a sketchy merchant\`

\`!wiki-edit [Name] [New Description]\` - Edit an existing entry
Example: \`!wiki-edit Earth A beautiful blue planet\`
**For multi-word names:** \`!wiki-edit "Commander Gize" New description here\`

\`!wiki-delete [Name]\` - Delete an entry
Example: \`!wiki-delete OldPlanet\`
**For multi-word names:** \`!wiki-delete "Commander Gize Zapico"\`

\`!wiki-search [term]\` - Search for wiki entries
\`!wiki-stats\` - Show wiki statistics
\`!wiki-help\` - Show this help message

**Valid Categories:**
Location, NPC, Item, Lore, Event, Faction, Moon, Planet, System, Station, Ship, Species, Organization, Technology, Other`);
  }

  // Stats command
  if (message.content === '!wiki-stats') {
    const wikiData = loadWikiData();
    const categories = {};
    
    wikiData.entries.forEach(entry => {
      categories[entry.category] = (categories[entry.category] || 0) + 1;
    });

    const statsText = Object.entries(categories)
      .map(([cat, count]) => `${cat}: ${count}`)
      .join('\n');

    message.reply(`📊 **Wiki Statistics**

Total Entries: ${wikiData.entries.length}

${statsText || 'No entries yet!'}`);
  }

  // Search/lookup command
  if (message.content.startsWith('!wiki-search ')) {
    const searchTerm = message.content.slice(13).trim().toLowerCase();
    
    if (!searchTerm) {
      return message.reply('❌ Please provide a search term. Example: `!wiki-search Waterdeep`');
    }

    const wikiData = loadWikiData();
    const results = wikiData.entries.filter(entry => 
      entry.name.toLowerCase().includes(searchTerm) ||
      entry.description.toLowerCase().includes(searchTerm)
    );

    if (results.length === 0) {
      return message.reply(`❌ No entries found for "${searchTerm}"`);
    }

    if (results.length === 1) {
      const entry = results[0];
      const related = entry.relatedTopics?.length > 0 
        ? `\n\n**Related:** ${entry.relatedTopics.join(', ')}`
        : '';
      
      message.reply(`📖 **${entry.name}** (${entry.category})

${entry.description}

*Added by ${entry.createdBy || 'Unknown'} on ${new Date(entry.createdAt).toLocaleDateString()}*${related}`);
    } else {
      const resultsList = results.slice(0, 5).map(entry => 
        `• **${entry.name}** (${entry.category})`
      ).join('\n');
      
      const more = results.length > 5 ? `\n\n*...and ${results.length - 5} more*` : '';
      
      message.reply(`🔍 Found ${results.length} results for "${searchTerm}":

${resultsList}${more}

Use \`!wiki-search [exact name]\` to see details.`);
    }
  }

  // Delete command
  if (message.content.startsWith('!wiki-delete ')) {
    const entryName = message.content.slice(13).trim();
    
    if (!entryName) {
      return message.reply('❌ Please provide an entry name.\n\n**Format:** `!wiki-delete [Name]`\n**Example:** `!wiki-delete Waterdeep`\n**For multi-word names:** `!wiki-delete "Commander Gize Zapico"`');
    }

    // Remove quotes if present
    const cleanName = entryName.replace(/^["']|["']$/g, '');

    const wikiData = loadWikiData();
    const entryIndex = wikiData.entries.findIndex(
      entry => entry.name.toLowerCase() === cleanName.toLowerCase()
    );

    if (entryIndex === -1) {
      return message.reply(`❌ Entry "${cleanName}" not found.`);
    }

    const deletedEntry = wikiData.entries[entryIndex];
    wikiData.entries.splice(entryIndex, 1);
    saveWikiData(wikiData);

    // Sync to GitHub
    const synced = syncToGitHub();
    const syncMsg = synced ? '\n🔄 *Synced to website!*' : '';

    message.reply(`🗑️ Deleted **${deletedEntry.name}** (${deletedEntry.category})${syncMsg}`);
  }

  // Edit command
  if (message.content.startsWith('!wiki-edit ')) {
    const content = message.content.slice(11).trim();
    
    // Check if content starts with a quote (for multi-word names)
    let entryName, newDescription;
    
    if (content.startsWith('"') || content.startsWith("'")) {
      // Extract quoted name
      const quoteChar = content[0];
      const endQuoteIndex = content.indexOf(quoteChar, 1);
      
      if (endQuoteIndex === -1) {
        return message.reply('❌ Missing closing quote.\n\n**Format:** `!wiki-edit "[Name]" [New Description]`\n**Example:** `!wiki-edit "Commander Gize" A skilled military officer`');
      }
      
      entryName = content.slice(1, endQuoteIndex).trim();
      newDescription = content.slice(endQuoteIndex + 1).trim();
    } else {
      // Original parsing (first space separates name from description)
      const firstSpaceIndex = content.indexOf(' ');
      if (firstSpaceIndex === -1) {
        return message.reply('❌ Please provide both name and new description.\n\n**Format:** `!wiki-edit [Name] [New Description]`\n**For multi-word names:** `!wiki-edit "Commander Gize Zapico" [New Description]`\n**Example:** `!wiki-edit Earth A beautiful blue planet with diverse ecosystems`');
      }

      entryName = content.slice(0, firstSpaceIndex).trim();
      newDescription = content.slice(firstSpaceIndex + 1).trim();
    }

    if (!newDescription) {
      return message.reply('❌ Please provide a new description.');
    }

    const wikiData = loadWikiData();
    const entryIndex = wikiData.entries.findIndex(
      entry => entry.name.toLowerCase() === entryName.toLowerCase()
    );

    if (entryIndex === -1) {
      return message.reply(`❌ Entry "${entryName}" not found. Use \`!wiki-search ${entryName}\` to find similar entries.`);
    }

    try {
      const processingMsg = await message.reply('🔄 Processing edit...');
      
      // Use AI to clean up the new description and maintain style
      const processed = await processWikiEntry(
        `${entryName}: ${newDescription}`,
        wikiData.entries.filter((_, i) => i !== entryIndex),
        wikiData.entries[entryIndex].category
      );

      // Update the entry
      wikiData.entries[entryIndex] = {
        ...wikiData.entries[entryIndex],
        description: processed.description,
        relatedTopics: processed.relatedTopics || wikiData.entries[entryIndex].relatedTopics,
        updatedAt: new Date().toISOString(),
        updatedBy: message.author.username,
      };

      saveWikiData(wikiData);

      // Retroactively update related entries
      updateRelatedEntries(wikiData, wikiData.entries[entryIndex].name);

      // Sync to GitHub
      const synced = syncToGitHub();
      const syncMsg = synced ? '\n\n🔄 *Synced to website!*' : '';

      await processingMsg.edit(`✅ Updated **${wikiData.entries[entryIndex].name}**!\n\n*"${wikiData.entries[entryIndex].description}"*${syncMsg}`);

    } catch (error) {
      console.error('Error editing entry:', error);
      message.reply('❌ Sorry, there was an error editing that entry. Please try again.');
    }
  }
});

// Login to Discord
client.login(process.env.DISCORD_BOT_TOKEN);
