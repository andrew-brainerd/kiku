const fs = require('fs');
const path = require('path');

// Create dist directory structure
const distDir = path.join(__dirname, '..', 'dist');
const distSrcDir = path.join(distDir, 'src');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

if (!fs.existsSync(distSrcDir)) {
  fs.mkdirSync(distSrcDir, { recursive: true });
}

// Copy files
const filesToCopy = [
  { src: '../index.html', dest: 'index.html' },
  { src: '../src/main.js', dest: 'src/main.js' }
];

filesToCopy.forEach(file => {
  const srcPath = path.join(__dirname, file.src);
  const destPath = path.join(distDir, file.dest);

  fs.copyFileSync(srcPath, destPath);
  console.log(`Copied ${file.src} to dist/${file.dest}`);
});

console.log('Frontend files prepared in dist/');
