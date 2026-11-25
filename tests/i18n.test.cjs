const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const en = JSON.parse(read('_locales/en/messages.json'));
const ru = JSON.parse(read('_locales/ru/messages.json'));
function context(locale, extra = {}) {
  const dictionary = locale.startsWith('ru') ? ru : en;
  const browser = {
    i18n: {
      getUILanguage: () => locale,
      getMessage(key, substitutions = []) {
        if (key === '@@bidi_dir') return 'ltr';
        const entry = dictionary[key] || en[key];
        assert(entry, `Missing message: ${key}`);
        const values = Array.isArray(substitutions) ? substitutions : [substitutions];
        return entry.message.replace(/\$(\w+)\$/g, (_, name) => {
          const index = Number(entry.placeholders[name.toLowerCase()].content.slice(1)) - 1;
          return values[index];
        });
      }
    },
    ...extra
  };
  const ctx = vm.createContext({ browser, console });
  vm.runInContext(read('i18n.js'), ctx);
  return ctx;
}
for (const locale of ['en-US', 'ru-RU', 'de-DE']) {
  test(`${locale}: substitution and safe text localization`, () => {
    const ctx = context(locale);
    ctx.sender = '<img src=x onerror=alert(1)>';
    const value = vm.runInContext('I18n.message("fromSender", sender)', ctx);
    assert(value.endsWith(ctx.sender));
    assert(value.startsWith(locale === 'ru-RU' ? 'От:' : 'From:'));
  });
}
test('Russian relative time inflections and hour boundary', () => {
  const ctx = context('ru');
  const now = new Date('2026-11-25T10:00:00Z');
  ctx.now = now;
  for (const [minutes, expected] of [[1, 'через 1 минуту'], [2, 'через 2 минуты'], [5, 'через 5 минут'], [21, 'через 21 минуту'], [-1, '1 минуту назад'], [-2, '2 минуты назад'], [-5, '5 минут назад'], [61, 'через 2 часа'], [-61, '1 час назад']]) {
    ctx.date = new Date(+now + minutes * 60000);
    assert.equal(vm.runInContext('I18n.formatRelativeTime(date, now)', ctx), expected);
  }
});
test('dates: today, tomorrow, year boundary and translated connector', () => {
  const ctx = context('ru');
  ctx.now = new Date(2026, 11, 31, 12);
  ctx.date = new Date(2026, 11, 31, 13);
  assert.match(vm.runInContext('I18n.formatDateTime(date, true, now)', ctx), /^Сегодня в /);
  ctx.date = new Date(2027, 0, 1, 9);
  assert.match(vm.runInContext('I18n.formatDateTime(date, true, now)', ctx), /^Завтра в /);
  ctx.date = new Date(2027, 0, 2, 9);
  assert.match(vm.runInContext('I18n.formatDateTime(date, true, now)', ctx), /2027.* в /);
});

function background(locale, { legacy = false, tag, previous } = {}) {
  const calls = [];
  const storage = { localizedReminderTagName: previous };
  const event = { addListener() {} };
  const api = {
    list: async () => tag ? [{ key: 'reminder', tag, color: '#123456' }] : [],
    create: async (...args) => calls.push(['create', ...args]),
    update: async (...args) => calls.push(['update', ...args])
  };
  const ctx = context(locale, {
    messages: legacy ? { listTags: api.list, createTag: api.create, updateTag: api.update } : { tags: api },
    storage: { local: { get: async () => storage, set: async data => Object.assign(storage, data) } },
    runtime: { onInstalled: event, onStartup: event, onMessage: event },
    alarms: { onAlarm: event },
    menus: { create: data => calls.push(['menu', data.title]), onClicked: event },
    notifications: { onClicked: event, onClosed: event, create: async (...args) => calls.push(['notification', ...args]) }
  });
  vm.runInContext(read('background.js'), ctx);
  return { ctx, calls, storage };
}
for (const legacy of [false, true]) {
  test(`tag migration (${legacy ? 'legacy' : 'modern'} API): create, upgrade, switch language, preserve custom name`, async () => {
    for (const scenario of [
      { locale: 'ru', kind: 'create' },
      { locale: 'ru', tag: 'Has Reminder', kind: 'update' },
      { locale: 'en', tag: 'Есть напоминание', previous: 'Есть напоминание', kind: 'update' },
      { locale: 'ru', tag: 'My custom name', previous: 'Has Reminder', kind: null }
    ]) {
      const { ctx, calls, storage } = background(scenario.locale, { legacy, ...scenario });
      await vm.runInContext('initializeReminderTag()', ctx);
      const mutations = calls.filter(call => call[0] !== 'menu');
      assert.equal(mutations.length, scenario.kind ? 1 : 0);
      if (scenario.kind) {
        assert.equal(mutations[0][0], scenario.kind);
        assert.equal(mutations[0][1], 'reminder');
        const expected = scenario.locale === 'ru' ? 'Есть напоминание' : 'Has Reminder';
        assert.equal(storage.localizedReminderTagName, expected);
        if (scenario.kind === 'update') assert.equal(JSON.stringify(mutations[0][2]), JSON.stringify({ tag: expected }));
      }
    }
  });
}
test('Russian menu and notification use translated labels and empty-subject fallback', async () => {
  const { ctx, calls } = background('ru');
  assert.deepEqual(calls[0], ['menu', 'Установить напоминание…']);
  ctx.reminder = { id: 'test', subject: '', sender: '' };
  await vm.runInContext('showReminderNotification(reminder)', ctx);
  const notification = calls.find(call => call[0] === 'notification')[2];
  assert.equal(notification.title, 'Напоминание о письме');
  assert.equal(notification.message, '(Без темы)\nОт: Неизвестный отправитель');
});
