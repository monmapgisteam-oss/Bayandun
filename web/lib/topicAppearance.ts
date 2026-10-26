/** Үндсэн үйлдвэрийн технологийн ялгааг харуулах концепц хэлбэрүүд. */
export const TOPIC_APPEARANCE:Record<number,string>={4:'electrolyzer',5:'fertilizer',6:'dryer',7:'coke',8:'methanol',9:'lng',10:'sulfuric',11:'ammonium',12:'liquefaction',13:'laboratory',14:'datacenter',15:'warehouse'};
export function topicAppearance(zone:number,role:string|undefined,fallback:string){return role==='main'||role==='electrolysis'?TOPIC_APPEARANCE[zone]??fallback:fallback;}
