const fs = require('fs');
const c = JSON.parse(fs.readFileSync('/data/.openclaw/openclaw.json'));
console.log('BEFORE: primary=' + c.agents.defaults.model.primary + ', fallbacks=' + JSON.stringify(c.agents.defaults.model.fallbacks) + ', models=' + JSON.stringify(c.agents.defaults.models));
c.models = c.models || {};
c.models.providers = c.models.providers || {};
c.models.providers['kimi-coding'] = { apiKey: '${KIMI_API_KEY}' };
c.agents.defaults.model.primary = 'kimi-coding/k2p5';
delete c.agents.defaults.model.fallbacks;
c.agents.defaults.models = c.agents.defaults.models || [];
if (!c.agents.defaults.models.includes('kimi-coding/k2p5')) {
    c.agents.defaults.models.push('kimi-coding/k2p5');
}
fs.writeFileSync('/data/.openclaw/openclaw.json', JSON.stringify(c, null, 2));
console.log('AFTER: primary=' + c.agents.defaults.model.primary + ', fallbacks=' + JSON.stringify(c.agents.defaults.model.fallbacks) + ', models=' + JSON.stringify(c.agents.defaults.models));
console.log('Kimi provider configured:', JSON.stringify(c.models.providers['kimi-coding']));
