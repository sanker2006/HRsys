const { execSync } = require('child_process');
try {
  const r = execSync('dir /s /b "d:\\HR开发\\hr-360\\*.db"', { encoding: 'utf8', shell: true });
  console.log(r || 'No db files found');
} catch (e) {
  console.log('No db files found');
}
