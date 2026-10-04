import {request,SUPABASE_URL,PUBLISHABLE_KEY} from './api-module.js?v=storage-images-9';

const BUCKET='naya-product-images';
const imagePath=path=>/\.(?:jpe?g|png)$/i.test(path);
const optimizedPath=path=>`${path}.optimized.webp`;
const objectUrl=path=>`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

async function listFiles(session,prefix=''){
  const files=[];
  for(let offset=0;;offset+=100){
    const entries=await request(`/storage/v1/object/list/${BUCKET}`,{method:'POST',token:session.accessToken,body:{prefix,limit:100,offset,sortBy:{column:'name',order:'asc'}}});
    for(const entry of entries){
      const path=[prefix,entry.name].filter(Boolean).join('/');
      if(entry.id)files.push({...entry,path});else files.push(...await listFiles(session,path));
    }
    if(entries.length<100)break;
  }
  return files;
}

async function encodeImage(blob){
  const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');
  canvas.width=bitmap.width;canvas.height=bitmap.height;
  const context=canvas.getContext('2d');
  if(!context){bitmap.close();throw new Error('לא ניתן להכין תמונה בדפדפן הזה')}
  context.drawImage(bitmap,0,0);bitmap.close();
  const output=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.96));
  if(!output||output.type!=='image/webp')throw new Error('הדפדפן אינו תומך בהמרה ל-WebP');
  return output;
}

export async function optimizeStorageImages(session,onProgress){
  if(!await request('/rest/v1/rpc/is_naya_admin',{method:'POST',body:{},token:session.accessToken}))throw new Error('נדרשת התחברות למנהל');
  onProgress('סורק את כל תיקיות האחסון...');
  const files=await listFiles(session),paths=new Set(files.map(file=>file.path)),candidates=files.filter(file=>imagePath(file.path));
  const imageRows=await request('/rest/v1/product_images?select=id,storage_path',{token:session.accessToken});
  const galleryRows=await request('/rest/v1/model_gallery?select=id,image_path',{token:session.accessToken});
  const report={total:candidates.length,converted:0,kept:0,updatedReferences:0,savedBytes:0,errors:[],changes:[]};
  const persist=()=>localStorage.setItem('naya_storage_optimization_report',JSON.stringify({...report,updatedAt:new Date().toISOString()}));
  const normalize=value=>String(value||'').replace(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`,'');
  for(let index=0;index<candidates.length;index++){
    const file=candidates[index],destination=optimizedPath(file.path);
    onProgress(`מטפל בתמונה ${index+1} מתוך ${candidates.length}...`);
    try{
      const response=await fetch(objectUrl(file.path));if(!response.ok)throw new Error(`קריאת התמונה נכשלה (${response.status})`);
      const original=await response.blob();
      let converted;
      if(paths.has(destination)){
        const existing=await fetch(objectUrl(destination));if(!existing.ok)throw new Error('קריאת הגרסה הקיימת נכשלה');converted=await existing.blob();
      }else converted=await encodeImage(original);
      if(converted.size>=original.size){report.kept++;continue}
      if(!paths.has(destination)){
        const upload=await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${destination.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',headers:{apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${session.accessToken}`,'Content-Type':'image/webp','x-upsert':'false'},body:converted});
        if(!upload.ok)throw new Error(`שמירת הגרסה החדשה נכשלה (${upload.status})`);
      }
      for(const row of imageRows.filter(row=>normalize(row.storage_path)===file.path)){
        await request(`/rest/v1/product_images?id=eq.${encodeURIComponent(row.id)}`,{method:'PATCH',token:session.accessToken,body:{storage_path:destination}});
        report.changes.push({table:'product_images',id:row.id,field:'storage_path',before:row.storage_path,after:destination});report.updatedReferences++;persist();
      }
      for(const row of galleryRows.filter(row=>normalize(row.image_path)===file.path)){
        await request(`/rest/v1/model_gallery?id=eq.${encodeURIComponent(row.id)}`,{method:'PATCH',token:session.accessToken,body:{image_path:destination}});
        report.changes.push({table:'model_gallery',id:row.id,field:'image_path',before:row.image_path,after:destination});report.updatedReferences++;persist();
      }
      report.converted++;report.savedBytes+=original.size-converted.size;
    }catch(error){report.errors.push({path:file.path,message:error.message})}
    persist();
  }
  persist();
  return report;
}

export function downloadOptimizationReport(report){
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download='naya-image-optimization-report.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
