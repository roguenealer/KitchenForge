const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the actual scripts and expiry/spending render functions in a western
// timezone, where treating a stored calendar date as UTC loses a day.
process.env.TZ = 'America/New_York';
const project = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(project, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const scanner = fs.readFileSync(path.join(project, 'photo-scan.js'), 'utf8');
const ui = fs.readFileSync(path.join(project, 'photo-ui.js'), 'utf8');
function appFunction(name) {
  const match = html.match(new RegExp('^function ' + name + '\\([^]*?^\\}', 'm'));
  assert.ok(match, 'App function is present: ' + name);
  return match[0];
}
const vocabulary = html.match(/^const shelfLifeDB = \{[^]*?^\};/m)?.[0];
assert.ok(vocabulary, 'Use the app food vocabulary rather than a test substitute');
const clone = value => JSON.parse(JSON.stringify(value));

function createHarness(options = {}) {
  let instant = options.instant || '2026-09-08T13:00:00-04:00';
  const NativeDate = Date;
  class ClockDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return new NativeDate(instant).getTime(); }
  }
  const records = new Map(Object.entries(options.store || {
    kf_pantry: JSON.stringify(options.pantry || []),
    kf_spending: JSON.stringify(options.spending || [])
  }));
  let writes = 0;
  const storage = {
    getItem: key => records.has(key) ? records.get(key) : null,
    setItem(key, value) {
      if (key === 'kf_pantry' || key === 'kf_spending') {
        writes++;
        if (writes === options.failWrite) throw new Error('QuotaExceededError');
      }
      records.set(key, String(value));
    },
    removeItem: key => records.delete(key),
    snapshot: () => Object.fromEntries(records)
  };
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {textContent:'', innerHTML:'', disabled:false, style:{}});
    return nodes.get(id);
  };
  const buttons = Array.from({length:4}, () => ({disabled:false}));
  const timers = new Map();
  let timerID = 0;
  const requests = [], toasts = [], navigations = [];
  const context = vm.createContext({
    Date: ClockDate,
    localStorage: storage,
    document: {
      getElementById: node,
      querySelectorAll: selector => selector === '[data-photo-scan]' ? buttons : []
    },
    setTimeout(callback) { const id = ++timerID; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    renderHome() {}, renderPantry() {}, renderRecipes() {},
    showToast: message => toasts.push(message),
    navigateTo: screen => navigations.push(screen)
  });
  context.window = context;
  if (options.native === 'ios') {
    context.webkit = {messageHandlers:{kitchenForgeScanner:{postMessage: payload => requests.push(clone(payload))}}};
  } else if (options.native !== 'none') {
    context.KitchenForgeScanner = {scanPhoto: payload => requests.push(JSON.parse(payload))};
  }
  const run = code => vm.runInContext(code, context);
  run(scanner);
  run(`const pantryItems = JSON.parse(localStorage.getItem('kf_pantry') || '[]');
       const spendingLog = JSON.parse(localStorage.getItem('kf_spending') || '[]');
       let addedItems = [];`);
  run(vocabulary);
  for (const name of ['getShelfLife', 'detectCategory', 'recalcExpiry', 'renderSpending']) run(appFunction(name));
  run('recalcExpiry(); renderSpending();');
  run(ui);
  return {
    run, node, buttons, requests, toasts, navigations, storage,
    state: () => JSON.parse(run('JSON.stringify({pantry:pantryItems,spending:spendingLog,review:addedItems,pending:pendingPhotoScan})')),
    queue: items => run('addedItems.push(...' + JSON.stringify(items) + '); renderAddedItems();'),
    request(source = 'camera', mode = 'food') { run(`requestPhotoScan(${JSON.stringify(source)},${JSON.stringify(mode)})`); },
    respond: payload => context.onKitchenForgeScanResult(payload),
    scan(text = 'Milk', mode = 'food') {
      this.request('camera', mode);
      this.respond({requestId:requests.at(-1).requestId,text,labels:[]});
    },
    expireRequest() {
      for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
    },
    reload(nextInstant = instant) { return createHarness({...options,store:storage.snapshot(),instant:nextInstant,failWrite:undefined}); }
  };
}

const milk = {id:1,name:'Milk',emoji:'🥛',unit:'pcs',qty:2,cost:4,expDays:2,_origExpDays:4,addedDate:'2026-09-06',cat:'dairy'};
const milkSpending = {date:'2026-09-06',items:['Milk'],total:4};

