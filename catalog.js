window.NAYA_SEED_PRODUCTS = [
  [1,"שרשרת בן פורת יוסף","Ben Porat Yosef Necklace",159,120,"necklaces",["זהב","כסף"]],
  [2,"שרשרת דיסקית תפילת הדרך","Travel Prayer Disc Necklace",149,99,"necklaces"],
  [3,"שרשרת מגן דוד שמע ישראל","Shema Israel Star of David Necklace",149,99,"necklaces",["זהב","כסף"]],
  [4,"טבעת מגן דוד משולבת שרשרת","Star of David Ring with Chain",169,129,"rings",["כסף","זהב"]],
  [5,"צמיד לאקי צארם","Lucky Charm Bracelet",249,199,"bracelets",["כסף","זהב"]],
  [6,"שרשרת 7 המלאכים","Seven Angels Necklace",189,139,"necklaces",["כסף","זהב"]],
  [7,"טבעת מגן דוד מינימליסטית","Minimalist Star of David Ring",149,99,"rings",["כסף","זהב","רוז גולד","שחור"]],
  [8,"צמיד משולב טבעת עם אבן זירקון","Bracelet Ring with Zircon Stone",179,129,"bracelets",["זהב","כסף"]],
  [9,"שרשרת מגן דוד לשמירה והגנה","Star of David Protection Necklace",199,149,"necklaces",["כסף","זהב"]],
  [10,"טבעת מהממת עם מגני דוד מוזהבים","Gold Star of David Ring",159,119,"rings"],
  [11,"שרשרת סנייק עם תליון מגן דוד","Snake Chain Star of David Necklace",199,149,"necklaces",["זהב","כסף"]],
  [12,"צמיד שמע ישראל","Shema Israel Bracelet",149,99,"bracelets",["זהב","כסף"]],
  [13,"טבעת שמע ישראל","Shema Israel Ring",139,89,"rings",["זהב","כסף"]],
  [14,"טבעת מגן דוד כסף סטרלינג משובצת אבן זירקון","Sterling Silver Star of David Ring with Zircon Stone",249,199,"rings",["כסף","רוז גולד"]],
  [15,"שרשרת שני חלקים מגן דוד חי","Two-Piece Star of David Chai Necklace",169,119,"necklaces",["כסף","זהב"]],
  [16,"שרשרת יוקרתית משובצת אבני זירקון","Luxury Zircon Stone Necklace",220,169,"necklaces",["זהב","כסף"],[],["קצרה - 35+10 ס״מ","ארוכה - 41+5 ס״מ"]],
  [17,"טבעת מגן דוד כסף סטרלינג 925 משובצת אבני זירקון","925 Sterling Silver Star of David Ring with Zircon Stones",169,119,"rings",["כסף","זהב"]]
].map(([number,nameHe,nameEn,regularPrice,price,category,colors=[],sizes=[],styles=[]]) => ({
  id:`product-${String(number).padStart(2,"0")}`,
  sku:`NAYA-${String(number).padStart(3,"0")}`,
  nameHe,nameEn,descriptionHe:"",descriptionEn:"",regularPrice,price,priceUsd:Math.max(1,Math.round(price/3.7)),category,
  colors,sizes,styles,
  active:true,
  images:[1,2,3,4,5].map(i=>`products-images/product${String(number).padStart(2,"0")}-${i}.jpg`)
}));

window.NayaCatalog = {
  key:"naya_new_store_products_v2",
  get(){
    try { return JSON.parse(localStorage.getItem(this.key)) || structuredClone(window.NAYA_SEED_PRODUCTS); }
    catch { return structuredClone(window.NAYA_SEED_PRODUCTS); }
  },
  save(products){ localStorage.setItem(this.key, JSON.stringify(products)); },
  reset(){ localStorage.removeItem(this.key); }
};
