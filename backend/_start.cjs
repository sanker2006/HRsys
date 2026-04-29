const { spawn } = require('child_process');
const path = require('path');

const child = spawn('npx', ['tsx', 'src/main.ts'], {
  cwd: path.join(__dirname),
  shell: true,
  stdio: ['pipe', 'pipe', 'pipe'],
  detached: true,
});

child.stdout.on('data', (d) => {
  process.stdout.write(d);
});

child.stderr.on('data', (d) => {
  process.stderr.write(d);
});

child.unref();
console.log('Server PID:', child.pid);
setTimeout(() => process.exit(0), 3000);