for (const native of ['ios', 'android']) {
  test(native + ' bridge creates a review, ignores repeated callbacks, and never saves before review', () => {
    const app = createHarness({native});
    const before = app.storage.snapshot();
    app.request('library', 'receipt');
    app.request('camera', 'food');
    assert.equal(app.requests.length,1, 'A pending picker cannot be launched twice');
    assert.equal(app.requests[0].source,'library');
    assert.equal(app.requests[0].mode,'receipt');
    assert.ok(app.buttons.every(button => button.disabled));
    const result = {requestId:app.requests[0].requestId,text:'MILK 3.00\nBREAD 2.00\nTOTAL 5.00',labels:[]};
    app.respond(native === 'android' ? JSON.stringify(result) : result);
    app.respond(result);
    assert.deepEqual(app.state().review.map(item => item.name),['Milk','Bread']);
    assert.equal(app.state().pantry.length,0);
    assert.equal(app.storage.getItem('kf_pantry'),before.kf_pantry);
    assert.equal(app.storage.getItem('kf_spending'),before.kf_spending);
    assert.ok(app.buttons.every(button => !button.disabled));
    assert.equal(app.state().pending,null);
  });
}

test('unsupported web scanner leaves inventory and review unchanged', () => {
  const app = createHarness({native:'none',pantry:[milk]});
  const before = app.state();
  app.request();
  assert.deepEqual(app.state(),before);
  assert.equal(app.requests.length,0);
  assert.ok(app.buttons.every(button => !button.disabled));
  assert.match(app.node('scan-status').textContent,/iOS and Android apps/);
});

test('cancellation, a native error and stale callbacks preserve review and pantry', () => {
  const app = createHarness({pantry:[milk],spending:[milkSpending]});
  app.queue([{name:'Bread',unit:'pcs',qty:1,expDays:5,cost:2}]);
  const before = app.storage.snapshot();
  app.request();
  const cancelledID = app.requests.at(-1).requestId;
  app.respond({requestId:cancelledID,cancelled:true,text:'Milk'});
  assert.equal(app.state().review.length,1);
  assert.match(app.node('scan-status').textContent,/cancelled/);
  app.request();
  const nextID = app.requests.at(-1).requestId;
  app.respond({requestId:cancelledID,text:'Milk'});
  assert.equal(app.state().pending.requestId,nextID);
  app.respond({requestId:nextID,error:'Camera permission denied'});
  assert.equal(app.state().review.length,1);
  assert.equal(app.state().pending,null);
  assert.deepEqual(app.storage.snapshot(),before);
  assert.equal(app.node('scan-status').textContent,'Camera permission denied');
});

test('timeout releases controls and ignores a late camera result', () => {
  const app = createHarness();
  app.request();
  const id = app.requests.at(-1).requestId;
  app.expireRequest();
  assert.ok(app.buttons.every(button => !button.disabled));
  assert.match(app.node('scan-status').textContent,/timed out/);
  app.respond({requestId:id,text:'Milk'});
  assert.equal(app.state().review.length,0);
  assert.equal(app.state().pantry.length,0);
});

test('activity recreation restores unsaved review and receives the original pending callback once', () => {
  const app = createHarness();
  app.queue([{name:'Bread',unit:'pcs',qty:2,expDays:3,cost:4}]);
  app.request('library','receipt');
  const pending = app.requests.at(-1);
  const restored = app.reload('2026-09-08T13:00:30-04:00');
  assert.equal(restored.state().review[0].name,'Bread');
  assert.equal(restored.state().pending.requestId,pending.requestId);
  assert.ok(restored.buttons.every(button => button.disabled));
  restored.respond({requestId:pending.requestId,text:'MILK 3.00',labels:[]});
  restored.respond({requestId:pending.requestId,text:'MILK 3.00',labels:[]});
  assert.deepEqual(restored.state().review.map(item => item.name),['Bread','Milk']);
  assert.equal(restored.state().pending,null);
  assert.equal(restored.state().pantry.length,0);
  assert.equal(restored.storage.getItem('kf_photo_pending'),null);
  assert.deepEqual(restored.reload().state().review,restored.state().review);
});

test('expired pending metadata does not block a fresh scan after reopening the app', () => {
  const app = createHarness();
  app.request();
  const restored = app.reload('2026-09-08T13:04:00-04:00');
  assert.equal(restored.state().pending,null);
  assert.ok(restored.buttons.every(button => !button.disabled));
  restored.scan();
  assert.equal(restored.requests.length,1);
  assert.equal(restored.state().review[0].name,'Milk');
});

