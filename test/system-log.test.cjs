'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup, endpoint, traceId } = require('./harness.cjs');

const ENVELOPE_KEYS = ['trace_id', 'platform', 'tag_name', 'event_name', 'event_type',
  'request_method', 'request_url', 'request_body', 'response_status', 'response_body', 'duration_ms'];

test('sem x-wascer-log: uma chamada só (vendor), nenhuma ao coletor', async () => {
  const s = setup({ headers: { 'x-wascer-log': undefined } });
  await s.settle();
  assert.equal(s.calls.length, 1);
  assert.notEqual(s.calls[0].url, endpoint);
  assert.equal(s.logs.length, 0);
  assert.equal(s.success, 1);
  assert.equal(s.failure, 0);
});

for (const flag of ['0', 'true', '1 ', '01', '', 1, true]) {
  test('x-wascer-log = ' + JSON.stringify(flag) + ': nenhuma chamada ao coletor', async () => {
    const s = setup({ headers: { 'x-wascer-log': flag } });
    await s.settle();
    assert.equal(s.calls.length, 1);
    assert.equal(s.logs.length, 0);
    assert.equal(s.success, 1);
  });
}

test('x-wascer-log = "1" e vendor 200: uma cópia para o coletor com o envelope exato', async () => {
  const s = setup({ vendorPending: true });
  assert.equal(s.calls.length, 1, 'só o vendor antes da resposta');
  assert.equal(s.logs.length, 0, 'nada é copiado antes de o vendor responder');
  s.completeVendor();
  await s.settle();
  assert.equal(s.calls.length, 2);
  assert.equal(s.logs.length, 1);
  const [vendor, collector] = s.calls;
  const row = s.logs[0];
  assert.equal(collector.url, endpoint);
  assert.equal(collector.options.method, 'POST');
  assert.deepEqual(Object.keys(row).sort(), ENVELOPE_KEYS.slice().sort());
  assert.equal(row.trace_id, traceId);
  assert.equal(row.platform, 'wascer_store');
  assert.equal(row.tag_name, 'Wascer Store Writer');
  assert.equal(row.event_name, 'purchase');
  assert.equal(row.event_type, 'purchase');
  assert.equal(row.request_method, 'POST');
  assert.equal(row.request_url, vendor.url);
  assert.equal(row.request_url, 'https://store.example.test/database/collections/orders');
  assert.equal(typeof vendor.body, 'string');
  assert.equal(row.request_body, vendor.body, 'string idêntica, byte a byte');
  assert.equal(row.response_status, 200);
  assert.equal(row.response_body, '{"ok":true}\n');
  assert.ok(Number.isInteger(row.duration_ms) && row.duration_ms >= 0);
  assert.equal(row.duration_ms, 37);
  assert.ok(!JSON.stringify(row).includes('response-credential-never-copy'), 'headers da resposta não vão');
  assert.equal(s.success, 1);
  assert.equal(s.failure, 0);
});

test('vendor 503: cópia com response_status 503 e a tag chama gtmOnFailure', async () => {
  const s = setup({ status: 503, responseBody: 'unavailable' });
  await s.settle();
  assert.equal(s.logs.length, 1);
  assert.equal(s.logs[0].response_status, 503);
  assert.equal(s.logs[0].response_body, 'unavailable');
  assert.equal(s.failure, 1);
  assert.equal(s.success, 0);
});

test('erro de rede no vendor: cópia com response_status 0 e a tag chama gtmOnFailure', async () => {
  const s = setup({ vendorError: { reason: 'timed_out' } });
  await s.settle();
  assert.equal(s.logs.length, 1);
  assert.equal(s.logs[0].response_status, 0);
  assert.equal(s.logs[0].response_body, 'timed_out');
  assert.equal(s.logs[0].request_body, s.calls[0].body);
  assert.equal(s.failure, 1);
  assert.equal(s.success, 0);
});

test('erro de rede no vendor com error.body: response_body usa o body', async () => {
  const s = setup({ vendorError: { reason: 'failed', body: 'raw error body' } });
  await s.settle();
  assert.equal(s.logs[0].response_body, 'raw error body');
});

