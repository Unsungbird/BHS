require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

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

// Process wiki entry with ChatGPT
async function processWikiEntry(content, existingEntries) {
  const existingNames = existingEntries.map(e => e.name);
  const prompt = `You are a helpful assistant that processes TTRPG world-building information for a wiki.

Given the following information: "${content}"

Existing wiki entry names: ${JSON.stringify(existingNames)}

Please:
1. Extract the main subject/topic name
2. Categorize it (Location, NPC, Item, Lore, Event, Faction, or Other)
3. Write a clean, wiki-style description (2-4 sentences)
4. Check if this topic already exists in the wiki. If it does, indicate you're updating it.
5. IMPORTANT: Identify any mentions of existing wiki entries in your description and list them in relatedTopics. Look for exact matches (case-insensitive) of entry names that appear in the description.

Respond in JSON format:
{
  "name": "Topic Name",
  "category": "Category",
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
      return message.reply('❌ Please provide content after `!wiki`. Example: `!wiki Location Waterdeep is a bustling port city`');
    }

    try {
      // Show processing message
      const processingMsg = await message.reply('🔄 Processing wiki entry...');

      // Load existing data
      const wikiData = loadWikiData();

      // Process with ChatGPT
      const processed = await processWikiEntry(content, wikiData.entries);

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

    } catch (error) {
      console.error('Error processing wiki entry:', error);
      message.reply('❌ Sorry, there was an error processing that entry. Please try again.');
    }
  }

  // Help command
  if (message.content === '!wiki-help') {
    message.reply(`📚 **TTRPG Wiki Bot Commands**

\`!wiki [content]\` - Add or update a wiki entry
Example: \`!wiki NPC Gandor is a sketchy merchant in Waterdeep\`

\`!wiki-search [term]\` - Search for wiki entries
Example: \`!wiki-search Waterdeep\`

\`!wiki-stats\` - Show wiki statistics
\`!wiki-help\` - Show this help message`);
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
});

// Login to Discord
client.login(process.env.DISCORD_BOT_TOKEN);

