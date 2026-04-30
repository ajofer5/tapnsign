import { SignJWT, importPKCS8 } from 'jose';
import { readFileSync } from 'fs';

const privateKey = readFileSync('./AuthKey_RLA8Q86992.p8', 'utf8');
const TEAM_ID = '6H6LNY9XWU';
const KEY_ID = 'RLA8Q86992';
const CLIENT_ID = 'com.tapnsign.web'; // your Services ID

const key = await importPKCS8(privateKey, 'ES256');
const jwt = await new SignJWT({})
  .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
  .setIssuedAt()
  .setIssuer(TEAM_ID)
  .setAudience('https://appleid.apple.com')
  .setSubject(CLIENT_ID)
  .setExpirationTime('180d')
  .sign(key);

console.log(jwt);
