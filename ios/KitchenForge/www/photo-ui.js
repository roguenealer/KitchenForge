'use strict';
let pendingPhotoScan = null;
let photoScanTimer = null;

function persistPhotoReview() {
  try {
    if (addedItems.length) localStorage.setItem('kf_photo_review', JSON.stringify(addedItems));
    else localStorage.removeItem('kf_photo_review');
  } catch (_) { scanStatus('Your review cannot be kept if the app closes. Free some device storage before taking a photo.'); return false; }
  return true;
}
function armPhotoTimeout() {
  clearTimeout(photoScanTimer);
  photoScanTimer = setTimeout(() => { finishPhotoScan(); scanStatus('The photo request timed out. Close the camera or photo picker, then try again.'); }, Math.max(1,180000-(Date.now()-pendingPhotoScan.createdAt)));
}

function scanStatus(message) {
  document.getElementById('scan-status').textContent = message;
}
function finishPhotoScan() {
  clearTimeout(photoScanTimer);
  pendingPhotoScan = null;
  try { localStorage.removeItem('kf_photo_pending'); } catch (_) {}
  document.querySelectorAll('[data-photo-scan]').forEach(button => button.disabled = false);
}
function requestPhotoScan(source, mode) {
  if (pendingPhotoScan) return;
  const android = window.KitchenForgeScanner;
  const ios = window.webkit?.messageHandlers?.kitchenForgeScanner;
  if (!android?.scanPhoto && !ios?.postMessage) {
    scanStatus('Photo recognition is available in the iOS and Android apps. You can add items with the Manual tab here.');
    return;
  }
  if (!persistPhotoReview()) return;
  pendingPhotoScan = {requestId: 'scan-' + Date.now() + '-' + Math.random().toString(36).slice(2), source, mode, createdAt:Date.now()};
  try { localStorage.setItem('kf_photo_pending',JSON.stringify(pendingPhotoScan)); }
  catch (_) { finishPhotoScan(); scanStatus('Unable to keep this photo request. Free device storage and try again.'); return; }
  document.querySelectorAll('[data-photo-scan]').forEach(button => button.disabled = true);
  scanStatus('Choose a clear photo. We will read it on your phone.');
  armPhotoTimeout();
  try {
    if (android?.scanPhoto) android.scanPhoto(JSON.stringify(pendingPhotoScan));
    else ios.postMessage(pendingPhotoScan);
  } catch (_) { finishPhotoScan(); scanStatus('Unable to open the photo scanner. Please try again.'); }
}
window.onKitchenForgeScanResult = function (payload) {
  if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch (_) { return; } }
  if (!payload || payload.requestId !== pendingPhotoScan?.requestId) return;
  const mode = pendingPhotoScan.mode;
  finishPhotoScan();
  if (payload.cancelled) { scanStatus('Photo cancelled. Your items have not changed.'); return; }
  if (payload.error) { scanStatus(String(payload.error).slice(0, 300)); return; }
  const candidates = KitchenForgePhoto.parse(payload, Object.keys(shelfLifeDB), mode);
  if (!candidates.length) {
    scanStatus('No food identified. Try a close-up of a food label or a clear receipt, or add the item manually.');
    return;
  }
  addedItems.push(...candidates.map(item => ({...item,emoji:'🍏',cost:0,expDays:getShelfLife(item.name) || 7,cat:detectCategory(item.name),action:'new'})));
  renderAddedItems();
  scanStatus('Review ' + candidates.length + ' suggestion' + (candidates.length === 1 ? '' : 's') + ' below. Quantity starts at 1; check the name, amount, and expiry before saving.');
};

