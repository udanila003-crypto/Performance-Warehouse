import { requireOptionalNativeModule } from 'expo';
import { useEffect, useRef } from 'react';
import { cleanScan, isScanTerminal } from '../core/scanInput';

/**
 * Встроенный сканер ТСД (Meferi ME61 и др.) в режиме Broadcast.
 * Нативная часть — modules/hw-scanner. В Expo Go / web модуля нет — тогда всё молча отключено,
 * а сканер ТСД в режиме «клавиатуры» по-прежнему работает через поле ввода.
 */
interface HwScanEvent {
  data: string;
  type: string;
  action: string;
}

interface HwScannerNative {
  manufacturer: string;
  model: string;
  addListener(event: 'onScan', cb: (e: HwScanEvent) => void): { remove(): void };
}

const native = requireOptionalNativeModule<HwScannerNative>('HwScanner');

export const hwScanner = {
  available: !!native,
  manufacturer: native?.manufacturer ?? '',
  model: native?.model ?? '',
  /** Устройство — ТСД со встроенным сканером (камеру по умолчанию не включаем). */
  isTerminal: isScanTerminal(native?.manufacturer),
};

/** Подписка на сканы аппаратного сканера, пока active=true. */
export function useHardwareScan(active: boolean, onScan: (code: string, type: string) => void) {
  const cb = useRef(onScan);
  cb.current = onScan;
  useEffect(() => {
    if (!active || !native) return;
    const sub = native.addListener('onScan', (e) => {
      const code = cleanScan(e?.data ?? '');
      if (code) cb.current(code, e?.type ?? '');
    });
    return () => sub.remove();
  }, [active]);
}
