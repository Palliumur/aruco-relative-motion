// OpenCV marker tracking. Coordinates and lengths are in millimetres.
export const transpose = a => [a[0],a[3],a[6],a[1],a[4],a[7],a[2],a[5],a[8]];
export const multiply = (a,b) => Array.from({length:9},(_,i)=>[0,1,2].reduce((s,k)=>s+a[Math.floor(i/3)*3+k]*b[k*3+i%3],0));
export const transform = (r,p) => [0,1,2].map(i=>r[i*3]*p[0]+r[i*3+1]*p[1]+r[i*3+2]*p[2]);
export function relativePose(a,b) {
  const rt=transpose(a.rotation);
  return {position:transform(rt,b.position.map((v,i)=>v-a.position[i])),rotation:multiply(rt,b.rotation)};
}
export function difference(pose,base) {
  const xyz=pose.position.map((v,i)=>v-base.position[i]);
  const r=multiply(transpose(base.rotation),pose.rotation);
  const angle=Math.acos(Math.max(-1,Math.min(1,(r[0]+r[4]+r[8]-1)/2)))*180/Math.PI;
  return {xyz,total:Math.hypot(...xyz),angle};
}
export function cameraParameters(width,height,calibration) {
  if(calibration) {
    const sx=width/calibration.width,sy=height/calibration.height;
    return {matrix:[calibration.fx*sx,0,calibration.cx*sx,0,calibration.fy*sy,calibration.cy*sy,0,0,1],distortion:calibration.distortion};
  }
  const f=width/(2*Math.tan(60*Math.PI/360));
  return {matrix:[f,0,width/2,0,f,height/2,0,0,1],distortion:[0,0,0,0,0]};
}
export function validateCalibration(c) {
  for(const k of ['width','height','fx','fy']) if(!Number.isFinite(c[k])||c[k]<=0) throw new Error('width、height、fx、fy 必须是正数');
  for(const k of ['cx','cy']) if(!Number.isFinite(c[k])) throw new Error('缺少 cx 或 cy');
  if(c.cx<0||c.cx>c.width||c.cy<0||c.cy>c.height) throw new Error('主点坐标超出图像范围');
  const d=c.distortion??[0,0,0,0,0];
  if(!Array.isArray(d)||![4,5,8,12,14].includes(d.length)||d.some(x=>!Number.isFinite(x))) throw new Error('distortion 应为 4、5、8、12 或 14 个数值');
  return {width:c.width,height:c.height,fx:c.fx,fy:c.fy,cx:c.cx,cy:c.cy,distortion:d};
}
export class Tracker {
  constructor(cv) {
    this.cv=cv;
    this.dictionary=cv.getPredefinedDictionary(cv.DICT_4X4_50);
    const params=new cv.aruco_DetectorParameters(),refine=new cv.aruco_RefineParameters(10,3,true);
    params.cornerRefinementMethod=cv.CORNER_REFINE_SUBPIX;
    this.detector=new cv.aruco_ArucoDetector(this.dictionary,params,refine);
    params.delete();refine.delete();
  }
  marker(id,pixels=480) {
    const out=new this.cv.Mat();
    this.cv.generateImageMarker(this.dictionary,id,pixels,out,1);
    return out;
  }
  detect(rgba,length,intrinsics) {
    const cv=this.cv,gray=new cv.Mat(),corners=new cv.MatVector(),ids=new cv.Mat(),rejected=new cv.MatVector();
    const k=cv.matFromArray(3,3,cv.CV_64F,intrinsics.matrix),dist=cv.matFromArray(intrinsics.distortion.length,1,cv.CV_64F,intrinsics.distortion);
    const h=length/2,obj=cv.matFromArray(4,1,cv.CV_32FC3,[-h,h,0,h,h,0,h,-h,0,-h,-h,0]);
    const results=[];
    try {
      if(rgba.channels()===1) rgba.copyTo(gray); else cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);
      this.detector.detectMarkers(gray,corners,ids,rejected);
      for(let i=0;i<ids.rows;i++) {
        const image=corners.get(i),rvec=new cv.Mat(),tvec=new cv.Mat(),rotation=new cv.Mat(),projected=new cv.Mat();
        try {
          const points=Array.from(image.data32F),edges=[0,1,2,3].map(j=>Math.hypot(points[j*2]-points[((j+1)%4)*2],points[j*2+1]-points[((j+1)%4)*2+1]));
          // ITERATIVE avoids IPPE's degenerate exactly-front-facing solution.
          const ok=cv.solvePnP(obj,image,k,dist,rvec,tvec,false,cv.SOLVEPNP_ITERATIVE);
          if(!ok) continue;
          cv.Rodrigues(rvec,rotation);
          cv.projectPoints(obj,rvec,tvec,k,dist,projected);
          const projectedPoints=projected.data32F;
          const error=Math.sqrt(points.reduce((sum,v,j)=>sum+(v-projectedPoints[j])**2,0)/4);
          const position=Array.from(tvec.data64F),rot=Array.from(rotation.data64F);
          results.push({id:ids.data32S[i],points,position,rotation:rot,error,valid:Math.min(...edges)>=24&&position[2]>0&&error<3&&[...position,...rot,error].every(Number.isFinite)});
        } finally {image.delete();rvec.delete();tvec.delete();rotation.delete();projected.delete();}
      }
      return results;
    } finally {[gray,corners,ids,rejected,k,dist,obj].forEach(m=>m.delete());}
  }
  // Synthetic camera frames, processed by the exact same detection pipeline.
  demoFrame(width,height,offset=[0,0,0]) {
    const cv=this.cv,f=width*0.94,k=cv.matFromArray(3,3,cv.CV_64F,[f,0,width/2,0,f,height/2,0,0,1]),d=cv.Mat.zeros(5,1,cv.CV_64F);
    const out=new cv.Mat(height,width,cv.CV_8UC1,new cv.Scalar(255));
    const obj=cv.matFromArray(4,1,cv.CV_32FC3,[-20,20,0,20,20,0,20,-20,0,-20,-20,0]);
    try {
      for(const id of [0,1]) {
        const marker=this.marker(id,240),r=cv.matFromArray(3,1,cv.CV_64F,[Math.PI+0.08,0.08,0.1]),t=cv.matFromArray(3,1,cv.CV_64F,id===0?[-60,0,380]:[60+offset[0],offset[1],380+offset[2]]),points=new cv.Mat(),src=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,239,0,239,239,0,239]),warped=new cv.Mat();
        let homography;
        try {
          cv.projectPoints(obj,r,t,k,d,points);
          homography=cv.getPerspectiveTransform(src,points);
          cv.warpPerspective(marker,warped,homography,new cv.Size(width,height),cv.INTER_LINEAR,cv.BORDER_CONSTANT,new cv.Scalar(255));
          cv.bitwise_and(out,warped,out);
        } finally {[marker,r,t,points,src,warped,homography].filter(Boolean).forEach(m=>m.delete());}
      }
      return {image:out,intrinsics:{matrix:Array.from(k.data64F),distortion:[0,0,0,0,0]}};
    } catch(e) {out.delete();throw e;} finally {[k,d,obj].forEach(m=>m.delete());}
  }
  delete(){this.detector.delete();this.dictionary.delete();}
}
