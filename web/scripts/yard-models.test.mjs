import test from "node:test";
import assert from "node:assert/strict";
import { yardBuildingHeights, yardBuildingModel, yardCarModel, yardTreeModel, yardAmenityModel } from "../lib/yardModels.ts";

function readModel(model) {
  const bytes = Buffer.from(model.href.split(",")[1], "base64");
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
  for (const primitive of json.meshes[0].primitives) {
    const pos = json.accessors[primitive.attributes.POSITION], normal = json.accessors[primitive.attributes.NORMAL];
    assert.equal(pos.count, normal.count);
    assert.ok(pos.count > 0 && pos.count % 3 === 0);
    for(let i=0;i<3;i++){min[i]=Math.min(min[i],pos.min[i]);max[i]=Math.max(max[i],pos.max[i]);}
  }
  return { json,min,max };
}

const examples = [
  ["house",12,10,3.2,"hip"], ["house",10,11,3.2,"hip"], ["house",4,7,3.2,"hip"],
  ["house",12,10,3.2,"flat"], ["house",15,10,3.2,"gable"], ["house",10,10,3.2,"gable"],
  ["house",11,9,6.4,"hip"], ["parking",4.5,7,3,"gable"], ["parking",4.5,7,3,"flat"],
  ["gazebo",6,4.5,2.4,"hip"], ["greenhouse",6,4,1.8,"gable"], ["shed",4,4.5,2.4,"hip"],
];
for (const [kind,w,d,wall,roof] of examples) test(`3D ${kind} ${w}×${d}, ${wall} m walls, ${roof}`, () => {
  const model = yardBuildingModel(kind,w,d,wall,roof,["#445566"]), {json,min,max} = readModel(model);
  assert.ok(Math.abs(min[0] + w/2) < 1e-4 && Math.abs(max[0] - w/2) < 1e-4, "model preserves footprint width");
  assert.ok(Math.abs(min[2] + d/2) < 1e-4 && Math.abs(max[2] - d/2) < 1e-4, "model preserves footprint depth");
  assert.ok(Math.abs(min[1]) < 1e-5, "foundation bottom is datum zero");
  assert.ok(Math.abs(max[1] - model.height) < 1e-4, "declared total height includes every roof vertex");
  assert.equal(model.eaveHeight,model.foundationHeight+wall);
  assert.equal(model.height,model.eaveHeight+model.roofRise);
  assert.ok(json.materials.length >= 5, "separate facade, glazing, foundation and roof materials");
  assert.equal(yardBuildingModel(kind,w,d,wall,roof,["#445566"]),model, "reuses one cached model for matching instances");
});

test("height arithmetic separates foundation, storeys and roof", () => {
  const single=yardBuildingHeights("house",12,10,3.2,"hip"),two=yardBuildingHeights("house",12,10,6.4,"hip");
  assert.ok(Math.abs(single.roofRise-5*Math.tan(28*Math.PI/180))<1e-10);
  assert.ok(Math.abs(two.height-single.height-3.2)<1e-10, "extra storey adds only its storey height");
  assert.equal(yardBuildingHeights("house",12,10,3.2,"flat").roofRise,.35);
  assert.throws(()=>yardBuildingModel("house",0,10,3.2,"hip"));
});
test("single car is exactly 1.8 × 4.5 × 1.5 m", () => {
  const model=yardCarModel(),{min,max,json}=readModel(model);
  assert.deepEqual([model.width,model.depth,model.height],[1.8,4.5,1.5]);
  for(const [axis,expected] of [[0,1.8],[1,1.5],[2,4.5]]) assert.ok(Math.abs(max[axis]-min[axis]-expected)<1e-5);
  assert.ok(json.materials.length>=6,"car has body, windows, tyres, hubs and lamps");
});
for(const kind of ["deciduous","conifer"])test(`${kind} tree has requested physical dimensions`,()=>{
  const model=yardTreeModel(kind,5,3),{min,max,json}=readModel(model);
  assert.ok(Math.abs(max[1]-5)<1e-5&&Math.abs(min[1])<1e-5);
  assert.ok(Math.abs(max[0]-min[0]-3)<1e-5&&Math.abs(max[2]-min[2]-3)<1e-5);
  assert.ok(json.materials.length>=5,"several crown tones and bark");
  assert.ok(json.accessors.filter((_,i)=>i%2===0).reduce((sum,a)=>sum+a.count,0)<1300,"tree has a bounded neighbourhood-scale triangle budget");
});

for(const kind of ["football-goal","basketball-stand","bench","pergola"])test(`${kind} has physical dimensions and ground-zero anchor`,()=>{
  const model=yardAmenityModel(kind),{min,max}=readModel(model);
  assert.ok(Math.abs(min[1])<1e-5);
  assert.ok(Math.abs(max[1]-model.height)<1e-5);
  assert.ok(Math.abs(max[0]-min[0]-model.width)<1e-5);
  assert.ok(Math.abs(max[2]-min[2]-model.depth)<1e-5);
  assert.ok(Math.abs(min[0]+max[0])<1e-5&&Math.abs(min[2]+max[2])<1e-5,"point is horizontally centred");
  if(kind==="football-goal"){assert.equal(model.openingWidth,3);assert.equal(model.openingHeight,2);assert.ok(Math.abs(model.height-2.08)<1e-5);assert.ok(Math.abs(model.width-3.16)<1e-5);assert.ok(model.frontPlaneOffset>0);}
  if(kind==="basketball-stand"){
    assert.equal(model.rimHeight,3.05);assert.ok(Math.abs(model.height-3.95)<1e-5);
    assert.ok(Math.abs(model.rimOffset-model.supportOffset-2.575)<1e-10,"pole stays outside the baseline");
    assert.ok(Math.abs(model.rimOffset-model.backboardOffset-.375)<1e-10);
    const originInsideBaseline=1.575-model.rimOffset;
    assert.ok(Math.abs(originInsideBaseline+model.supportOffset+1)<1e-10,"support pole is1m behind baseline");
    assert.ok(Math.abs(originInsideBaseline+model.backboardOffset-1.2)<1e-10,"backboard face is1.2m inside baseline");
  }
  if(kind==="bench")assert.equal(model.seatHeight,.45);
  if(kind==="pergola"){assert.equal(model.width,6);assert.equal(model.depth,5);assert.equal(model.wallHeight,2.4);assert.ok(model.roofRise>0);}
});
