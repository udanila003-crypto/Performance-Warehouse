/**
 * Защита от двойного скана, когда ТСД настроен на «Key and Broadcast Output»:
 * один и тот же код приходит и широковещательным сообщением, и «клавиатурой».
 * Повтор того же кода из ДРУГОГО источника в пределах окна игнорируется;
 * повтор из того же источника — это осознанный повторный скан, он засчитывается.
 */
export type ScanSource = 'camera' | 'input' | 'hardware';

export class ScanDeduper {
  private last: { code: string; source: ScanSource; at: number } | null = null;

  constructor(private windowMs = 800) {}

  accept(code: string, source: ScanSource, now = Date.now()): boolean {
    const prev = this.last;
    if (prev && prev.code === code && prev.source !== source && now - prev.at < this.windowMs) return false;
    this.last = { code, source, at: now };
    return true;
  }

  reset() {
    this.last = null;
  }
}

/** Убирает служебные символы конца строки (CR/LF/NUL), которые добавляют сканеры как суффикс. */
export function cleanScan(raw: string): string {
  return raw.replace(/^[\s\0]+|[\s\0]+$/g, '');
}

/** Известные производители ТСД со встроенным сканером: для них по умолчанию не включаем камеру. */
const TERMINAL_VENDORS = ['meferi', 'urovo', 'newland', 'idata', 'honeywell', 'zebra', 'seuic', 'mertech', 'chainway', 'sunmi', 'point mobile', 'cipherlab', 'datalogic', 'kaicom'];

export function isScanTerminal(manufacturer: string | undefined | null): boolean {
  const m = (manufacturer ?? '').toLowerCase();
  return !!m && TERMINAL_VENDORS.some((v) => m.includes(v));
}