test('new photo purchase survives same-day reload with reviewed expiry and local evening spending', () => {
  const app = createHarness({instant:'2026-09-08T21:00:00-04:00'});
  app.scan();
  app.run("updateReviewItem(0,'expDays',7); updateReviewItem(0,'cost',3); saveToPantry();");
  assert.equal(app.state().review.length,0);
  assert.equal(app.state().pantry[0].addedDate,'2026-09-08');
  assert.equal(app.node('spend-today').textContent,'$3.00');
  assert.deepEqual(app.navigations,['pantry']);
  const reloaded = app.reload();
  assert.equal(reloaded.state().pantry[0].expDays,7);
  assert.equal(reloaded.node('spend-today').textContent,'$3.00');
  assert.equal(app.reload('2026-09-09T09:00:00-04:00').state().pantry[0].expDays,6);
});

test('expiry counts calendar days across the spring and fall daylight-saving changes', () => {
  for (const [start,sameDay,nextDay] of [
    ['2026-03-07T21:00:00-05:00','2026-03-07T23:00:00-05:00','2026-03-08T21:00:00-04:00'],
    ['2026-10-31T21:00:00-04:00','2026-10-31T23:00:00-04:00','2026-11-01T21:00:00-05:00']
  ]) {
    const app = createHarness({instant:start});
    app.scan(); app.run("updateReviewItem(0,'expDays',7); saveToPantry();");
    assert.equal(app.reload(sameDay).state().pantry[0].expDays,7);
    assert.equal(app.reload(nextDay).state().pantry[0].expDays,6);
  }
});

test('existing-item recount preserves purchase history and reviewed expiry through reload', () => {
  const app = createHarness({pantry:[milk],spending:[milkSpending]});
  app.scan();
  app.run("selectReviewAction(0,'1'); updateReviewItem(0,'qty',6); updateReviewItem(0,'expDays',7); updateReviewItem(0,'cost',10); saveToPantry();");
  assert.equal(app.state().pantry.length,1);
  assert.equal(app.state().pantry[0].qty,6);
  assert.equal(app.state().pantry[0].cost,10);
  assert.equal(app.state().pantry[0].addedDate,milk.addedDate);
  assert.deepEqual(app.state().spending,[milkSpending]);
  assert.equal(app.reload().state().pantry[0].expDays,7);
  assert.equal(app.reload('2026-09-09T09:00:00-04:00').state().pantry[0].expDays,6);
});

test('new purchase beside an existing lot adds a separate item and charges only the purchase', () => {
  const app = createHarness({pantry:[milk],spending:[milkSpending]});
  app.scan();
  app.run("updateReviewItem(0,'qty',1); updateReviewItem(0,'cost',3); saveToPantry();");
  assert.equal(app.state().pantry.length,2);
  assert.deepEqual(app.state().pantry[0],milk);
  assert.equal(app.state().pantry[1].qty,1);
  assert.equal(app.state().spending[0].total,3);
  assert.deepEqual(app.state().spending[1],milkSpending);
});

for (const failWrite of [1, 2]) {
  test('storage write ' + failWrite + ' failure rolls back persisted data and retains the review for retry', () => {
    const app = createHarness({pantry:[milk],spending:[milkSpending],failWrite});
    app.scan('Bread');
    app.run("updateReviewItem(0,'cost',3)");
    const beforeState = app.state(), beforeStorage = app.storage.snapshot();
    app.run('saveToPantry()');
    assert.deepEqual(app.state(),beforeState);
    assert.deepEqual(app.storage.snapshot(),beforeStorage);
    assert.deepEqual(app.navigations,[]);
    assert.match(app.toasts.at(-1),/Storage is full or unavailable/);
    app.run('saveToPantry()');
    assert.equal(app.state().pantry.length,2);
    assert.equal(app.state().review.length,0);
  });
}

test('review HTML escapes typed and source text before inserting it into attributes or markup', () => {
  const app = createHarness();
  app.queue([{name:'<img src=x onerror="alert(1)">',source:'</strong><script>alert(1)</script>',unit:'" onfocus="alert(1)',qty:1,expDays:7,cost:0}]);
  const rendered = app.node('added-items-list').innerHTML;
  assert.ok(!rendered.includes('<img'));
  assert.ok(!rendered.includes('<script'));
  assert.match(rendered,/&lt;img/);
  assert.match(rendered,/&quot; onfocus=&quot;/);
});
