const sharp = require('sharp');
const path = require('path');

// Create a simple gradient icon with "K" text
const svgImage = `
<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#grad1)" rx="200" />
  <text x="512" y="750" font-family="Arial, sans-serif" font-size="700" font-weight="bold"
        fill="white" text-anchor="middle">K</text>
</svg>
`;

const outputPath = path.join(__dirname, '..', 'app-icon.png');

sharp(Buffer.from(svgImage))
  .resize(1024, 1024)
  .png()
  .toFile(outputPath)
  .then(() => {
    console.log(`Icon created at: ${outputPath}`);
  })
  .catch(err => {
    console.error('Error creating icon:', err);
    process.exit(1);
  });
