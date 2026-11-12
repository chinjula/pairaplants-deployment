const fs = require('fs');
const path = require('path');

const srcDir = 'C:/Users/sp/.gemini/antigravity/brain/03c56fd1-5b41-4817-bf12-6435aa7c9df5/.user_uploaded';
const destDir = path.join(__dirname, '../public/images/products');
const dbPath = path.join(__dirname, '../data/db.json');

// File copy mappings
const copies = [
  { src: 'media_1794464110520_7bb0cc86.jpg', dest: 'stone-catfish-hara-jerdoni.jpg' },
  { src: 'media_1794464123567_84bedd3f.webp', dest: 'peelia-moss.webp' },
  { src: 'media_1794464110483_4c6c8f8e.jpg', dest: 'hc-cuba-carpet.jpg' },
  { src: 'media_1794464110485_564279cd.jpg', dest: 'hc-cuba-pot.jpg' },
  { src: 'media_1794464110471_7bf4dc14.webp', dest: 'hydrocotyle-leucocephala.webp' },
  { src: 'media_1794464123571_2d32be58.webp', dest: 'hydrocotyle-verticillata.webp' },
  { src: 'media_1794464123629_49851814.jpg', dest: 'hygrophila-pinnatifida.jpg' },
  { src: 'media_1794464123547_29217948.jpg', dest: 'hygrophila-sunset.jpg' },
  { src: 'media_1794464123590_087e1a02.jpg', dest: 'hygrophila-corymbosa.jpg' },
  { src: 'media_1794464123547_572508ca.jpg', dest: 'hygrophila-difformis.jpg' },
  { src: 'media_1794464110556_48e37a58.jpg', dest: 'lobelia-cardinalis.jpg' },
  { src: 'media_1794464110475_df75bdc1.jpg', dest: 'mayaca-fluviatilis.jpg' },
  { src: 'media_1794464170498_bf6a0e5b.jpg', dest: 'guppy-grass-najas.jpg' },
  { src: 'media_1794464170743_c213964d.jpg', dest: 'guppy-grass-aquarium.jpg' },
  { src: 'media_1794464214803_141a402e.jpg', dest: 'nitella-aquatic.jpg' },
  { src: 'media_1794464178827_aa685381.jpg', dest: 'nuphar-japonica.jpg' },
  { src: 'media_1794464178818_cd02c746.jpg', dest: 'nymphoides-indica-snowflake.jpg' },
  { src: 'media_1794464214721_0e1cf239.jpg', dest: 'parrot-feather.jpg' },
  { src: 'media_1794464170749_8daedd77.webp', dest: 'parrot-feather-red.webp' },
  { src: 'media_1794464200773_8d2c2c9b.jpg', dest: 'pogo-octopus.jpg' },
  { src: 'media_1794464123602_76edf7f8.jpg', dest: 'polygonum-sp-pink.jpg' },
  { src: 'media_1794464188858_f48e099d.webp', dest: 'polygonum-pink-stem.webp' },
  { src: 'media_1794464188876_948910f7.jpg', dest: 'potamogeton-gayi.jpg' },
  { src: 'media_1794464170532_4557b1f0.jpg', dest: 'red-banana-plant.jpg' },
  { src: 'media_1794464188776_dec77ecf.jpg', dest: 'red-tiger-lily.jpg' },
  { src: 'media_1794464200610_ef555117.jpg', dest: 'strogon-sp-brown.jpg' },
  { src: 'media_1794464214742_a8a0b577.jpg', dest: 'utricularia-graminifolia.jpg' },
  { src: 'media_1794464141182_1482f453.jpg', dest: 'java-fern.jpg' },
  { src: 'media_1794464141183_0dcffddb.jpg', dest: 'java-fern-windelov.jpg' },
  { src: 'media_1794464141185_d8d6a276.webp', dest: 'java-fern-needle-leaf.webp' },
  { src: 'media_1794464110549_85cdac23.jpg', dest: 'java-moss-coconut.jpg' },
  { src: 'media_1794464188862_85f56c31.jpg', dest: 'trident-fern.jpg' },
  { src: 'media_1794464170737_98373b56.jpg', dest: 'jade-lotus-moss.jpg' },
  { src: 'media_1794464188858_405ef66e.jpg', dest: 'riccia-coral-moss.jpg' },
  { src: 'media_1794464200743_1b1098d1.jpg', dest: 'riccia-fluitans-bush.jpg' },
  { src: 'media_1794464188845_5128798d.jpg', dest: 'red-root-floater.jpg' },
  { src: 'media_1794464200782_1748e7fd.jpg', dest: 'rosette-water-lettuce.jpg' },
  { src: 'media_1794464214778_6425461f.jpg', dest: 'salvinia-floater.jpg' },
  { src: 'media_1794464223313_90d8ed59.jpg', dest: 'water-hyacinth-flower.jpg' },
  { src: 'media_1794464223292_19dd9a98.jpg', dest: 'water-lettuce.jpg' },
  { src: 'media_1794464223287_1bae45ca.webp', dest: 'water-sprite.webp' },
  { src: 'media_1794464223299_8e8785a6.webp', dest: 'water-sprite-tank.webp' },
  { src: 'media_1794464178790_13b96489.webp', dest: 'peace-lily-cultivated.webp' },
  { src: 'media_1794464110555_aadba86b.jpg', dest: 'water-poppy-blossom.jpg' }
];

