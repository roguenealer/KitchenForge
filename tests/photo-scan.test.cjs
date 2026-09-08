const {test} = require('node:test');
const assert = require('node:assert/strict');
const scan = require('../photo-scan.js');
const vocab = ['milk','almond milk','egg','eggs','bread','apple','apples','rice','chicken','sugar'];
test('receipt reads real grocery names, ignoring totals and no substring matches', () => {
  const items = scan.parse({text:'GROCERY STORE\nALMOND MILK 3.99\nEGGS 2.50\nTOTAL 6.49\nRICE DISCOUNT 0.50\nPINEAPPLE 3.00'},vocab,'receipt');
  assert.deepEqual(items.map(i => i.name),['Almond Milk','Eggs']);
  assert.equal(items[0].qty,1); // Price is not a quantity.
});
test('blank and nonfood images never generate demo groceries', () => {
  assert.deepEqual(scan.parse({text:'',labels:[{name:'Furniture',confidence:0.99}]},vocab,'food'),[]);
  assert.deepEqual(scan.parse({text:'Nutrition Facts\nIngredients: milk, sugar'},vocab,'food'),[]);
});
test('food label produces a single suggestion and does not import ingredients', () => {
  assert.deepEqual(scan.parse({text:'ALMOND MILK\nIngredients\nSugar\nMilk'},vocab,'food').map(i => i.name),['Almond Milk']);
});
test('classification uses only a specific confident food and not receipt labels', () => {
  const payload = {labels:[{name:'food',confidence:.99},{name:'apple',confidence:.8},{name:'rice',confidence:.6}]};
  assert.deepEqual(scan.parse(payload,vocab,'food').map(i => i.name),['Apple']);
  assert.deepEqual(scan.parse(payload,vocab,'receipt'),[]);
});
test('receipt deduplicates plural aliases', () => {
  assert.equal(scan.parse({text:'APPLE\nAPPLES'},vocab,'receipt').length,1);
});
test('new purchases are separate from existing lots', () => {
  const existing = [{id:1,name:'Milk',qty:2,unit:'pcs',expDays:2,cost:4,addedDate:'2026-09-06',_origExpDays:4}];
  const result = scan.apply(existing,[{name:'Milk',qty:1,unit:'pcs',expDays:7,cost:3}], '2026-09-08',()=>2);
  assert.equal(result.pantry.length,2); assert.equal(result.purchases.length,1);
  assert.deepEqual(result.pantry[0],existing[0]); assert.equal(existing.length,1);
});
test('recount replaces quantity, preserves expiry through restart and never adds spending', () => {
  const existing = [{id:1,name:'Milk',qty:2,unit:'pcs',expDays:2,cost:4,addedDate:'2026-09-06',_origExpDays:4}];
  const result = scan.apply(existing,[{name:'Milk',qty:1,unit:'pcs',expDays:2,cost:4,action:'replace',targetId:1}], '2026-09-08',()=>2);
  assert.equal(result.pantry[0].qty,1); assert.equal(result.purchases.length,0);
  assert.equal(result.pantry[0]._origExpDays,4); assert.equal(result.pantry[0].addedDate,existing[0].addedDate);
  assert.equal(existing[0].qty,2);
});
test('invalid/stale review rejects the whole update', () => {
  const existing = [{id:1,name:'Milk',unit:'pcs'}];
  for (const patch of [{qty:0},{qty:NaN},{cost:-1},{expDays:1.5},{name:''},{action:'replace',targetId:2},{action:'replace',targetId:1,unit:'kg'}]) {
    assert.throws(()=>scan.apply(existing,[{name:'Milk',unit:'pcs',qty:1,cost:0,expDays:7,...patch}],'2026-09-08',()=>2));
    assert.equal(existing.length,1);
  }
});
test('review escapes OCR/typed markup', () => {
  assert.equal(scan.escape('<img src=x onerror="alert(1)">'),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
