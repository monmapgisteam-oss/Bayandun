/** Хэсэг солиход нуусан төлөвийг эргүүлж сэргээнэ; хэрэглэгчийн унтраасан давхарга хэвээр. */
export function applyModuleVisibility<T extends {id:string;visible:boolean}>(layers:T[],active:number,hidden:WeakMap<T,boolean>) {
  for(const layer of layers){
    const match=/^mod:(\d+):/.exec(layer.id);
    if(!match)continue;
    if(Number(match[1])!==active){
      if(!hidden.has(layer))hidden.set(layer,layer.visible);
      layer.visible=false;
    }else if(hidden.has(layer)){
      layer.visible=hidden.get(layer)!;hidden.delete(layer);
    }
  }
}
