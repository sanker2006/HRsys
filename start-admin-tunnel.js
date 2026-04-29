const { spawn } = require('child_process');

const cf = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:5173', '--protocol', 'http2'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true
});

cf.stdout.on('data', d => {
  const s = d.toString();
  process.stdout.write('[stdout] ' + s);
  const match = s.match(/https:\/\/[^\s]+trycloudflare\.com/);
  if (match) {
    console.log('\n🎉 ADMIN URL: ' + match[0]);
  }
});

cf.stderr.on('data', d => {
  const s = d.toString();
  process.stdout.write('[stderr] ' + s);
  const match = s.match(/https:\/\/[^\s]+trycloudflare\.com/);
  if (match) {
    console.log('\n🎉 ADMIN URL: ' + match[0]);
  }
});

cf.on('exit', code => {
  console.log('cloudflared exited with code', code);
});

setTimeout(() => {
  cf.unref();
  process.exit(0);
}, 30000);
