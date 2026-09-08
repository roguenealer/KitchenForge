(function (root) {
  'use strict';
  const key = value => String(value || '').toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = value => String(value || '').replace(/[<>\x00-\x1f]/g, '').trim().slice(0, 100);
  const localDate = (date = new Date()) => date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
  // Date-only storage represents a calendar date, never UTC midnight in a local timezone.
  function calendarDay(value) {
    const parts = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) return NaN;
    const ms = Date.UTC(Number(parts[1]), Number(parts[2])-1, Number(parts[3]));
    return new Date(ms).toISOString().slice(0,10) === value ? ms / 86400000 : NaN;
  }
  const aliases = { 'strawberries':'strawberry', 'blueberries':'blueberry', 'raspberries':'raspberry', 'potatoes':'potato', 'tomatoes':'tomato', 'eggs':'egg', 'apples':'apple', 'bananas':'banana', 'carrots':'carrot', 'grapes':'grape', 'mushrooms':'mushroom' };
  const canonical = value => aliases[key(value)] || key(value);
  function parse(payload, vocabulary, mode) {
    const words = [...new Set(vocabulary.map(key))].sort((a,b) => b.length-a.length);
    const candidates = [], seen = new Set();
    const add = (name, source) => {
      const id = canonical(name);
      if (seen.has(id) || candidates.length >= 40) return;
      seen.add(id);
      candidates.push({name: name.replace(/\b\w/g, c => c.toUpperCase()), qty:1, unit:'pcs', source});
    };
    const find = line => words.find(word => (' '+line+' ').includes(' '+word+' '));
    const lines = String(payload.text || '').slice(0, 30000).split(/\r?\n/);
    for (const raw of lines) {
      // A package's ingredient/allergen panel must not become separate groceries.
      const line = key(raw).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
      if (/^(ingredients?|contains?|allergens?|nutrition|nutritional)\b/.test(line)) {
        if (mode === 'food') break;
        continue;
      }
      if (/\b(subtotal|total|tax|change|cash|visa|mastercard|savings|coupon|discount|balance|payment|calories|protein|sodium|cholesterol|serving|distributed|manufactured|www)\b/.test(line)) continue;
      const match = find(line);
      if (match) {
        add(match, 'Read from photo');
        // Front-of-package OCR: one product, not all ingredients or claims.
        if (mode === 'food') break;
      }
    }
    if (mode !== 'receipt' && candidates.length === 0) {
      const labels = Array.isArray(payload.labels) ? payload.labels : [];
      for (const label of labels.slice().sort((a,b) => b.confidence-a.confidence)) {
        const name = key(label.name);
        if (Number(label.confidence) >= 0.75 && words.includes(name)) { add(name, 'Photo suggestion'); break; }
      }
    }
    return candidates;
  }
  function validate(items) {
    if (!items.length) throw new Error('Add an item first.');
    return items.map(item => {
      const next = {...item, name:clean(item.name), unit:clean(item.unit), qty:Number(item.qty), expDays:Number(item.expDays), cost:Number(item.cost || 0)};
      if (!next.name || !next.unit || !Number.isFinite(next.qty) || next.qty <= 0 || next.qty > 100000 || !Number.isInteger(next.expDays) || next.expDays < -3650 || next.expDays > 3650 || !Number.isFinite(next.cost) || next.cost < 0 || next.cost > 1000000) throw new Error('Check each name, unit, quantity, days remaining, and cost.');
      return next;
    });
  }
  function apply(pantry, items, today, makeId) {
    const next = pantry.map(item => ({...item}));
    const purchases = [];
    for (const item of validate(items)) {
      const target = item.targetId == null ? null : next.find(p => String(p.id) === String(item.targetId));
      if (item.action === 'replace') {
        if (!target) throw new Error('That pantry item no longer exists. Select Add as a new item.');
        if (key(target.name) !== key(item.name) || key(target.unit) !== key(item.unit)) throw new Error('The name or unit changed. Add as a new item or select the matching pantry item.');
        // A recount must not reset an old item to a fresh purchase date or charge it again.
        target.qty = item.qty;
        target.expDays = item.expDays;
        const elapsed = calendarDay(today) - calendarDay(target.addedDate || today);
        if (!Number.isFinite(elapsed)) throw new Error('That pantry item has an invalid date. Add it as a new item.');
        target._origExpDays = elapsed + item.expDays;
        target.cost = item.cost;
      } else {
        next.push({id:makeId(),name:item.name,emoji:item.emoji || '🍏',qty:item.qty,unit:item.unit,cat:item.cat || 'pantry',expDays:item.expDays,cost:item.cost,addedDate:today});
        purchases.push(item);
      }
    }
    return {pantry:next,purchases};
  }
  const api = {key,escape,clean,localDate,calendarDay,parse,validate,apply};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KitchenForgePhoto = api;
})(typeof window !== 'undefined' ? window : globalThis);
