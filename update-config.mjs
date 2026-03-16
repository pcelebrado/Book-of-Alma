const fs = require('fs');

// Read the current config
const configPath = process.argv[2] || '/data/.openclaw/openclaw.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log('=== BEFORE CHANGES ===');
console.log('Primary model:', config.agents?.defaults?.model?.primary);
console.log('Fallbacks:', JSON.stringify(config.agents?.defaults?.model?.fallbacks));
console.log('Models list:', JSON.stringify(config.agents?.defaults?.models));
console.log('Has models.providers:', !!config.models?.providers);

// 1. Add models.providers.kimi-coding if not exists
if (!config.models) {
  config.models = {};
}
if (!config.models.providers) {
  config.models.providers = {};
}

// Check if kimi-coding already has an API key configured
const existingKimiKey = config.models.providers['kimi-coding']?.apiKey;
if (existingKimiKey) {
  console.log('Reusing existing Kimi API key:', existingKimiKey.substring(0, 10) + '...');
} else {
  // Set up the Kimi Coding provider with the API key
  config.models.providers['kimi-coding'] = {
    apiKey: '${KIMI_API_KEY}'
  };
  console.log('Added Kimi Coding provider with KIMI_API_KEY env var');
}

// 2. Set primary model
const oldPrimary = config.agents.defaults.model.primary;
config.agents.defaults.model.primary = 'kimi-coding/k2p5';
console.log(`Changed primary: ${oldPrimary} -> ${config.agents.defaults.model.primary}`);

// 3. Remove fallbacks if they exist
if (config.agents.defaults.model.fallbacks !== undefined) {
  delete config.agents.defaults.model.fallbacks;
  console.log('Removed fallbacks from agents.defaults.model');
} else {
  console.log('No fallbacks to remove (already clean)');
}

// 4. Ensure agents.defaults.models includes kimi-coding/k2p5
if (!config.agents.defaults.models) {
  config.agents.defaults.models = [];
}
if (!config.agents.defaults.models.includes('kimi-coding/k2p5')) {
  config.agents.defaults.models.push('kimi-coding/k2p5');
  console.log('Added kimi-coding/k2p5 to agents.defaults.models');
} else {
  console.log('kimi-coding/k2p5 already in models list');
}

console.log('\n=== AFTER CHANGES ===');
console.log('Primary model:', config.agents?.defaults?.model?.primary);
console.log('Fallbacks:', JSON.stringify(config.agents?.defaults?.model?.fallbacks));
console.log('Models list:', JSON.stringify(config.agents?.defaults?.models));
console.log('Kimi provider:', JSON.stringify(config.models.providers['kimi-coding']));

// Write the updated config
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
console.log('\nConfig written to:', configPath);
