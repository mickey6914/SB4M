import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectSource,
  parseListingHtml,
  shopifyProductToListing,
  stripTags,
} from '../src/ingest/parse.js';

const BASE = 'https://shop.example.com/listing/123/ceramic-mug';

test('JSON-LD product page parses title, description, images, price', () => {
  const html = `<html><head>
    <script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"BreadcrumbList"},
        {"@type":"Product","name":"Ceramic Mug Gift Set","description":"A &amp; B <b>mug</b> set.",
         "image":["/img/1.jpg",{"url":"https://cdn.example.com/2.jpg"}],
         "offers":{"@type":"Offer","price":"34.99","priceCurrency":"USD"}}
      ]}
    </script>
    <meta property="og:image" content="https://cdn.example.com/2.jpg">
  </head><body></body></html>`;
  const listing = parseListingHtml(html, BASE);
  assert.ok(listing);
  assert.equal(listing.title, 'Ceramic Mug Gift Set');
  assert.equal(listing.description, 'A & B mug set.');
  assert.deepEqual(listing.images, [
    'https://shop.example.com/img/1.jpg',
    'https://cdn.example.com/2.jpg',
  ]);
  assert.equal(listing.price, '34.99 USD');
});

test('Open Graph fallback works when no JSON-LD product exists', () => {
  const html = `<html><head>
    <meta property="og:title" content="Linen Table Runner" />
    <meta name="description" content="Hand-loomed linen." />
    <meta property="og:image" content="https://cdn.example.com/runner-a.jpg" />
    <meta property="og:image" content="https://cdn.example.com/runner-b.jpg" />
  </head></html>`;
  const listing = parseListingHtml(html, BASE);
  assert.ok(listing);
  assert.equal(listing.title, 'Linen Table Runner');
  assert.equal(listing.description, 'Hand-loomed linen.');
  assert.equal(listing.images.length, 2);
});

test('a page with no product data returns null (not garbage)', () => {
  const html = '<html><head><title>Home</title></head><body><img src="/logo.png"></body></html>';
  assert.equal(parseListingHtml(html, BASE), null);
});

test('malformed JSON-LD blocks are skipped, valid one still wins', () => {
  const html = `<html><head>
    <script type="application/ld+json">{not json</script>
    <script type="application/ld+json">{"@type":"Product","name":"Mug","image":"/a.jpg"}</script>
  </head></html>`;
  const listing = parseListingHtml(html, BASE);
  assert.ok(listing);
  assert.equal(listing.title, 'Mug');
});

test('Shopify product JSON converts, strips body_html, dedupes images', () => {
  const json = {
    product: {
      title: 'Printable Wall Art Bundle',
      body_html: '<p>Twelve prints.</p><p>Instant download.</p>',
      images: [{ src: 'https://cdn.shopify.com/a.jpg' }, { src: 'https://cdn.shopify.com/a.jpg' }],
      variants: [{ price: '12.00' }],
    },
  };
  const listing = shopifyProductToListing(json, 'https://store.example.com/products/wall-art');
  assert.ok(listing);
  assert.equal(listing.title, 'Printable Wall Art Bundle');
  assert.match(listing.description, /Twelve prints\.\s*\n?Instant download\./);
  assert.deepEqual(listing.images, ['https://cdn.shopify.com/a.jpg']);
  assert.equal(listing.price, '12.00');
});

test('source detection: etsy, amazon, other', () => {
  assert.equal(detectSource(new URL('https://www.etsy.com/listing/1482093/x')), 'etsy');
  assert.equal(detectSource(new URL('https://www.amazon.com/dp/B0ABC')), 'amazon');
  assert.equal(detectSource(new URL('https://www.amazon.co.uk/dp/B0ABC')), 'amazon');
  assert.equal(detectSource(new URL('https://shop.example.com/products/mug')), 'other');
});

test('stripTags keeps text readable', () => {
  assert.equal(stripTags('<p>Hello&nbsp;<b>world</b></p>'), 'Hello world');
});
