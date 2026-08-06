const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const matches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
const code = matches.map(m => m.replace(/<script[^>]*>/, '').replace(/<\/script>/, '')).join('\n;\n');

// Mock DOM
global.window = global;
global.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: () => ({ style: {}, addEventListener: () => {}, setAttribute: () => {} }),
  body: { appendChild: () => {} }
};
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.location = { reload: () => {} };
global.navigator = { userAgent: 'node' };

try {
  eval(code);
  console.log('✅ BOOT SIMULATION SUCCESSFUL!');
  console.log('BUILD:', DESK_BUILD);
  console.log('Periods count:', s.periods ? s.periods.length : 0);
  if (s.periods && s.periods.length) {
    s.periods.forEach((p, idx) => {
      const ds = new Date(p.start + 'T00:00:00');
      const de = new Date(p.end + 'T00:00:00');
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      console.log(`Period ${idx}: ${p.start} (${days[ds.getDay()]}) to ${p.end} (${days[de.getDay()]}) [${p.status}]`);
    });
  }
} catch (err) {
  console.error('❌ BOOT SIMULATION ERROR:', err);
}
