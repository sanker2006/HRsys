const { spawn } = require('child_process');
const https = require('https');
const http = require('http');

const cloudflared = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const ports = [
  { port: 5173, name: '管理端' },
  { port: 5174, name: 'H5端' },
];

const tunnels = [];

for (const { port, name } of ports) {
  console.log(`\n🚀 启动 ${name} 隧道 (${port})...`);
  const proc = spawn(cloudflared, ['tunnel', '--url', `http://localhost:${port}`, '--protocol', 'http2'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
  });

  proc.stdout.on('data', (data) => {
    const line = data.toString();
    process.stdout.write(`[${name}] ${line}`);
    const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !tunnels.find(t => t.port === port)) {
      tunnels.push({ port, name, url: match[0] });
      console.log(`\n✅ ${name} 公网地址: ${match[0]}\n`);
    }
  });

  proc.stderr.on('data', (data) => {
    const line = data.toString();
    if (line.includes('Error') || line.includes('ERR')) {
      process.stderr.write(`[${name} ERR] ${line}`);
    }
  });

  proc.on('close', (code) => {
    console.log(`${name} 隧道退出，code=${code}`);
  });
}

console.log('\n========================================');
console.log('  等待隧道建立...\n');

// 等待所有隧道都拿到URL
function checkDone() {
  if (tunnels.length === ports.length) {
    console.log('\n========================================');
    console.log('  所有隧道已就绪！');
    console.log('========================================\n');
    for (const t of tunnels) {
      console.log(`  ${t.name}: ${t.url}`);
    }
    console.log('\n把 H5 端地址发给员工即可访问\n');
  } else {
    setTimeout(checkDone, 2000);
  }
}
setTimeout(checkDone, 3000);
