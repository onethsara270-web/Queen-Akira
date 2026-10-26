const fs = require('fs');
const path = require('path');

async function loadPlugins(pluginsDir, ctx) {
  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true });
    return [];
  }

  const loaded = [];
  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });

  for (const entry of entries) {
    let entryFile = null;

    // .js file OR folder/index.js
    if (entry.isFile() && entry.name.endsWith('.js')) {
      entryFile = path.join(pluginsDir, entry.name);
    } else if (entry.isDirectory()) {
      const f = path.join(pluginsDir, entry.name, 'index.js');
      if (fs.existsSync(f)) entryFile = f;
    }

    if (!entryFile) continue;

    try {
      delete require.cache[require.resolve(entryFile)];
      const plugin = require(entryFile);
      if (!plugin || typeof plugin.init !== 'function') {
        console.warn(`⚠️  ${entry.name} — no init() function`);
        continue;
      }
      await plugin.init({ ...ctx, pluginDir: path.dirname(entryFile) });
      loaded.push(plugin.name || entry.name);
      console.log(`🔌 Loaded: ${plugin.name || entry.name} v${plugin.version || '1.0.0'}`);
    } catch (e) {
      console.error(`❌ ${entry.name} failed:`, e.message);
    }
  }

  console.log(`✅ ${loaded.length} plugin(s) active`);
  return loaded;
}

module.exports = { loadPlugins };
