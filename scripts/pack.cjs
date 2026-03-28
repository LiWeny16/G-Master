const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const packageJson = require('../package.json');

const version = packageJson.version;
const releaseDir = path.resolve(__dirname, '../release');
const distDir = path.resolve(__dirname, '../dist');
const zipFileName = `G-Master-v${version}.zip`;
const outputFilePath = path.join(releaseDir, zipFileName);

// 确保 release 目录存在
if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

// 确保 dist 目录有东西打包
if (!fs.existsSync(distDir)) {
  console.error('❌ dist 目录不存在，请先执行 pnpm build 进行构建！');
  process.exit(1);
}

const output = fs.createWriteStream(outputFilePath);
const archive = archiver('zip', {
  zlib: { level: 9 } // 最高压缩级别
});

output.on('close', function() {
  console.log(`✅ [G-Master 扩展已打包成功]`);
  console.log(`📦 文件位置: ${outputFilePath}`);
  console.log(`🗜️  文件大小: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
});

archive.on('warning', function(err) {
  if (err.code === 'ENOENT') {
    console.warn('警告:', err);
  } else {
    throw err;
  }
});

archive.on('error', function(err) {
  throw err;
});

archive.pipe(output);

// 将 dist 目录下的所有文件放入压缩包的根目录
archive.directory(distDir, false);

archive.finalize();
