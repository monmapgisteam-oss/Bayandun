// Концепц үйлдвэрийн хөтөлбөр: хүчин чадал → нэгж тоноглол → footprint → хязгаарлалтаар байрлуулах.
export type FacilityKind="datacenter"|"process"|"warehouse"|"water"|"substation";
export const FACILITIES:Record<FacilityKind,{label:string;unit:string;width:number;depth:number;height:number;knowledge:string;needs:string}>={
 datacenter:{label:"Дата төв",unit:"МВт IT",width:80,depth:40,height:12,knowledge:"IT ачаалал → тусгаарласан модуль → хөргөлт/UPS → дэд станц → засварын нэвтрэлт",needs:"PUE, redundancy, rack density, хөргөлтийн систем, сүлжээний баталгаат чадал"},
 process:{label:"Боловсруулах үйлдвэр",unit:"тн/хон",width:90,depth:45,height:18,knowledge:"Түүхий эд хүлээн авах → боловсруулах цех → завсрын хадгалалт → бүтээгдэхүүн/ачилт",needs:"Масс/энергийн баланс, технологийн схем, эрүүл ахуйн зай, hazardous area"},
 warehouse:{label:"Агуулах, логистик",unit:"паллет",width:100,depth:50,height:14,knowledge:"Орц → хүлээн авах талбай → хадгалалт → багцлах → ачилт; ачааны эргэлтийн талбай үлдээнэ",needs:"Паллетын нягт, truck turning, докын тоо, галын хэсэглэл, төмөр замын шаардлага"},
 water:{label:"Ус цэвэрлэх байгууламж",unit:"м³/хон",width:40,depth:30,height:7,knowledge:"Оролт → урьдчилсан цэвэрлэгээ → үндсэн шат → ариутгал → цэвэр ус/лагийн тусдаа гарц",needs:"Усны шинжилгээ, hydraulic retention time, peak factor, sludge, discharge permit"},
 substation:{label:"Цахилгаан дэд станц",unit:"МВА",width:45,depth:35,height:9,knowledge:"Өндөр хүчдэлийн оролт → таслуур → трансформатор → хуваарилах байгууламж → гарц",needs:"Хүчдэлийн түвшин, N−1, fault level, газардуулга, хамгаалалт, grid connection study"},
};
export type FacilityInput={kind:FacilityKind;demand:number;unitCapacity:number;width:number;depth:number;height:number;spacing:number;maxSlope:number;reserve:number};
export type Footprint={x:number;y:number;ring:[number,number][];capacity:number;heading:number};
export function facilityCount(demand:number,unitCapacity:number){
 if(!Number.isFinite(demand+unitCapacity)||demand<=0||unitCapacity<=0)throw new Error("Хэрэгцээ, нэгжийн хүчин чадлыг 0-ээс ихээр оруулна уу.");
 return Math.ceil(demand/unitCapacity);
}
export function utilitySizing(flowDay:number,peakFactor:number,velocity:number){
 if(![flowDay,peakFactor,velocity].every(Number.isFinite)||flowDay<=0||peakFactor<1||velocity<=0)return null;
 const q=flowDay*peakFactor/86400,d=Math.sqrt(4*q/(Math.PI*velocity))*1000;
 const sizes=[50,75,100,150,200,250,300,400,500,600,800,1000,1200,1600,2000];
 return {qLs:q*1000,diameter:d,nominal:sizes.find((x)=>x>=d)??null};
}

/** Editable example programmes, not measured project demand or engineering norms. */
export const FACILITY_DEFAULTS:Record<FacilityKind,{demand:number;capacity:number;water:number;power:number}>={
 process:{demand:1000,capacity:250,water:500,power:4},
 datacenter:{demand:20,capacity:5,water:120,power:26},
 warehouse:{demand:10000,capacity:2500,water:40,power:1},
 water:{demand:5000,capacity:1000,water:80,power:0.6},
 substation:{demand:40,capacity:20,water:0,power:30},
};
