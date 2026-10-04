const readAsDataUrl=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});

export async function prepareImageUpload(file,{maxDimension=2400,quality=.92}={}){
  if(!file?.type?.startsWith('image/')||/image\/(?:svg\+xml|gif)/i.test(file.type))return readAsDataUrl(file);
  const bitmap=await createImageBitmap(file),scale=Math.min(1,maxDimension/Math.max(bitmap.width,bitmap.height)),width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale)),canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{alpha:true});
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(bitmap,0,0,width,height);bitmap.close?.();
  return canvas.toDataURL('image/webp',quality);
}
