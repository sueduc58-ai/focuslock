const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// SVG를 HTML Canvas로 렌더링해서 PNG 생성하는 방식 대신
// sharp 없이 순수 Node로 간단한 PNG 헤더 생성은 불가 —
// electron-builder는 SVG도 직접 지원하므로 SVG를 그대로 사용
// 단, Windows ICO는 별도 필요 → png2ico 사용

console.log('아이콘 변환 중...');
try {
  execSync('npm install --save-dev png2icons', { stdio: 'inherit', cwd: __dirname });
} catch {}

const png2icons = require('png2icons');
const svgPath = path.join(__dirname, 'assets', 'icon.svg');
const icoPath = path.join(__dirname, 'assets', 'icon.ico');

// SVG → PNG (Node canvas 없이는 직접 변환 불가, sharp 사용)
console.log('sharp 설치 중...');
try {
  execSync('npm install --save-dev sharp', { stdio: 'inherit', cwd: __dirname });
} catch (e) {
  console.error('sharp 설치 실패:', e.message);
  process.exit(1);
}

const sharp = require('sharp');

async function run() {
  const sizes = [16, 32, 48, 64, 128, 256];
  for (const size of sizes) {
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(path.join(__dirname, 'assets', `icon${size}.png`));
    console.log(`✓ icon${size}.png`);
  }

  // 256px PNG → ICO
  const pngBuf = fs.readFileSync(path.join(__dirname, 'assets', 'icon256.png'));
  const icoBuf = png2icons.createICO(pngBuf, png2icons.BILINEAR, 0, true);
  fs.writeFileSync(icoPath, icoBuf);
  console.log('✓ icon.ico');
  console.log('완료!');
}

run().catch(console.error);
