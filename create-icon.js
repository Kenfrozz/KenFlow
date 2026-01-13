const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

async function createIcon() {
  try {
    const inputPath = path.join(__dirname, 'build', 'icon.png');
    const outputPath = path.join(__dirname, 'build', 'icon.ico');

    console.log('Creating Windows icon from PNG...');
    console.log('Input:', inputPath);
    console.log('Output:', outputPath);

    // Create ico with multiple sizes (16, 32, 48, 256)
    const buf = await pngToIco.default(inputPath);
    fs.writeFileSync(outputPath, buf);

    console.log('✓ Icon created successfully!');
    console.log('File size:', (buf.length / 1024).toFixed(2), 'KB');
  } catch (err) {
    console.error('Error creating icon:', err);
    process.exit(1);
  }
}

createIcon();
