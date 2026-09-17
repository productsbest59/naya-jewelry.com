import {getModelGallery} from './api-module.js';

const gallery=document.querySelector('#modelGallery .model-gallery');
let currentLanguage=localStorage.getItem('naya_store_language')||'he';

function linkText(){return currentLanguage==='en'?'Product details':'לפרטי המוצר'}
function render(items){
  if(!gallery||!items.length)return;
  gallery.innerHTML=items.filter(item=>item.active!==false).map(item=>`<figure><img src="${item.image}" alt="תכשיטי NAYA על דוגמן או דוגמנית" loading="lazy">${item.productId?`<button class="model-product-link" type="button" data-gallery-product="${item.productId}">${linkText()}</button>`:''}</figure>`).join('');
}

let galleryItems=[];
getModelGallery().then(items=>{galleryItems=items;render(items)}).catch(()=>{});

document.addEventListener('naya-language-change',event=>{currentLanguage=event.detail;render(galleryItems)});
gallery?.addEventListener('click',event=>{
  const button=event.target.closest('[data-gallery-product]');
  if(!button)return;
  event.preventDefault();
  event.stopPropagation();
  const card=document.querySelector(`[data-product="${CSS.escape(button.dataset.galleryProduct)}"]`);
  if(!card)return;
  card.dataset.highlightLabel=currentLanguage==='en'?'This is the product':'זה המוצר';
  card.classList.remove('gallery-product-highlight');
  card.scrollIntoView({behavior:'smooth',block:'center'});
  const showHighlight=()=>{
    card.classList.remove('gallery-product-highlight');
    requestAnimationFrame(()=>card.classList.add('gallery-product-highlight'));
    setTimeout(()=>card.classList.remove('gallery-product-highlight'),2800);
  };
  if('onscrollend' in window){
    window.addEventListener('scrollend',showHighlight,{once:true});
    setTimeout(()=>{if(!card.classList.contains('gallery-product-highlight'))showHighlight()},1100);
  }else setTimeout(showHighlight,700);
});
