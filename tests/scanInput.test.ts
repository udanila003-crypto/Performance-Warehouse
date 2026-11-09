import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ScanDeduper, cleanScan, isScanTerminal } from '../src/core/scanInput';

test('сканер ТСД: дубль «Broadcast + клавиатура» отбрасывается, повторный скан — нет', () => {
  const d = new ScanDeduper(800);
  assert.equal(d.accept('4601234567893', 'hardware', 1000), true);
  assert.equal(d.accept('4601234567893', 'input', 1100), false); // тот же скан пришёл «клавиатурой»
  assert.equal(d.accept('4601234567893', 'hardware', 1200), true); // повторное нажатие кнопки — новый скан
  assert.equal(d.accept('4601234567893', 'input', 2500), true); // вне окна
  assert.equal(d.accept('QR-1', 'input', 2600), true);
});

test('сканер ТСД: суффиксы CR/LF/NUL обрезаются, GS внутри DataMatrix сохраняется', () => {
  assert.equal(cleanScan('4601234567893\r\n'), '4601234567893');
  assert.equal(cleanScan('\0 abc\0'), 'abc');
  assert.equal(cleanScan('0104601234567893215abc\x1d93def\n'), '0104601234567893215abc\x1d93def');
});

test('сканер ТСД: Meferi распознаётся как терминал', () => {
  assert.equal(isScanTerminal('MEFERI'), true);
  assert.equal(isScanTerminal('Meferi Technologies'), true);
  assert.equal(isScanTerminal('samsung'), false);
  assert.equal(isScanTerminal(''), false);
});
