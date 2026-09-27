export function enableRowDrag(container,selector,move){
 let dragged=null;
 const style=document.createElement('style');style.textContent=`${selector}{cursor:grab}${selector}.row-dragging{opacity:.45}${selector}.row-drop-target{outline:2px solid #d4af37;outline-offset:2px}`;document.head.append(style);
 const refresh=()=>container.querySelectorAll(selector).forEach(row=>{row.draggable=true;row.querySelectorAll('img').forEach(img=>img.draggable=false)});
 new MutationObserver(refresh).observe(container,{childList:true});refresh();
 container.addEventListener('dragstart',event=>{
  const row=event.target.closest(selector);if(!row||event.target.closest('button,input,select,textarea,a')||container.inert){event.preventDefault();return;}
  dragged=row;row.classList.add('row-dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain','reorder');
 });
 const clear=()=>container.querySelectorAll('.row-drop-target,.row-dragging').forEach(row=>row.classList.remove('row-drop-target','row-dragging'));
 container.addEventListener('dragover',event=>{if(!dragged)return;event.preventDefault();container.querySelectorAll('.row-drop-target').forEach(row=>row.classList.remove('row-drop-target'));event.target.closest(selector)?.classList.add('row-drop-target');if(event.clientY<90)window.scrollBy(0,-24);else if(event.clientY>innerHeight-90)window.scrollBy(0,24);});
 container.addEventListener('drop',async event=>{if(!dragged)return;event.preventDefault();const rows=[...container.querySelectorAll(selector)],from=rows.indexOf(dragged),to=rows.indexOf(event.target.closest(selector));dragged=null;clear();if(from<0||to<0||from===to)return;container.inert=true;try{await move(from,to)}finally{container.inert=false}});
 container.addEventListener('dragend',()=>{dragged=null;clear()});
}
