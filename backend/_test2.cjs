const cp = require('child_process');
const r = cp.spawnSync('npx', ['tsx', 'src/start.ts'], {
  encoding: 'utf-8', timeout: 15000, shell: true, cwd: 'd:/HR开发/hr-360/backend'
});
console.log('STDOUT:', r.stdout || '(none)');
console.log('STDERR:', r.stderr ? r.stderr.slice(0, 800) : '(none)');
console.log('STATUS:', r.status);
