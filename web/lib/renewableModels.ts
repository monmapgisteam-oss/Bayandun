// Procedural, metre-scale glTF models. glTF axes: X east, Y up, -Z north.
// Shared by every instance in a FeatureLayer; no external model downloads.
type V3 = [number, number, number];
type Part = { positions: number[]; normals: number[]; color: number[]; metal: number; rough: number };

class Model {
  parts: Part[] = [];
  part(color: number[], metal = 0, rough = 0.7) {
    const p: Part = { positions: [], normals: [], color, metal, rough };
    this.parts.push(p);
    return p;
  }
  tri(p: Part, a: V3, b: V3, c: V3) {
    const u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n) || 1;
    p.positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) p.normals.push(...n.map((x) => x / len));
  }
  quad(p: Part, a: V3, b: V3, c: V3, d: V3) {
    this.tri(p, a, b, c); this.tri(p, a, c, d);
  }
  box(p: Part, center: V3, size: V3, transform = (v: V3): V3 => v) {
    const points = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
      .map((v) => transform(v.map((n, i) => center[i] + n * size[i] / 2) as V3));
    for (const [a,b,c,d] of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]])
      this.quad(p, points[a], points[b], points[c], points[d]);
  }
  cone(p: Part, y0: number, y1: number, r0: number, r1: number) {
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12, b = (i + 1) * Math.PI / 12;
      const q: V3[] = [[r0*Math.cos(a),y0,r0*Math.sin(a)], [r1*Math.cos(a),y1,r1*Math.sin(a)],
        [r1*Math.cos(b),y1,r1*Math.sin(b)], [r0*Math.cos(b),y0,r0*Math.sin(b)]];
      this.quad(p, ...q as [V3,V3,V3,V3]);
      this.tri(p, [0,y1,0], q[2], q[1]);
    }
  }
  pipe(p:Part,a:V3,b:V3,r:number,segments=12){
    const delta=b.map((v,i)=>v-a[i]),length=Math.hypot(...delta),u=delta.map(v=>v/length);
    const ref=Math.abs(u[1])<0.9?[0,1,0]:[1,0,0];
    const cross=(x:number[],y:number[])=>[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
    const raw=cross(u,ref),n=raw.map(v=>v/Math.hypot(...raw)),t=cross(u,n);
    const at=(c:V3,angle:number)=>c.map((v,i)=>v+r*(n[i]*Math.cos(angle)+t[i]*Math.sin(angle))) as V3;
    for(let i=0;i<segments;i++){const a0=at(a,i*2*Math.PI/segments),a1=at(a,(i+1)*2*Math.PI/segments),b0=at(b,i*2*Math.PI/segments),b1=at(b,(i+1)*2*Math.PI/segments);this.quad(p,a0,a1,b1,b0);this.tri(p,a,a1,a0);this.tri(p,b,b0,b1);}
  }
  export() {
    const accessors: object[] = [], bufferViews: object[] = [], chunks: Float32Array[] = [];
    let byteLength = 0;
    const add = (values: number[], bounds: boolean) => {
      const data = new Float32Array(values), count = data.length / 3;
      const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
      for (let i = 0; i < data.length; i++) { min[i%3] = Math.min(min[i%3], data[i]); max[i%3] = Math.max(max[i%3], data[i]); }
      bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.byteLength });
      accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count, type: "VEC3", ...(bounds ? { min, max } : {}) });
      chunks.push(data); byteLength += data.byteLength;
      return accessors.length - 1;
    };
    const parts = this.parts.filter((p) => p.positions.length);
    const primitives = parts.map((p, material) => ({ attributes: { POSITION: add(p.positions, true), NORMAL: add(p.normals, false) }, material }));
    const gltf = { asset: { version: "2.0", generator: "Booroljuut planning models" }, scene: 0,
      scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives }],
      materials: parts.map((p) => ({ doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [...p.color,1], metallicFactor: p.metal, roughnessFactor: p.rough } })),
      accessors, bufferViews, buffers: [{ byteLength }] };
    const json = new TextEncoder().encode(JSON.stringify(gltf)), jsonLength = Math.ceil(json.length / 4) * 4;
    const buffer = new ArrayBuffer(28 + jsonLength + byteLength), dv = new DataView(buffer), bytes = new Uint8Array(buffer);
    dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, buffer.byteLength, true);
    dv.setUint32(12, jsonLength, true); dv.setUint32(16, 0x4e4f534a, true);
    bytes.fill(32, 20, 20 + jsonLength); bytes.set(json, 20);
    dv.setUint32(20 + jsonLength, byteLength, true); dv.setUint32(24 + jsonLength, 0x004e4942, true);
    let offset = 28 + jsonLength;
    for (const chunk of chunks) { bytes.set(new Uint8Array(chunk.buffer), offset); offset += chunk.byteLength; }
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return `data:model/gltf-binary;base64,${btoa(binary)}`;
  }
}

