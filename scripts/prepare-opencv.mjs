import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile,rename,rm} from 'node:fs/promises';

const version='4.12.0-release.1';
const expected='bd0c3e6448043de04f6a64a12cb7b759f78c3ab8f7c35c9f2e0f71c88bb17103';
const target=new URL('../dist/vendor/opencv.js',import.meta.url);
const temporary=new URL('../dist/vendor/opencv.js.download',import.meta.url);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

try {
  const existing=await readFile(target);
  if(digest(existing)!==expected)throw new Error('Existing OpenCV.js does not match the pinned checksum. Verify or remove it before retrying.');
  console.log(`OpenCV.js ${version}: checksum verified (existing file).`);
} catch(error) {
  if(error.code!=='ENOENT')throw error;
  const urls=[
    `https://cdn.jsdelivr.net/npm/@techstark/opencv-js@${version}/dist/opencv.js`,
    `https://unpkg.com/@techstark/opencv-js@${version}/dist/opencv.js`
  ];
  let bytes,lastError;
  for(const url of urls){
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw new Error(`Download failed: HTTP ${response.status}`);
      const candidate=Buffer.from(await response.arrayBuffer());
      if(digest(candidate)!==expected)throw new Error('Downloaded OpenCV.js checksum does not match the pinned version.');
      bytes=candidate;break;
    }catch(error){lastError=error;console.error(error.message);}
  }
  if(!bytes)throw lastError;
  await mkdir(new URL('../dist/vendor/',import.meta.url),{recursive:true});
  try {await writeFile(temporary,bytes);await rename(temporary,target);}
  finally {await rm(temporary,{force:true});}
  console.log(`OpenCV.js ${version}: downloaded and checksum verified.`);
}
