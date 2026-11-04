import {Tracker,relativePose,difference,cameraParameters,validateCalibration} from './engine.mjs';

const $=id=>document.getElementById(id);
const display=$('camera-canvas'),ctx=display.getContext('2d'),video=$('video');
const capture=document.createElement('canvas'),captureCtx=capture.getContext('2d',{willReadFrequently:true});
const state={cv:null,tracker:null,mode:'idle',stream:null,current:null,base:null,history:[],recording:[],start:0,lastFrame:0,length:40,calibration:null,frameNumber:0,errorCount:0,offset:[0,0,0],markerSVGs:[],cameraId:'',starting:false,sourceToken:0,mirror:true};
let toastTimer;
const number=n=>Math.abs(n)<.05?'0.0':n.toFixed(1);
const signed=n=>(n>.05?'+':'')+number(n);
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function message(text){$('tracking-message').textContent=text;}
function clearValues(){['displacement','dx','dy','dz','pos-x','pos-y','pos-z','distance'].forEach(id=>$(id).textContent='—');$('angle-change').textContent='旋转 —';}
function clearBaseline(announce=false){state.base=null;state.history=[];state.recording=[];state.start=0;$('clear-btn').disabled=true;$('export-btn').disabled=true;$('baseline-status').textContent='尚未设置基准';$('history-peak').textContent='峰值 —';$('chart-empty').hidden=false;$('displacement').textContent='—';['dx','dy','dz'].forEach(id=>$(id).textContent='—');$('angle-change').textContent='旋转 —';drawChart();if(announce)toast('已清除基准与记录');}
function updateCalibrationLabel(){const demo=state.mode==='demo',cal=!!state.calibration;$('calibration-badge').textContent=demo?'示例相机':cal?'已导入标定':'参数估算';$('accuracy-note').textContent=demo?'示例画面 · 非实物测量。':cal?'已使用标定参数，精度仍需实物验证。':'未标定，毫米值为估算。';$('calibration-status').textContent=cal?'已导入':'未导入';$('remove-calibration').disabled=!cal;$('marker-size').disabled=demo;}
function setSource(mode){state.mode=mode;state.current=null;state.lastFrame=0;state.errorCount=0;clearBaseline();clearValues();$('empty-view').hidden=mode!=='idle';$('demo-controls').hidden=mode!=='demo';$('stop-btn').hidden=mode==='idle';$('fps').hidden=mode==='idle';$('source-badge').textContent=mode==='demo'?'示例 · OpenCV 实时检测':mode==='camera'?'实时摄像头':'摄像头未启动';$('camera-btn').textContent=mode==='camera'?'切换摄像头 ↗':'启动摄像头 ↗';$('baseline-btn').disabled=true;$('tracking-badge').textContent=mode==='idle'?'未连接':'等待标记';$('tracking-badge').classList.remove('tracking');if(mode==='idle')$('frame-size').textContent='—';updateCalibrationLabel();}
function stopTracks(){if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null;}video.srcObject=null;}
function stop(){state.sourceToken++;stopTracks();state.starting=false;setSource('idle');markStatus([]);message('摄像头已停止');}
function markStatus(detected){for(const [name,id]of[['a',0],['b',1]]){$('state-'+name).classList.toggle('active',detected.some(m=>m.id===id&&m.valid));}}
async function refreshCameras(){try{const devices=await navigator.mediaDevices.enumerateDevices();const select=$('camera-select'),previous=select.value||state.cameraId;select.replaceChildren(new Option('默认摄像头',''));devices.filter(d=>d.kind==='videoinput').forEach((d,i)=>select.add(new Option(d.label||`摄像头 ${i+1}`,d.deviceId)));select.value=previous;}catch{}}
async function startCamera(){
  if(state.starting)return;
  if(!navigator.mediaDevices?.getUserMedia){toast('此浏览器无法使用摄像头，请在 HTTPS 或 localhost 中打开');return;}
  const token=++state.sourceToken;state.starting=true;stopTracks();setSource('idle');message('等待摄像头授权…');
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{...(state.cameraId?{deviceId:{exact:state.cameraId}}:{facingMode:'environment'}),width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}}});
    if(token!==state.sourceToken){stream.getTracks().forEach(t=>t.stop());return;}
    state.stream=stream;video.srcObject=stream;await video.play();
    if(token!==state.sourceToken)return;
    setSource('camera');message('将 A、B 两个标记放入画面');
    stream.getVideoTracks()[0].addEventListener('ended',()=>{if(state.mode==='camera'&&state.stream===stream){stop();message('摄像头连接已中断');}});
    await refreshCameras();
  }catch(e){if(token!==state.sourceToken)return;stopTracks();setSource('idle');const texts={NotAllowedError:'摄像头权限被拒绝，请在浏览器设置中允许访问',NotFoundError:'未找到摄像头，请连接后重试',NotReadableError:'摄像头被占用，请关闭其他使用摄像头的应用',OverconstrainedError:'所选摄像头不可用，请重新选择'};message(texts[e.name]||'无法启动摄像头，请重试');toast(texts[e.name]||e.message);}
  finally{if(token===state.sourceToken)state.starting=false;}
}
function startDemo(){state.sourceToken++;state.starting=false;stopTracks();state.offset=[0,0,0];['x','y','z'].forEach(axis=>{$('demo-'+axis).value=0;$('demo-'+axis+'-out').value='0';});setSource('demo');message('拖动画面中的 B，或调整下方滑杆');}
function updateMirrorButton(){const button=$('mirror-btn');button.setAttribute('aria-pressed',String(state.mirror));button.textContent=`镜像 · ${state.mirror?'开':'关'}`;}
function drawPreview(source){
  // Only the presentation canvas is mirrored. Detection always reads the original pixels.
  ctx.save();
  if(state.mirror){ctx.translate(display.width,0);ctx.scale(-1,1);}
  ctx.drawImage(source,0,0);
  ctx.restore();
}
function renderOverlay(markers){
  // Mirror a copy of the overlay coordinates, leaving detection and pose data intact.
  const shown=markers.map(m=>({...m,points:m.points.map((value,i)=>state.mirror&&i%2===0?display.width-value:value)}));
  const scale=display.width/960;
  ctx.lineWidth=Math.max(1.5,2*scale);ctx.font=`500 ${Math.max(12,14*scale)}px sans-serif`;
  for(const m of shown.filter(m=>m.id===0||m.id===1)){
    ctx.strokeStyle=m.valid?(m.id===0?'#446f58':'#50788b'):'#b98a49';ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();m.points.forEach((_,i)=>{if(i%2)return;const x=m.points[i],y=m.points[i+1];if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.closePath();ctx.stroke();
    for(let i=0;i<8;i+=2){ctx.fillRect(m.points[i]-2,m.points[i+1]-2,4,4);}
    const label=m.id===0?'A · ID 0':'B · ID 1',x=Math.min(...m.points.filter((_,i)=>i%2===0)),y=Math.min(...m.points.filter((_,i)=>i%2===1))-10;
    ctx.fillText(label,Math.max(5,Math.min(display.width-ctx.measureText(label).width-5,x)),Math.max(20,y));
  }
  const a=shown.find(x=>x.id===0&&x.valid),b=shown.find(x=>x.id===1&&x.valid);
  if(a&&b){const center=m=>[m.points.filter((_,i)=>i%2===0).reduce((s,v)=>s+v,0)/4,m.points.filter((_,i)=>i%2===1).reduce((s,v)=>s+v,0)/4],p=center(a),q=center(b);ctx.save();ctx.strokeStyle='#698678';ctx.setLineDash([5,5]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();ctx.restore();}
  if(state.mode==='demo'){ctx.fillStyle='#8b9590';ctx.font='12px sans-serif';ctx.fillText('拖动 B',display.width*(state.mirror?.31:.64),display.height*.68);}
}
function updateMeasurement(markers,now){
  markStatus(markers);const as=markers.filter(x=>x.id===0),bs=markers.filter(x=>x.id===1),a=as[0],b=bs[0];
  const valid=as.length===1&&bs.length===1&&a.valid&&b.valid;
  $('tracking-badge').classList.toggle('tracking',!!valid);$('tracking-badge').textContent=valid?'跟踪中':state.mode==='idle'?'未连接':'等待标记';$('baseline-btn').disabled=!valid;
  if(!valid){state.current=null;clearValues();if(state.mode!=='idle'){message(as.length>1||bs.length>1?'发现重复 ID，请每种标记只保留一张':a&&b?'标记过小或姿态不可靠，请靠近并调整角度':!a&&!b?'未识别到 A、B 标记':!a?'未识别到 A · 基准':'未识别到 B · 目标');if(state.base)record(now,null,null); }return;}
  const pose=relativePose(a,b);state.current={...pose,time:now};['x','y','z'].forEach((axis,i)=>$('pos-'+axis).textContent=number(pose.position[i]));$('distance').textContent=number(Math.hypot(...pose.position));
  const errs=Math.max(a.error,b.error);message(state.mode==='demo'?'拖动画面中的 B，或调整下方滑杆':`A、B 已识别 · 重投影误差 ${errs.toFixed(2)} px`);
  if(state.base){const delta=difference(pose,state.base);$('displacement').textContent=number(delta.total);['dx','dy','dz'].forEach((id,i)=>$(id).textContent=signed(delta.xyz[i]));$('angle-change').textContent=`旋转 ${number(delta.angle)}°`;record(now,pose,delta);}
}
function record(now,pose,delta){
  if(now-(state.history.at(-1)?.time??0)<95)return;
  state.history.push({time:now,value:delta?.total??null});state.history=state.history.filter(p=>now-p.time<=30000);
  const row={time:(now-state.start)/1000,mode:state.mode,calibrated:state.mode==='demo'||!!state.calibration,valid:!!pose,length:state.mode==='demo'?40:state.length,pose,delta};state.recording.push(row);
  if(state.recording.length>36000)state.recording.shift();
  $('export-btn').disabled=!state.recording.length;drawChart();
}
function drawChart(){
  const canvas=$('history-chart'),rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;if(!rect.width)return;canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);const c=canvas.getContext('2d');c.scale(dpr,dpr);const w=rect.width,h=rect.height,pad=15;
  c.strokeStyle='#dce1dd';c.lineWidth=1;for(const y of[pad,h/2,h-pad]){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
  const points=state.history,values=points.filter(p=>p.value!==null);if(!values.length)return;
  $('chart-empty').hidden=true;const max=Math.max(3,...values.map(p=>p.value))*1.2,now=performance.now();let continuous=false;
  c.strokeStyle='#597866';c.lineWidth=1.6;c.beginPath();for(const p of points){if(p.value===null){continuous=false;continue;}const x=w-(now-p.time)/30000*w,y=h-pad-p.value/max*(h-2*pad);if(continuous)c.lineTo(x,y);else c.moveTo(x,y);continuous=true;}c.stroke();
  c.fillStyle='#8e9991';c.font='9px monospace';c.textAlign='right';c.fillText(`${max.toFixed(1)} mm`,w-2,10);
  const all=state.recording.filter(p=>p.delta);$('history-peak').textContent=`峰值 ${number(Math.max(0,...all.map(p=>p.delta.total)))} mm`;
}
function frame(now){
  requestAnimationFrame(frame);if(!state.tracker||state.mode==='idle'||now-state.lastFrame<80)return;
  const interval=now-state.lastFrame;state.lastFrame=now;let mat=null;
  try{
    let intrinsics;
    if(state.mode==='demo'){const demo=state.tracker.demoFrame(960,600,state.offset);mat=demo.image;intrinsics=demo.intrinsics;display.width=960;display.height=600;state.cv.imshow(capture,mat);drawPreview(capture);}
    else{
      if(video.readyState<2||!video.videoWidth)return;
      const width=Math.min(1280,video.videoWidth),height=Math.round(width*video.videoHeight/video.videoWidth);
      capture.width=width;capture.height=height;captureCtx.drawImage(video,0,0,width,height);mat=state.cv.matFromImageData(captureCtx.getImageData(0,0,width,height));intrinsics=cameraParameters(width,height,state.calibration);
      display.width=width;display.height=height;drawPreview(capture);
      if(state.calibration&&Math.abs((width/height)/(state.calibration.width/state.calibration.height)-1)>.02){state.current=null;$('baseline-btn').disabled=true;clearValues();markStatus([]);$('tracking-badge').textContent='标定不匹配';$('tracking-badge').classList.remove('tracking');message('标定分辨率比例与当前画面不一致，请重新导入');if(state.base)record(now,null,null);return;}
    }
    const detected=state.tracker.detect(mat,state.mode==='demo'?40:state.length,intrinsics);renderOverlay(detected);updateMeasurement(detected,now);state.errorCount=0;
    $('fps').textContent=`${Math.min(99,Math.round(1000/interval))} FPS`;$('frame-size').textContent=`${display.width} × ${display.height}`;
  }catch(e){console.error('OpenCV frame:',e);state.current=null;clearValues();markStatus([]);$('baseline-btn').disabled=true;$('tracking-badge').textContent='检测异常';$('tracking-badge').classList.remove('tracking');if(state.base)record(now,null,null);message('检测异常，请调整画面或重新启动');if(++state.errorCount>=5){stop();message('检测已停止，请刷新页面重试');toast('OpenCV 检测失败，请刷新页面重试');}}
  finally{mat?.delete();}
}
function markerSVG(id){
  const mat=state.tracker.marker(id,120),n=6,cell=20;let path='';
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(mat.data[(y*cell+10)*120+x*cell+10]<128)path+=`M${x} ${y}h1v1h-1z`;
  mat.delete();return `<svg xmlns="http://www.w3.org/2000/svg" width="${state.length}mm" height="${state.length}mm" viewBox="0 0 6 6"><rect width="6" height="6" fill="white"/><path d="${path}" fill="black"/></svg>`;
}
function prepareMarkers(){state.markerSVGs=[0,1].map(markerSVG);for(let i=0;i<2;i++){const uri='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(state.markerSVGs[i]);$(i===0?'marker-a-image':'marker-b-image').src=uri;$(i===0?'print-a':'print-b').src=uri;}$('print-size').textContent=number(state.length);$('print-mm').textContent=number(state.length);document.documentElement.style.setProperty('--marker-mm',`${state.length}mm`);}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function downloadMarkers(){
  const size=state.length,margin=10,gap=15,w=size*2+margin*2+gap,h=size+margin*2+18;
  const inner=state.markerSVGs.map((svg,i)=>`<g transform="translate(${margin+i*(size+gap)} ${margin}) scale(${size/6})">${svg.match(/<rect[\s\S]*<\/svg>/)[0].replace('</svg>','')}</g><text x="${margin+i*(size+gap)+size/2}" y="${margin+size+8}" text-anchor="middle" font-size="3.5" font-family="Arial">${i===0?'A · ID 0':'B · ID 1'}</text>`).join('');
  download(`aruco-markers-${size}mm.svg`,`<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="white"/>${inner}<text x="${w/2}" y="${h-3}" text-anchor="middle" font-family="Arial" font-size="3">DICT_4X4_50 · black square ${size} mm · print 100%</text></svg>`,'image/svg+xml');
}
$('start-btn').onclick=startCamera;$('camera-btn').onclick=()=>state.mode==='camera'?$('settings-dialog').showModal():startCamera();$('stop-btn').onclick=stop;$('demo-btn').onclick=startDemo;
$('mirror-btn').onclick=()=>{state.mirror=!state.mirror;updateMirrorButton();try{localStorage.setItem('aruco-mirror',String(state.mirror));}catch{}};
$('baseline-btn').onclick=()=>{if(!state.current||performance.now()-state.current.time>500)return;state.base={position:[...state.current.position],rotation:[...state.current.rotation]};state.history=[];state.recording=[];state.start=performance.now();$('baseline-status').textContent='基准已设置';$('clear-btn').disabled=false;toast('已记录当前相对位置');};
$('clear-btn').onclick=()=>clearBaseline(true);
$('markers-btn').onclick=()=>{prepareMarkers();$('markers-dialog').showModal();};$('print-btn').onclick=()=>{$('markers-dialog').close();window.print();};$('download-markers').onclick=downloadMarkers;
$('settings-btn').onclick=()=>{refreshCameras();$('settings-error').textContent='';$('settings-dialog').showModal();};
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('marker-size').onchange=e=>{const value=Number(e.target.value);if(!Number.isFinite(value)||value<10||value>200){e.target.value=state.length;toast('标记边长应在 10–200 mm 之间');return;}state.length=value;state.current=null;clearBaseline();prepareMarkers();try{localStorage.setItem('aruco-length',value);}catch{}};
$('camera-select').onchange=async e=>{state.cameraId=e.target.value;state.calibration=null;state.current=null;clearBaseline();updateCalibrationLabel();try{localStorage.removeItem('aruco-calibration');}catch{}if(state.mode==='camera'){$('settings-dialog').close();await startCamera();}};
$('import-calibration').onclick=()=>$('calibration-file').click();$('calibration-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>32768)throw new Error('文件过大，请选择相机内参 JSON');const cal=validateCalibration(JSON.parse(await file.text()));state.calibration=cal;state.current=null;clearBaseline();updateCalibrationLabel();try{localStorage.setItem('aruco-calibration',JSON.stringify(cal));}catch{}$('settings-error').textContent='';toast('已导入标定参数，请重新设置基准');}catch(err){$('settings-error').textContent=err.message;}e.target.value='';};
$('remove-calibration').onclick=()=>{state.calibration=null;state.current=null;clearBaseline();updateCalibrationLabel();try{localStorage.removeItem('aruco-calibration');}catch{}toast('已移除标定参数');};
['x','y','z'].forEach((axis,i)=>$('demo-'+axis).oninput=e=>{state.offset[i]=Number(e.target.value);$('demo-'+axis+'-out').value=e.target.value;});
let dragging=null;
display.addEventListener('pointerdown',e=>{if(state.mode!=='demo')return;dragging={x:e.clientX,y:e.clientY,offset:[...state.offset]};display.setPointerCapture(e.pointerId);});
display.addEventListener('pointermove',e=>{if(!dragging)return;const rect=display.getBoundingClientRect(),factor=380/(960*.94)*(960/rect.width);state.offset[0]=Math.max(-40,Math.min(40,dragging.offset[0]+(e.clientX-dragging.x)*factor*(state.mirror?-1:1)));state.offset[1]=Math.max(-30,Math.min(30,dragging.offset[1]+(e.clientY-dragging.y)*factor));['x','y'].forEach((axis,i)=>{$('demo-'+axis).value=state.offset[i];$('demo-'+axis+'-out').value=String(Math.round(state.offset[i]));});});
for(const event of['pointerup','pointercancel'])display.addEventListener(event,()=>dragging=null);
$('export-btn').onclick=()=>{const header='time_s,source,calibrated,tracking_valid,marker_size_mm,relative_x_mm,relative_y_mm,relative_z_mm,delta_x_mm,delta_y_mm,delta_z_mm,displacement_mm,rotation_delta_deg';const rows=state.recording.map(r=>[r.time.toFixed(3),r.mode,r.calibrated,r.valid,r.length,...(r.pose?r.pose.position.map(v=>v.toFixed(4)):['','','']),...(r.delta?r.delta.xyz.map(v=>v.toFixed(4)):['','','']),r.delta?.total.toFixed(4)??'',r.delta?.angle.toFixed(4)??''].join(','));download(`aruco-motion-${new Date().toISOString().replace(/[:.]/g,'-')}.csv`,'\uFEFF'+[header,...rows].join('\r\n'),'text/csv;charset=utf-8');};
window.addEventListener('resize',drawChart);window.addEventListener('pagehide',()=>{stopTracks();});
try{state.mirror=localStorage.getItem('aruco-mirror')!=='false';const length=Number(localStorage.getItem('aruco-length'));if(length>=10&&length<=200){state.length=length;$('marker-size').value=length;}const saved=localStorage.getItem('aruco-calibration');if(saved)state.calibration=validateCalibration(JSON.parse(saved));}catch{}
updateMirrorButton();updateCalibrationLabel();drawChart();requestAnimationFrame(frame);
async function initialize(){
  const start=performance.now();
  while(!window.cv?.Mat){if(performance.now()-start>45000)throw new Error('OpenCV 加载超时，请刷新重试');await new Promise(r=>setTimeout(r,100));}
  state.cv=window.cv;state.tracker=new Tracker(state.cv);prepareMarkers();$('engine-status').innerHTML='<span class="dot ready"></span>OpenCV 已就绪';['start-btn','camera-btn','demo-btn','markers-btn'].forEach(id=>$(id).disabled=false);message('先打印标记，再启动摄像头');
}
initialize().catch(e=>{$('engine-status').textContent='加载失败';message(e.message);console.error(e);});