function buildTurbine(hub: number, rotor: number, part: "complete" | "tower" | "rotor") {
  const m = new Model(), white = m.part([0.88,0.9,0.91], 0.15, 0.45), concrete = m.part([0.49,0.49,0.45]);
  const dark = m.part([0.19,0.23,0.26], 0.4), red = m.part([0.68,0.16,0.1]);
  const h = Math.max(10, hub), r = Math.max(5, rotor / 2), base = Math.max(2, r * 0.032);
  if (part !== "rotor") {
  m.cone(concrete, 0, 0.7, base * 1.7, base * 1.7);
  m.cone(white, 0.7, h, base, base * 0.53);
  m.box(white, [0,h,0.8], [5,4.4,10]);
  m.box(dark, [0,h+2.23,2], [3.4,0.08,3.6]);
  }
  // Three tapered airfoil-like blades, facing north. Full swept diameter = rotor.
  if (part !== "tower") for (let blade = 0; blade < 3; blade++) {
    const angle = blade * Math.PI * 2 / 3;
    const at = (x: number, y: number, z: number): V3 => [x*Math.cos(angle)-y*Math.sin(angle), (part === "rotor" ? 0 : h)+x*Math.sin(angle)+y*Math.cos(angle), z-5.2];
    const stations = [[1,0.65,0], [r*0.18,r*0.027,0], [r*0.55,r*0.018,-0.6], [r*0.94,0.38,-1.5], [r,0.06,-1.8]];
    for (let i = 0; i < stations.length - 1; i++) {
      const [y,w,s] = stations[i], [yn,wn,sn] = stations[i+1], p = i === stations.length-2 ? red : white;
      m.quad(p, at(s-w,y,-0.22),at(sn-wn,yn,-0.12),at(sn+wn,yn,-0.12),at(s+w,y,-0.22));
      m.quad(p, at(s+w,y,-0.22),at(sn+wn,yn,-0.12),at(sn,yn,0.45),at(s,y,0.65));
      m.quad(p, at(s,y,0.65),at(sn,yn,0.45),at(sn-wn,yn,-0.12),at(s-w,y,-0.22));
    }
  }
  if (part !== "tower") m.box(white, [0,part === "rotor" ? 0 : h,-5], [2.7,2.7,2.4]);
  return m;
}

// glTF ба хөдөлгөөнт ротор нэг геометр ашиглана; GPU буферийг зөвхөн нэг удаа үүсгэнэ.
function turbineMesh(m:Model) {
  const data: number[] = [];
  for (const p of m.parts) for (let i = 0; i < p.positions.length; i += 3) {
    data.push(...p.positions.slice(i, i + 3), ...p.normals.slice(i, i + 3), ...p.color);
  }
  return new Float32Array(data);
}