function updateReviewItem(index, field, value) {
  const item = addedItems[index];
  if (!item) return;
  item[field] = ['qty','expDays','cost'].includes(field) ? Number(value) : KitchenForgePhoto.clean(value);
  if (field === 'name' || field === 'unit') {
    item.action = 'new'; delete item.targetId;
    item.cat = detectCategory(item.name);
    renderAddedItems();
  }
  persistPhotoReview();
}
function selectReviewAction(index, value) {
  const item = addedItems[index];
  if (value === 'new') { item.action = 'new'; delete item.targetId; }
  else {
    const target = pantryItems.find(p => String(p.id) === value);
    if (!target) return;
    item.action = 'replace'; item.targetId = target.id;
    item.qty = target.qty; item.expDays = target.expDays; item.cost = target.cost || 0;
  }
  renderAddedItems();
}
function renderAddedItems() {
  persistPhotoReview();
  const e = KitchenForgePhoto.escape;
  const list = document.getElementById('added-items-list');
  const btn = document.getElementById('save-pantry-btn');
  btn.disabled = addedItems.length === 0;
  btn.textContent = addedItems.length ? `Save ${addedItems.length} reviewed item${addedItems.length === 1 ? '' : 's'}` : 'Save to Pantry';
  list.innerHTML = addedItems.map((item, i) => {
    const matches = pantryItems.filter(p => KitchenForgePhoto.key(p.name) === KitchenForgePhoto.key(item.name) && KitchenForgePhoto.key(p.unit) === KitchenForgePhoto.key(item.unit));
    return `<div class="photo-review-item">
      <div class="review-heading"><strong>${e(item.source || 'Review item')}</strong><button type="button" class="remove-btn" aria-label="Remove ${e(item.name)}" onclick="removeAddedItem(${i})">Remove</button></div>
      <label>Food name<input value="${e(item.name)}" maxlength="100" onchange="updateReviewItem(${i},'name',this.value)"></label>
      <div class="review-fields"><label>Quantity<input type="number" min="0.01" max="100000" step="any" value="${e(item.qty)}" onchange="updateReviewItem(${i},'qty',this.value)"></label>
      <label>Unit<input value="${e(item.unit)}" maxlength="30" onchange="updateReviewItem(${i},'unit',this.value)"></label></div>
      <div class="review-fields"><label>Days remaining<input type="number" min="-3650" max="3650" step="1" value="${e(item.expDays)}" onchange="updateReviewItem(${i},'expDays',this.value)"></label>
      <label>${item.action === 'replace' ? 'Total item value ($)' : 'Purchase cost ($)'}<input type="number" min="0" step="0.01" value="${e(item.cost || 0)}" onchange="updateReviewItem(${i},'cost',this.value)"></label></div>
      <label>Save action<select onchange="selectReviewAction(${i},this.value)"><option value="new" ${item.action !== 'replace' ? 'selected' : ''}>Add as a new item</option>${matches.map(p => `<option value="${e(p.id)}" ${item.action === 'replace' && String(item.targetId) === String(p.id) ? 'selected' : ''}>Update existing ${e(p.name)} (${e(p.qty)} ${e(p.unit)}, ${e(p.expDays)} days)</option>`).join('')}</select></label>
      <p class="review-note">${item.action === 'replace' ? 'Set the quantity now in your pantry. This does not add another purchase to spending.' : 'Expiry is an estimate. Check the package date and storage conditions.'}</p>
    </div>`;
  }).join('');
}
function saveToPantry() {
  if (!addedItems.length) return;
  try {
    const date = KitchenForgePhoto.localDate();
    const result = KitchenForgePhoto.apply(pantryItems, addedItems.map(i => ({...i,cat:detectCategory(i.name)})), date, () => Date.now() + Math.random());
    const nextSpending = spendingLog.map(entry => ({...entry,items:[...entry.items]}));
    const purchases = result.purchases;
    const batchCost = purchases.reduce((sum,item) => sum+item.cost,0);
    if (batchCost > 0) {
      const entry = nextSpending.find(e => e.date === date);
      if (entry) { entry.total += batchCost; entry.items.push(...purchases.map(i => i.name)); }
      else nextSpending.unshift({date,items:purchases.map(i => i.name),total:batchCost});
    }
    // Write first: storage failure must leave the review and in-memory pantry intact.
    const oldPantry = localStorage.getItem('kf_pantry'), oldSpending = localStorage.getItem('kf_spending');
    try {
      localStorage.setItem('kf_pantry',JSON.stringify(result.pantry));
      localStorage.setItem('kf_spending',JSON.stringify(nextSpending));
    } catch (error) {
      try {
        if (oldPantry === null) localStorage.removeItem('kf_pantry'); else localStorage.setItem('kf_pantry',oldPantry);
        if (oldSpending === null) localStorage.removeItem('kf_spending'); else localStorage.setItem('kf_spending',oldSpending);
      } catch (_) {}
      throw new Error('Storage is full or unavailable. Your review is still here; free space and try again.');
    }
    const count = addedItems.length;
    pantryItems.splice(0,pantryItems.length,...result.pantry);
    spendingLog.splice(0,spendingLog.length,...nextSpending);
    addedItems = [];
    renderAddedItems(); renderHome(); renderPantry(); renderRecipes(); renderSpending();
    scanStatus(''); navigateTo('pantry');
    showToast(count + ' reviewed item' + (count === 1 ? '' : 's') + ' saved.');
  } catch (error) { showToast(error.message); }
}
(function restorePhotoReview() {
  try {
    const draft = JSON.parse(localStorage.getItem('kf_photo_review') || '[]');
    if (Array.isArray(draft) && draft.length && draft.length <= 100) addedItems = KitchenForgePhoto.validate(draft);
    const request = JSON.parse(localStorage.getItem('kf_photo_pending') || 'null');
    if (request && typeof request.requestId === 'string' && ['camera','library'].includes(request.source) && ['food','receipt'].includes(request.mode) && Number.isFinite(request.createdAt) && Date.now()-request.createdAt < 180000 && Date.now() >= request.createdAt) {
      pendingPhotoScan = request;
      document.querySelectorAll('[data-photo-scan]').forEach(button => button.disabled = true);
      armPhotoTimeout();
      scanStatus('Waiting for your photo. Finish or cancel the open camera or photo picker.');
    } else localStorage.removeItem('kf_photo_pending');
  } catch (_) { /* A damaged draft must not prevent the existing pantry opening. */ }
})();
renderAddedItems();
