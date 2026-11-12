const fs = require('fs');
const path = require('path');

const srcDir = 'C:/Users/sp/.gemini/antigravity/brain/03c56fd1-5b41-4817-bf12-6435aa7c9df5/.user_uploaded';
const destDir = path.join(__dirname, '../public/images/products');
const dbPath = path.join(__dirname, '../data/db.json');

const copies = [
  { src: 'media_1794464223267_3c5f02a6.jpg', dest: 'java-fern-coconut.jpg' },
  { src: 'media_1794464223292_19dd9a98.jpg', dest: 'hygrophila-sunset-hd.jpg' },
  { src: 'media_1794464223287_1bae45ca.webp', dest: 'cryptocoryne-pot.webp' },
  { src: 'media_1794464223299_8e8785a6.webp', dest: 'ludwigia-glandulosa.webp' },
  { src: 'media_1794464223313_90d8ed59.jpg', dest: 'blyxa-japonica-hand.jpg' },
  { src: 'media_1794464223809_21886624.jpg', dest: 'peelia-moss-rock.jpg' },
  { src: 'media_1794464200780_8a7bfe19.jpg', dest: 'vallisneria-spiralis-tank.jpg' },
  { src: 'media_1794464200759_1147aa9d.jpg', dest: 'vallisneria-corkscrew-hand.jpg' }
];

console.log('Copying refined photos...');
copies.forEach(c => {
  const src = path.join(srcDir, c.src);
  const dest = path.join(destDir, c.dest);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${c.src} -> ${c.dest}`);
  } else {
    console.warn(`Source not found: ${src}`);
  }
});

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// Refine product galleries and images
// Product #24: Peelia Moss
const p24 = db.products.find(p => p.id === 24);
if (p24) {
  p24.image = '/images/products/peelia-moss-rock.jpg';
  p24.images = ['/images/products/peelia-moss-rock.jpg', '/images/products/peelia-moss.webp'];
  console.log('Updated #24 Peelia Moss');
}

// Product #27: Blyxa Japonica
const p27 = db.products.find(p => p.id === 27);
if (p27) {
  p27.images = ['/images/products/blyxa-japonica.webp', '/images/products/blyxa-japonica-hand.jpg'];
  console.log('Updated #27 Blyxa Japonica');
}

// Product #34: Ludwigia
const p34 = db.products.find(p => p.id === 34);
if (p34) {
  p34.images = ['/images/products/ludwigia-repens.jpg', '/images/products/ludwigia-glandulosa.webp'];
  console.log('Updated #34 Ludwigia');
}

// Product #36: Vallisneria
const p36 = db.products.find(p => p.id === 36);
if (p36) {
  p36.image = '/images/products/vallisneria-spiralis-tank.jpg';
  p36.images = [
    '/images/products/vallisneria-spiralis-tank.jpg',
    '/images/products/vallisneria-corkscrew-hand.jpg',
    '/images/products/vallisneria-jungle.jpg'
  ];
  console.log('Updated #36 Vallisneria');
}

// Product #42: Cryptocoryne
const p42 = db.products.find(p => p.id === 42);
if (p42) {
  p42.images = ['/images/products/cryptocoryne-green.webp', '/images/products/cryptocoryne-pot.webp'];
  console.log('Updated #42 Cryptocoryne');
}

// Product #48: Giant Vallisneria
const p48 = db.products.find(p => p.id === 48);
if (p48) {
  p48.images = ['/images/products/vallisneria-jungle.jpg', '/images/products/vallisneria-spiralis-tank.jpg'];
  console.log('Updated #48 Giant Vallisneria');
}

// Product #52: Hygrophila
const p52 = db.products.find(p => p.id === 52);
if (p52) {
  p52.images = [
    '/images/products/hygrophila-pinnatifida.jpg',
    '/images/products/hygrophila-sunset-hd.jpg',
    '/images/products/hygrophila-corymbosa.jpg',
    '/images/products/hygrophila-difformis.jpg'
  ];
  console.log('Updated #52 Hygrophila');
}

// Product #68: Java Fern
const p68 = db.products.find(p => p.id === 68);
if (p68) {
  p68.images = [
    '/images/products/java-fern.jpg',
    '/images/products/java-fern-coconut.jpg',
    '/images/products/java-fern-windelov.jpg',
    '/images/products/java-fern-needle-leaf.webp'
  ];
  console.log('Updated #68 Java Fern');
}

// Product #69: Java Moss Coconut Shell
const p69 = db.products.find(p => p.id === 69);
if (p69) {
  p69.images = [
    '/images/products/java-moss-coconut.jpg',
    '/images/products/java-fern-coconut.jpg'
  ];
  console.log('Updated #69 Java Moss');
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
console.log('Finished refining latest photos in db.json!');