export const turbineRotorMesh=(diameter:number)=>turbineMesh(buildTurbine(0,diameter,"rotor"));
export const turbineTowerMesh=(hub:number,diameter:number)=>turbineMesh(buildTurbine(hub,diameter,"tower"));
const turbineCache=new Map<string,{href:string;height:number}>();
export function turbineModel(hub: number, rotor: number, part: "complete" | "tower" | "rotor" = "complete") {
  const key=[hub,rotor,part].join(":"),cached=turbineCache.get(key);if(cached)return cached;
  const m = buildTurbine(hub, rotor, part);
  let lo=Infinity, hi=-Infinity;
  for (const p of m.parts) for (let i=1;i<p.positions.length;i+=3) {lo=Math.min(lo,p.positions[i]);hi=Math.max(hi,p.positions[i]);}
  const result={href:m.export(),height:hi-lo};turbineCache.set(key,result);if(turbineCache.size>24)turbineCache.delete(turbineCache.keys().next().value!);return result;
}

export function solarTableModel(width: number, length: number, tilt: number, columns: number, rows: number) {
  const m = new Model(), frame = m.part([0.57,0.62,0.65], 0.6, 0.5), glass = m.part([0.018,0.055,0.105], 0, 0.48);
  const w = Math.max(0.2,width), l = Math.max(0.2,length), angle = Math.max(0, Math.min(85,tilt)) * Math.PI / 180;
  const s = Math.sin(angle), c = Math.cos(angle), clearance = 0.8;
  // Front edge is south (positive glTF Z); rear edge rises toward north.
  const at = ([x,y,z]: V3): V3 => [x, clearance + (l/2-z)*s + y*c, z*c+y*s];
  // Дээд талыг тусад нь хуваана: шилний доор давхардсан нүүр байхгүй.
  const slab = [[-w/2,-0.045,-l/2],[w/2,-0.045,-l/2],[w/2,0.045,-l/2],[-w/2,0.045,-l/2],
    [-w/2,-0.045,l/2],[w/2,-0.045,l/2],[w/2,0.045,l/2],[-w/2,0.045,l/2]].map(v => at(v as V3));
  for (const [a,b,c,d] of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4]])
    m.quad(frame, slab[a], slab[b], slab[c], slab[d]);
  const surface = (p: Part, x0: number, x1: number, z0: number, z1: number) =>
    m.quad(p, at([x0,0.045,z0]), at([x0,0.045,z1]), at([x1,0.045,z1]), at([x1,0.045,z0]));
  const nc = Math.max(1,Math.min(100,Math.round(columns))), nr = Math.max(1,Math.min(12,Math.round(rows)));
  const rim = Math.min(0.0125, w/nc/8, l/nr/8);
  for (let i = 0; i < nc; i++) for (let j = 0; j < nr; j++) {
    const x0 = -w/2+i*w/nc, x1 = -w/2+(i+1)*w/nc;
    const z0 = -l/2+j*l/nr, z1 = -l/2+(j+1)*l/nr;
    // Шил ба хүрээ нэг хавтгайг давхцалгүй эзэлнэ. Пикселээс жижиг
    // давхар зураас камер хөдөлгөхөд анивчдаг тул геометрээр нэмэхгүй.
    surface(glass, x0+rim, x1-rim, z0+rim, z1-rim);
    surface(frame, x0, x0+rim, z0, z1);
    surface(frame, x1-rim, x1, z0, z1);
    surface(frame, x0+rim, x1-rim, z0, z0+rim);
    surface(frame, x0+rim, x1-rim, z1-rim, z1);
  }
  for (let x = -w/2+0.6; x < w/2; x += 5) for (const z of [-l*0.32,l*0.32]) {
    const top = at([x,-0.06,z]);
    m.box(frame, [x,top[1]/2,top[2]], [0.09,top[1],0.09]);
  }
  return { href: m.export(), height: clearance+l*s+0.045*c };
}