test('campo "Event type (System Log)" preenchido: event_type usa o campo; vazio: usa event_name', async () => {
  const filled = setup({ data: { systemLogEventType: 'compra-site' } });
  await filled.settle();
  assert.equal(filled.logs[0].event_type, 'compra-site');
  assert.equal(filled.logs[0].event_name, 'purchase');
  const empty = setup({ data: { systemLogEventType: '' } });
  await empty.settle();
  assert.equal(empty.logs[0].event_type, 'purchase');
  const field = empty.parameters.find(p => p.name === 'systemLogEventType');
  assert.equal(field.type, 'TEXT');
  assert.equal(field.displayName, 'Event type (System Log)');
  assert.equal(field.simpleValueType, true);
  assert.equal(empty.parameters[0].name, 'systemLogEventType', 'primeiro da lista');
});

for (const [label, event] of [['ausente', {}], ['não-string', { event_name: 42 }]]) {
  test('event_name ' + label + ': event_name e event_type vão como string vazia', async () => {
    const s = setup({ event });
    await s.settle();
    assert.equal(s.logs[0].event_name, '');
    assert.equal(s.logs[0].event_type, '');
    assert.equal(s.success, 1);
  });
}

for (const mode of ['reject', 'throw']) {
  test('coletor ' + mode + ': gtmOnSuccess/gtmOnFailure idênticos ao caso sem cópia, sem exceção', async () => {
    for (const status of [200, 503]) {
      const off = setup({ headers: { 'x-wascer-log': undefined }, status });
      await off.settle();
      const on = setup({ collectorMode: mode, status });
      await on.settle();
      assert.equal(on.success, off.success);
      assert.equal(on.failure, off.failure);
    }
  });
}

test('coletor nunca responde: a tag já chamou gtmOnSuccess', async () => {
  const s = setup({ collectorMode: 'pending' });
  await s.settle();
  assert.equal(s.logs.length, 1);
  assert.equal(s.success, 1);
  assert.equal(s.failure, 0);
});

test('x-wascer-log = "1" sem x-wascer-trace-id: a tag termina normalmente', async () => {
  const s = setup({ headers: { 'x-wascer-trace-id': undefined } });
  await s.settle();
  assert.equal(s.success, 1);
  assert.equal(s.failure, 0);
  assert.equal(s.logs[0].trace_id, '');
});

test('a cópia usa timeout de 500 ms e Content-Type application/json', async () => {
  const s = setup();
  await s.settle();
  const collector = s.calls[1];
  assert.equal(collector.options.timeout, 500);
  assert.deepEqual(collector.options.headers, { 'Content-Type': 'application/json' });
});

test('permissões: read_request lista x-wascer-log e x-wascer-trace-id; send_http continua any', () => {
  const s = setup();
  const names = s.permission('read_request').headerWhitelist.listItem.map(p => p.mapValue[0].string);
  assert.ok(names.includes('x-wascer-log'));
  assert.ok(names.includes('x-wascer-trace-id'));
  assert.equal(s.permission('send_http').allowedUrls.string, 'any');
});

test('com a cópia desligada, a chamada ao vendor é idêntica à do template da main', async () => {
  // fixture = seção SANDBOXED_JS_FOR_SERVER de `git show main:template.tpl` antes desta mudança
  const mainCode = fs.readFileSync(path.resolve(__dirname, 'fixtures/sandboxed-js.main.txt'), 'utf8');
  for (const data of [{}, { writeMode: 'replace' }, { addEventData: true, collection: '' }]) {
    const before = setup({ code: mainCode, data, headers: { 'x-wascer-log': undefined } });
    const after = setup({ data, headers: { 'x-wascer-log': undefined } });
    const withLog = setup({ data });
    await Promise.all([before.settle(), after.settle(), withLog.settle()]);
    assert.deepEqual(after.calls, before.calls);
    assert.deepEqual(withLog.calls[0], before.calls[0], 'ligar o log não muda a chamada ao vendor');
    assert.equal(after.success, before.success);
    assert.equal(after.failure, before.failure);
  }
});
