import {getModelGallery,getProducts} from './api-module.js';

const gallery=document.querySelector('#modelGallery .model-gallery');
let currentLanguage=localStorage.getItem('naya_store_language')||'he';

function linkText(){return currentLanguage==='en'?'Product details':'לפרטי המוצר'}
const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const placement={he:{necklaces:'במראה על הצוואר',rings:'במראה על היד',bracelets:'במראה על פרק כף היד',earrings:'במראה על האוזן'},en:{necklaces:'shown on the neck',rings:'shown on the hand',bracelets:'shown on the wrist',earrings:'shown on the ear'}};
function modelAlt(item){const product=products.find(product=>String(product.id)===String(item.productId));if(!product)return currentLanguage==='en'?'NAYA jewelry on display':'תכשיטי NAYA בתצוגה';const name=currentLanguage==='en'?(product.nameEn||product.nameHe):product.nameHe,suffix=placement[currentLanguage]?.[product.category]||(currentLanguage==='en'?'shown when worn':'במראה על הגוף');return `${name} ${suffix}`}
function productLinkLabel(item){const product=products.find(product=>String(product.id)===String(item.productId)),name=currentLanguage==='en'?(product?.nameEn||product?.nameHe):product?.nameHe;return name?(currentLanguage==='en'?`View ${name}`:`לצפייה ב${name}`):linkText()}
function render(items){
  if(!gallery||!items.length)return;
  gallery.innerHTML=items.filter(item=>item.active!==false).map(item=>`<figure><img src="${item.image}" alt="${escapeHtml(modelAlt(item))}" loading="lazy">${item.productId?`<button class="model-product-link" type="button" data-gallery-product="${item.productId}" aria-label="${escapeHtml(productLinkLabel(item))}">${linkText()}</button>`:''}</figure>`).join('');
}

let galleryItems=[],products=[];
Promise.all([getModelGallery(),getProducts()]).then(([items,loadedProducts])=>{galleryItems=items;products=loadedProducts;render(items)}).catch(()=>{});

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