export function modelRenderer(model: { href: string; height: number }, heading = 0) {
  return { type: "simple", symbol: { type: "point-3d", symbolLayers: [{ type: "object",
    resource: { href: model.href }, height: model.height, width: null, depth: null,
    anchor: "origin", heading, castShadows: true,
  }] } };
}

/** Метрийн хэмжээтэй концепц загвар. Footprint дотор тоноглол, фасад, үйлчилгээний хэсэг. */
const facilityCache=new Map<string,{href:string;height:number}>();
export function facilityModel(kind:string,width:number,depth:number,height:number,docks?:number){
  const key=[kind,width,depth,height,docks??'auto'].join(':');const cached=facilityCache.get(key);if(cached)return cached;
  const m=new Model(),wall=m.part([0.64,0.68,0.69],0.15),roof=m.part([0.25,0.32,0.36],0.5),trim=m.part([0.12,0.22,0.28],0.3),metal=m.part([0.72,0.76,0.78],0.7),glass=m.part([0.13,0.31,0.39],0.5,0.2),safety=m.part([0.89,0.64,0.17],0.25),base=m.part([0.45,0.48,0.46]);
  const w=Math.max(5,width),d=Math.max(5,depth),h=Math.max(3,height);
  const box=(p:Part,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>m.box(p,[x,y,z],[sx,sy,sz]);
  const pipe=(p:Part,a:V3,b:V3,r:number)=>m.pipe(p,a,b,r);
  const column=(x:number,z:number,r:number,top:number)=>{pipe(metal,[x,0.25,z],[x,top,z],r);for(const y of [top*0.35,top*0.7]){box(safety,x,y,z,r*2.7,0.16,r*2.7);}};
  const hall=(x:number,z:number,bw:number,bd:number,bh:number)=>{
    box(wall,x,bh*0.45,z,bw,bh*0.9,bd);
    m.quad(roof,[x-bw/2,bh*0.9,z-bd/2],[x-bw/2,bh,z],[x+bw/2,bh,z],[x+bw/2,bh*0.9,z-bd/2]);
    m.quad(roof,[x-bw/2,bh,z],[x-bw/2,bh*0.9,z+bd/2],[x+bw/2,bh*0.9,z+bd/2],[x+bw/2,bh,z]);
    m.tri(wall,[x-bw/2,bh*0.9,z-bd/2],[x-bw/2,bh*0.9,z+bd/2],[x-bw/2,bh,z]);
    m.tri(wall,[x+bw/2,bh*0.9,z+bd/2],[x+bw/2,bh*0.9,z-bd/2],[x+bw/2,bh,z]);
    for(let q=-bw/2+1;q<bw/2;q+=6){box(metal,x+q,bh*0.45,z+bd/2+0.04,0.12,bh*0.9,0.08);box(glass,x+q+1.5,bh*0.68,z+bd/2+0.06,Math.min(3,bw/8),bh*0.12,0.1);}
  };
  box(base,0,0.12,0,w,0.24,d);
  if(['tank','gas-storage','hydrogen-storage'].includes(kind)){
    // Савны хүрээлсэн суурь, үйлчилгээний зурвас — концепц хэмжээ.
    for(const x of [-w*0.48,w*0.48])box(base,x,0.6,0,w*0.02,1.2,d*0.96);
    for(const z of [-d*0.48,d*0.48])box(base,0,0.6,z,w*0.96,1.2,d*0.02);
    if(kind==='tank')for(const x of [-w*0.25,w*0.25]){
      const r=Math.min(w*0.2,d*0.36);pipe(metal,[x,0.3,0],[x,h*0.88,0],r);
      const cap=m.part([0.78,0.8,0.79],0.6);m.cone(cap,h*0.88,h,r,r*0.08);for(let i=0;i<cap.positions.length;i+=3)cap.positions[i]+=x;
      pipe(safety,[x+r*0.92,0.3,0],[x+r*0.92,h*0.88,0],0.12);box(trim,x,h*0.9,0,r*0.18,0.2,r*1.7);
    }else{
      const n=kind==='hydrogen-storage'?6:3,r=Math.min(w/(n*2.7),h*0.35);
      for(let i=0;i<n;i++){const x=-w*0.38+i*w*0.76/(n-1),y=r+1;pipe(metal,[x,y,-d*0.34],[x,y,d*0.28],r);for(const z of [-d*0.2,d*0.2])box(trim,x,0.6,z,r*1.5,1.2,0.6);pipe(safety,[x,y,d*0.28],[x,y,d*0.4],0.15);}
      pipe(safety,[-w*0.42,1.6,d*0.4],[w*0.42,1.6,d*0.4],0.2);
    }
  }else if(kind==='water'){
    for(const x of [-w*0.25,w*0.25]){const r=Math.min(w*0.21,d*0.35);pipe(wall,[x,0.25,0],[x,h*0.55,0],r);pipe(glass,[x,h*0.55,0],[x,h*0.56,0],r*0.9);box(metal,x,h*0.59,0,r*1.9,0.2,0.7);}
    box(wall,0,h*0.4,-d*0.4,w*0.24,h*0.8,d*0.15);
  }else if(kind==='cooling'){
    for(const x of [-w*0.3,0,w*0.3]){box(metal,x,h*0.4,0,w*0.25,h*0.75,d*0.8);for(const z of [-d*0.22,d*0.22]){pipe(trim,[x,h*0.78,z],[x,h*0.87,z],Math.min(w*0.09,d*0.16));for(let a=0;a<3;a++)m.box(metal,[0,0,0],[w*0.12,0.12,0.4],v=>[x+v[0]*Math.cos(a*2*Math.PI/3)-v[2]*Math.sin(a*2*Math.PI/3),h*0.9+v[1],z+v[0]*Math.sin(a*2*Math.PI/3)+v[2]*Math.cos(a*2*Math.PI/3)]);}}
  }else if(kind==='substation'){
    box(wall,0,h*0.2,-d*0.35,w*0.8,h*0.4,d*0.22);
    for(const x of [-w*0.28,w*0.28]){box(metal,x,h*0.23,0,w*0.22,h*0.44,d*0.3);for(let j=-2;j<=2;j++)box(trim,x+j*w*0.035,h*0.23,0,w*0.018,h*0.4,d*0.34);for(const z of [-d*0.1,0,d*0.1])pipe(trim,[x,h*0.45,z],[x,h*0.7,z],0.35);pipe(metal,[x,0.25,d*0.3],[x,h,d*0.3],0.2);}
    pipe(metal,[-w*0.35,h,d*0.3],[w*0.35,h,d*0.3],0.2);
  }else if(kind==='office'){
    box(wall,0,h/2,0,w*0.92,h,d*0.85);box(roof,0,h,0,w*0.94,0.25,d*0.87);
    for(let y=2;y<h;y+=3.3)for(let x=-w*0.42;x<w*0.43;x+=4){box(glass,x,y,d*0.428,2.7,1.7,0.12);box(glass,x,y,-d*0.428,2.7,1.7,0.12);}
    box(glass,0,h*0.3,d*0.435,w*0.13,h*0.6,0.2);box(metal,0,3.5,d*0.46,w*0.22,0.2,d*0.07);
    box(metal,w*0.25,h+0.6,0,w*0.16,1.2,d*0.18);
  }else if(kind==='laboratory'){
    // Лабораторийн хоёр жигүүр, холбох шилэн галерей, дээврийн соролтын тоноглол.
    for(const x of [-w*.29,w*.29]){box(wall,x,h*.46,0,w*.36,h*.9,d*.86);box(roof,x,h*.92,0,w*.38,.3,d*.88);
      for(let z=-d*.35;z<d*.38;z+=4)for(let y=2;y<h*.85;y+=3.2)box(glass,x+w*.182,y,z,.12,1.7,2.4);
      for(const z of [-d*.22,d*.22]){box(metal,x,h*.94,z,w*.16,h*.07,d*.15);pipe(trim,[x,h*.97,z],[x,h*1.1,z],.3);}}
    box(glass,0,h*.4,-d*.12,w*.22,h*.58,d*.2);box(metal,0,h*.7,-d*.12,w*.24,.25,d*.22);
  }else if(['fertilizer','methanol','lng','sulfuric','ammonium','liquefaction'].includes(kind)){
    if(kind==='fertilizer'){
      hall(-w*.16,-d*.14,w*.6,d*.64,h*.58);
      for(const x of [-w*.28,-w*.06,w*.16]){column(x,d*.25,w*.07,h*.88);pipe(safety,[x,h*.72,d*.25],[x,h*.55,0],.3);}
      box(trim,w*.32,h*.25,-d*.03,w*.18,h*.48,d*.5);
    }else if(kind==='methanol'){
      for(const [x,z,top] of [[-w*.3,-d*.2,h],[0,-d*.2,h*.82],[w*.3,-d*.2,h*.62]])column(x,z,w*.055,top);
      for(const x of [-w*.22,w*.18])pipe(metal,[x,h*.2,d*.1],[x,h*.2,d*.32],Math.min(w*.09,h*.15));
      box(roof,0,h*.43,0,w*.82,.5,d*.12);
    }else if(kind==='lng'){
      box(wall,-w*.3,h*.46,-d*.16,w*.25,h*.9,d*.42);
      for(const x of [0,w*.27]){box(metal,x,h*.17,-d*.2,w*.22,h*.32,d*.38);for(let j=-2;j<=2;j++)box(trim,x+j*w*.035,h*.2,-d*.2,w*.012,h*.26,d*.4);}
      for(const x of [-w*.26,w*.06,w*.3])pipe(metal,[x,h*.2,d*.1],[x,h*.2,d*.3],Math.min(w*.07,h*.14));
    }else if(kind==='sulfuric'){
      for(const x of [-w*.32,0,w*.3])column(x,-d*.17,w*.08,x===0?h:h*.72);
      for(const x of [-w*.22,w*.2])box(wall,x,h*.25,d*.2,w*.3,h*.5,d*.2);
      pipe(metal,[-w*.32,h*.58,-d*.17],[w*.3,h*.58,-d*.17],Math.min(.8,w*.015));
    }else if(kind==='ammonium'){
      column(-w*.28,-d*.12,w*.13,h);hall(w*.2,-d*.02,w*.42,d*.64,h*.48);
      pipe(safety,[-w*.28,h*.7,-d*.12],[w*.2,h*.5,-d*.12],.4);
      for(const x of [-w*.2,0,w*.2])column(x,d*.26,w*.04,h*.32);
    }else{
      for(const x of [-w*.32,-w*.1,w*.12])column(x,-d*.18,w*.065,h*(.8+(x===-w*.1?.2:0)));
      hall(w*.34,-d*.02,w*.2,d*.65,h*.35);
      for(const x of [-w*.27,w*.02])pipe(metal,[x,h*.19,d*.14],[x,h*.19,d*.31],Math.min(w*.08,h*.14));
      box(trim,-w*.12,h*.56,-d*.18,w*.66,.5,d*.2);
    }
    // Гол pipe rack ба үйлчилгээний тавцанг тухайн footprint дотор хадгална.
    for(const x of [-w*.42,0,w*.42]){box(trim,x,h*.18,d*.41,.3,h*.36,.3);box(trim,x,h*.36,d*.37,.3,.2,d*.16);}
    for(const z of [d*.33,d*.4])pipe(z===d*.33?safety:metal,[-w*.44,h*.38,z],[w*.44,h*.38,z],.22);
  }else if(['process','electrolyzer','dryer','coke'].includes(kind)){
    if(kind==='dryer'){
      hall(-w*0.2,0,w*0.5,d*0.82,h*0.55);
      pipe(roof,[w*0.08,h*0.22,-d*0.25],[w*0.4,h*0.22,d*0.25],Math.min(d*0.1,h*0.18));
      for(const z of [-d*0.28,d*0.28])column(w*0.27,z,w*0.045,h*0.8);
      box(trim,0,h*0.5,0,w*0.85,0.8,d*0.06);
    }else if(kind==='coke'){
      for(let x=-w*0.4;x<w*0.4;x+=w/12){box(wall,x,h*0.27,0,w/15,h*0.5,d*0.68);box(trim,x,h*0.18,d*0.35,w/22,h*0.25,0.3);}
      box(metal,0,h*0.58,0,w*0.9,1,d*0.25);column(w*0.4,-d*0.35,w*0.025,h);
    }else if(kind==='electrolyzer'){
      for(const z of [-d*0.22,d*0.22])for(const x of [-w*0.3,0,w*0.3]){box(wall,x,h*0.28,z,w*0.24,h*0.5,d*0.29);for(let j=-2;j<=2;j++)box(trim,x+j*w*0.035,h*0.3,z+d*0.15,w*0.015,h*0.36,0.15);box(metal,x,h*0.58,z,w*0.18,0.5,d*0.2);}
      pipe(safety,[-w*0.43,h*0.25,0],[w*0.43,h*0.25,0],0.25);column(w*0.43,-d*0.38,w*0.025,h*0.85);
    }else{
      hall(-w*0.28,-d*0.08,w*0.35,d*0.65,h*0.38);
      for(const [x,z,r,top]of [[0,-d*0.25,w*0.045,h],[w*0.2,d*0.17,w*0.06,h*0.8],[w*0.38,-d*0.2,w*0.04,h*0.65]])column(x,z,r,top);
      pipe(metal,[w*0.06,h*0.2,d*0.25],[w*0.37,h*0.2,d*0.25],Math.min(h*0.12,d*0.1));
    }
    // Steel pipe rack with coloured services, maintenance platform, and guard rails.
    for(const x of [-w*0.4,-w*0.1,w*0.2,w*0.4]){box(trim,x,h*0.22,d*0.4,0.3,h*0.44,0.3);box(trim,x,h*0.44,d*0.35,0.3,0.25,d*0.18);}
    for(const z of [d*0.3,d*0.37,d*0.43])pipe(z===d*0.37?safety:metal,[-w*0.44,h*0.46,z],[w*0.44,h*0.46,z],Math.min(0.25,d*0.01));
  }else{
    hall(0,-d*0.08,w*0.92,d*0.76,h*0.88);
    const dockCount=docks??Math.max(1,Math.ceil(w*0.75/10));
    for(let i=0;i<dockCount;i++){const x=-w*0.4+(i+0.5)*w*0.8/dockCount;box(trim,x,2.5,d*0.305,Math.min(5,w*0.7/dockCount),4.5,0.12);box(base,x,0.7,d*0.36,5.5,1.4,d*0.1);box(safety,x-3,0.9,d*0.4,0.15,1.8,0.15);}
    if(kind==='datacenter'){
      for(let x=-w*0.36;x<w*0.4;x+=8){box(metal,x,h*0.92,-d*0.12,4,h*0.1,5);box(trim,x,h*0.985,-d*0.12,3,0.15,4);}
      for(const x of [-w*0.28,0,w*0.28])box(metal,x,1.6,d*0.4,w*0.19,3,d*0.12);
    }else for(let x=-w*0.3;x<w*0.4;x+=12)box(glass,x,h*0.89,0,2.5,0.12,d*0.2);
  }
  let lo=Infinity,hi=-Infinity;for(const p of m.parts)for(let i=1;i<p.positions.length;i+=3){lo=Math.min(lo,p.positions[i]);hi=Math.max(hi,p.positions[i]);}
  const model={href:m.export(),height:hi-lo};if(facilityCache.size>=128)facilityCache.clear();facilityCache.set(key,model);return model;
}
