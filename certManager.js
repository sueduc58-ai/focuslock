const forge  = require('node-forge');
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const CA_NAME = 'Mission Control Focus';
let _userData = null;

function userData() {
  if (!_userData) _userData = require('electron').app.getPath('userData');
  return _userData;
}
const certFilePath = () => path.join(userData(), 'mission-ca.crt');
const keyFilePath  = () => path.join(userData(), 'mission-ca.key');

function generateAndInstall(sites) {
  console.log('인증서 생성 중...');

  // RSA 키 쌍 생성
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert  = forge.pki.createCertificate();

  cert.publicKey    = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter  = new Date();
  cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + 2);

  const attrs = [{ name: 'commonName', value: CA_NAME }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  // 차단 도메인 SAN 등록
  const altNames = sites.flatMap(s => [
    { type: 2, value: s },
    { type: 2, value: 'www.' + s },
  ]);

  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'subjectAltName', altNames },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const pemCert = forge.pki.certificateToPem(cert);
  const pemKey  = forge.pki.privateKeyToPem(keys.privateKey);

  fs.writeFileSync(certFilePath(), pemCert, 'utf8');
  fs.writeFileSync(keyFilePath(),  pemKey,  'utf8');

  // Windows 신뢰 루트 저장소에 설치
  try {
    const result = execSync(`certutil -addstore -f "ROOT" "${certFilePath()}"`, { encoding: 'utf8' });
    console.log('인증서 설치 완료:', result.trim().split('\n')[0]);
  } catch (e) {
    console.error('certutil 실패:', e.message);
  }

  return { key: pemKey, cert: pemCert };
}

function uninstall() {
  try { execSync(`certutil -delstore "ROOT" "${CA_NAME}"`, { stdio: 'ignore' }); } catch {}
  try { fs.unlinkSync(certFilePath()); } catch {}
  try { fs.unlinkSync(keyFilePath());  } catch {}
  console.log('인증서 제거 완료');
}

module.exports = { generateAndInstall, uninstall };