console.log('Copying images...');
copies.forEach(c => {
  const s = path.join(srcDir, c.src);
  const d = path.join(destDir, c.dest);
  if (fs.existsSync(s)) {
    fs.copyFileSync(s, d);
    console.log(`Copied ${c.src} -> ${c.dest}`);
  } else {
    console.warn(`Missing: ${s}`);
  }
});

// Also create golden-top-minnow
const minnowSrc = path.join(destDir, 'golden-mountain-minnow.webp');
const minnowDest = path.join(destDir, 'golden-top-minnow.webp');
if (fs.existsSync(minnowSrc) && !fs.existsSync(minnowDest)) {
  fs.copyFileSync(minnowSrc, minnowDest);
  console.log('Created golden-top-minnow.webp');
}

// Update db.json
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const productUpdates = {
  4: {
    image: '/images/products/golden-top-minnow.webp',
    images: ['/images/products/golden-top-minnow.webp']
  },
  10: {
    image: '/images/products/stone-catfish-hara-jerdoni.jpg',
    images: ['/images/products/stone-catfish-hara-jerdoni.jpg']
  },
  24: {
    image: '/images/products/peelia-moss.webp',
    images: ['/images/products/peelia-moss.webp']
  },
  30: {
    image: '/images/products/hc-cuba-carpet.jpg',
    images: ['/images/products/hc-cuba-carpet.jpg', '/images/products/hc-cuba-pot.jpg']
  },
  51: {
    image: '/images/products/hydrocotyle-leucocephala.webp',
    images: ['/images/products/hydrocotyle-leucocephala.webp', '/images/products/hydrocotyle-verticillata.webp']
  },
  52: {
    image: '/images/products/hygrophila-pinnatifida.jpg',
    images: [
      '/images/products/hygrophila-pinnatifida.jpg',
      '/images/products/hygrophila-sunset.jpg',
      '/images/products/hygrophila-corymbosa.jpg',
      '/images/products/hygrophila-difformis.jpg'
    ]
  },
  53: {
    image: '/images/products/lobelia-cardinalis.jpg',
    images: ['/images/products/lobelia-cardinalis.jpg']
  },
  54: {
    image: '/images/products/mayaca-fluviatilis.jpg',
    images: ['/images/products/mayaca-fluviatilis.jpg']
  },
  56: {
    image: '/images/products/guppy-grass-najas.jpg',
    images: ['/images/products/guppy-grass-najas.jpg', '/images/products/guppy-grass-aquarium.jpg']
  },
  57: {
    image: '/images/products/nitella-aquatic.jpg',
    images: ['/images/products/nitella-aquatic.jpg']
  },
  58: {
    image: '/images/products/nuphar-japonica.jpg',
    images: ['/images/products/nuphar-japonica.jpg']
  },
  59: {
    image: '/images/products/nymphoides-indica-snowflake.jpg',
    images: ['/images/products/nymphoides-indica-snowflake.jpg']
  },
  60: {
    image: '/images/products/parrot-feather.jpg',
    images: ['/images/products/parrot-feather.jpg', '/images/products/parrot-feather-red.webp']
  },
  61: {
    image: '/images/products/pogo-octopus.jpg',
    images: ['/images/products/pogo-octopus.jpg']
  },
  62: {
    image: '/images/products/polygonum-sp-pink.jpg',
    images: ['/images/products/polygonum-sp-pink.jpg', '/images/products/polygonum-pink-stem.webp']
  },
  63: {
    image: '/images/products/potamogeton-gayi.jpg',
    images: ['/images/products/potamogeton-gayi.jpg']
  },
  64: {
    image: '/images/products/red-banana-plant.jpg',
    images: ['/images/products/red-banana-plant.jpg']
  },
  65: {
    image: '/images/products/red-tiger-lily.jpg',
    images: ['/images/products/red-tiger-lily.jpg']
  },
  66: {
    image: '/images/products/strogon-sp-brown.jpg',
    images: ['/images/products/strogon-sp-brown.jpg']
  },
  67: {
    image: '/images/products/utricularia-graminifolia.jpg',
    images: ['/images/products/utricularia-graminifolia.jpg']
  },
  68: {
    image: '/images/products/java-fern.jpg',
    images: [
      '/images/products/java-fern.jpg',
      '/images/products/java-fern-windelov.jpg',
      '/images/products/java-fern-needle-leaf.webp'
    ]
  },
  69: {
    image: '/images/products/java-moss-coconut.jpg',
    images: ['/images/products/java-moss-coconut.jpg']
  },
  70: {
    image: '/images/products/trident-fern.jpg',
    images: ['/images/products/trident-fern.jpg']
  },
  71: {
    image: '/images/products/jade-lotus-moss.jpg',
    images: ['/images/products/jade-lotus-moss.jpg']
  },
  72: {
    image: '/images/products/riccia-coral-moss.jpg',
    images: ['/images/products/riccia-coral-moss.jpg', '/images/products/riccia-fluitans-bush.jpg']
  },
  75: {
    image: '/images/products/water-poppy.jpg',
    images: ['/images/products/water-poppy.jpg', '/images/products/water-poppy-blossom.jpg']
  },
  78: {
    image: '/images/products/peace-lily-aquatic.jpg',
    images: [
      '/images/products/peace-lily-aquatic.jpg',
      '/images/products/aquatic-cultivated-collection.jpg',
      '/images/products/peace-lily-cultivated.webp'
    ]
  },
  79: {
    image: '/images/products/red-root-floater.jpg',
    images: ['/images/products/red-root-floater.jpg']
  },
  80: {
    image: '/images/products/rosette-water-lettuce.jpg',
    images: ['/images/products/rosette-water-lettuce.jpg']
  },
  81: {
    image: '/images/products/salvinia-floater.jpg',
    images: ['/images/products/salvinia-floater.jpg']
  },
  82: {
    image: '/images/products/water-hyacinth-flower.jpg',
    images: ['/images/products/water-hyacinth-flower.jpg']
  },
  83: {
    image: '/images/products/water-lettuce.jpg',
    images: ['/images/products/water-lettuce.jpg']
  },
  84: {
    image: '/images/products/water-sprite.webp',
    images: ['/images/products/water-sprite.webp', '/images/products/water-sprite-tank.webp']
  }
};

let updatedCount = 0;
db.products.forEach(p => {
  if (productUpdates[p.id]) {
    const u = productUpdates[p.id];
    p.image = u.image;
    p.images = u.images;
    updatedCount++;
    console.log(`Updated product #${p.id} (${p.name}): ${p.image}`);
  }
});

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
console.log(`Successfully updated ${updatedCount} products in db.json!`);

// Check remaining
const remaining = db.products.filter(p => p.image.includes('hero-aquarium.jpg'));
console.log(`Total products: ${db.products.length}`);
console.log(`Completed with real photos: ${db.products.length - remaining.length}`);
console.log(`Remaining pending: ${remaining.length}`);
if (remaining.length > 0) {
  console.log('Still pending:', remaining.map(p => `${p.id}: ${p.name}`));
}
