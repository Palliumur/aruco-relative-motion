import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Tracker,relativePose,difference,multiply,transform,validateCalibration,cameraParameters} from '../dist/engine.mjs';
const require=createRequire(import.meta.url);
// Wrap OpenCV so Promise resolution does not recursively assimilate its thenable.
const {cv:c}=await new Promise(resolve=>require('../dist/vendor/opencv.js').then(cv=>resolve({cv})));
const tracker=new Tracker(c),identity=[1,0,0,0,1,0,0,0,1];
const near=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected} by more than ${tolerance}`);
try {
  const a={position:[10,20,30],rotation:identity},b={position:[110,25,40],rotation:identity};
  const before=relativePose(a,b),rotation=[0,-1,0,1,0,0,0,0,1],translation=[200,50,600];
  const move=p=>({position:transform(rotation,p.position).map((v,i)=>v+translation[i]),rotation:multiply(rotation,p.rotation)});
  const after=relativePose(move(a),move(b));
  after.position.forEach((v,i)=>near(v,before.position[i]));
  near(difference(after,before).total,0);
  near(difference({...before,rotation},before).angle,90);
  near(difference({...before,position:before.position.map((v,i)=>v+[1,2,2][i])},before).total,3);
  console.log('PASS: relative pose removes common rigid motion; displacement and rotation');
  const detect=offset=>{const frame=tracker.demoFrame(960,600,offset);try {const found=tracker.detect(frame.image,40,frame.intrinsics);assert.equal(found.length,2);assert.ok(found.every(m=>m.valid));return relativePose(found.find(m=>m.id===0),found.find(m=>m.id===1));} finally {frame.image.delete();}};
  const baseline=detect([0,0,0]);near(Math.hypot(...baseline.position),120,2);
  near(difference(detect([0,0,0]),baseline).total,0);
  for(const offset of [[3,0,0],[40,0,0],[0,20,0],[0,0,20]]) {const d=difference(detect(offset),baseline).total;near(d,Math.hypot(...offset),2);console.log(`PASS: image → ArUco → solvePnP, shift ${offset} => ${d.toFixed(3)} mm (synthetic)`);}
  const blank=new c.Mat(600,960,c.CV_8UC1,new c.Scalar(255));try {assert.equal(tracker.detect(blank,40,cameraParameters(960,600)).length,0);}finally{blank.delete();}
  console.log('PASS: blank frame produces no markers');
  assert.throws(()=>validateCalibration({width:1280,height:720,fx:0,fy:100,cx:640,cy:360}));
  assert.throws(()=>validateCalibration({width:1280,height:720,fx:100,fy:100,cx:640,cy:360,distortion:[0]}));
  const cal=validateCalibration({width:1280,height:720,fx:1000,fy:1000,cx:640,cy:360});
  const scaled=cameraParameters(640,360,cal);near(scaled.matrix[0],500);near(scaled.matrix[2],320);
  console.log('PASS: calibration validation and resolution scaling');
} finally {tracker.delete();}
