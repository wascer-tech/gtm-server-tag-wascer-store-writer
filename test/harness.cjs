'use strict';
// Runs the sandboxed server code of template.tpl in node:vm with permission-aware
// API doubles. Not a Google sandbox compiler and not proof of live sGTM delivery.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const endpoint = 'https://system-log.wascer.internal/log';
const traceId = '12345678-1234-4234-8234-123456789abc';
const templatePath = path.resolve(__dirname, '../template.tpl');

function section(text, name) {
  return text.split('___' + name + '___')[1].split(/___[A-Z_]+___/)[0].trim();
}

function readTemplate() {
  const text = fs.readFileSync(templatePath, 'utf8');
  return {
    info: JSON.parse(section(text, 'INFO')),
    parameters: JSON.parse(section(text, 'TEMPLATE_PARAMETERS')),
    permissions: JSON.parse(section(text, 'SERVER_PERMISSIONS')),
    code: section(text, 'SANDBOXED_JS_FOR_SERVER')
  };
}

const safeJSON = {
  stringify: JSON.stringify,
  parse(value) { try { return JSON.parse(value); } catch (e) { return undefined; } }
};

// options.code runs another program (e.g. the fixture from main) against the same doubles.
function setup(options = {}) {
  const template = readTemplate();
  const permissions = template.permissions;
  function permission(name) {
    const entry = permissions.find(p => p.instance.key.publicId === name);
    assert.ok(entry, 'template lacks permission ' + name);
    return Object.fromEntries(entry.instance.param.map(p => [p.key, p.value]));
  }
  const calls = [], logs = [], consoleLogs = [];
  let success = 0, failure = 0, completeVendor;
  let now = 1000;
  const event = options.event || { event_name: 'purchase', value: 42, email: 'private@example.test' };
  const headers = {
    'x-wascer-log': '1', 'x-wascer-trace-id': traceId,
    'x-url-api': 'https://store.example.test/database',
    'x-container-identifier': 'container-1', 'x-user-id': 'owner-1',
    ...options.headers
  };
  const data = {
    collection: 'orders', documentId: 'doc-1', addEventData: false,
    fieldsToSave: [{ fieldName: 'email', fieldValue: 'private@example.test' }],
    ...options.data,
    gtmOnSuccess() { success++; }, gtmOnFailure() { failure++; }
  };
  function sendHttpRequest(url, httpOptions, body) {
    assert.equal(typeof httpOptions, 'object', 'uses documented promise API');
    assert.equal(permission('send_http').allowedUrls.string, 'any', 'send_http denied ' + url);
    calls.push({ url, options: structuredClone(httpOptions), body }); // clone: objetos do vm têm outro prototype
    if (url === endpoint) {
      logs.push(JSON.parse(body));
      if (options.collectorMode === 'throw') throw new Error('collector synchronous error');
      if (options.collectorMode === 'pending') return new Promise(() => {});
      if (options.collectorMode === 'reject') return Promise.reject({ reason: 'failed' });
      return Promise.resolve({ statusCode: 202, body: '' });
    }
    return new Promise((resolve, reject) => {
      completeVendor = () => {
        now += 37;
        if (options.vendorError) reject(options.vendorError);
        else resolve({
          statusCode: options.status === undefined ? 200 : options.status,
          body: options.responseBody === undefined ? '{"ok":true}\n' : options.responseBody,
          headers: { authorization: 'response-credential-never-copy' }
        });
      };
      if (!options.vendorPending) completeVendor();
    });
  }
  const apis = {
    JSON: safeJSON,
    Promise: { create: fn => new Promise(fn), all: Promise.all.bind(Promise) },
    sendHttpRequest,
    getRequestHeader(key) {
      const scope = permission('read_request');
      assert.ok(scope.headerAccess.string === 'any' ||
        scope.headerWhitelist.listItem.some(p => p.mapValue.some(v => v.string === key)),
        'read_request denied ' + key);
      return headers[key];
    },
    getAllEventData() { assert.equal(permission('read_event_data').eventDataAccess.string, 'any'); return { ...event }; },
    getEventData(key) { assert.equal(permission('read_event_data').eventDataAccess.string, 'any'); return event[key]; },
    getTimestampMillis: () => now,
    getType: value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
    encodeUriComponent: encodeURIComponent,
    logToConsole: (...args) => consoleLogs.push(args)
  };
  const context = vm.createContext({
    data,
    require(name) { assert.ok(name in apis, 'unexpected sandbox API: ' + name); return apis[name]; }
  });
  const code = options.code === undefined ? template.code : options.code;
  new vm.Script('(function(){\n' + code + '\n})()').runInContext(context, { timeout: 1000 });
  return {
    calls, logs, consoleLogs, data, info: template.info, parameters: template.parameters,
    permissions, permission,
    get success() { return success; }, get failure() { return failure; },
    completeVendor: () => completeVendor(),
    async settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
  };
}

module.exports = { setup, readTemplate, endpoint, traceId };
