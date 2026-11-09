import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, colors } from './ui';
import { scanSound } from '../lib/beep';
import { hwScanner, useHardwareScan } from '../lib/hwScanner';
import { ScanDeduper, cleanScan, type ScanSource } from '../core/scanInput';

/**
 * Сканер: камера телефона (QR, EAN-13/8, Code128/39, DataMatrix, UPC)
 * + поле ручного ввода + встроенный сканер ТСД (Meferi ME61 и др.):
 *  - режим Broadcast (рекомендуется) — коды приходят через modules/hw-scanner, фокус не нужен;
 *  - режим эмуляции клавиатуры — коды попадают в поле ввода (оно в фокусе).
 * На ТСД камера по умолчанию выключена — сканируют боковой кнопкой, камеру можно включить.
 */
/** Результат обработки скана с цветом: red — меньше задания, green — сошлось, yellow — больше. */
export interface ScanFeedback {
  ok: boolean;
  text: string;
  tone?: 'red' | 'green' | 'yellow';
}

const TONE: Record<NonNullable<ScanFeedback['tone']>, { bg: string; fg: string }> = {
  red: { bg: '#B42318', fg: '#fff' },
  green: { bg: '#067647', fg: '#fff' },
  yellow: { bg: '#FDB022', fg: '#1F2937' },
};

export function Scanner({
  visible,
  title = 'Сканирование',
  hint,
  onClose,
  onScan,
}: {
  visible: boolean;
  title?: string;
  hint?: string;
  onClose: () => void;
  /** true — код принят, false — не распознан; ScanFeedback — сообщение с цветом. */
  onScan: (code: string) => Promise<boolean | ScanFeedback> | boolean | ScanFeedback;
}) {
  const [perm, requestPerm] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [message, setMessage] = useState<ScanFeedback | null>(null);
  const inputRef = useRef<TextInput>(null);
  /** Сканы обрабатываются строго по очереди — быстрые сканы ТСД подряд не теряются. */
  const queue = useRef<Promise<void>>(Promise.resolve());
  const dedup = useRef(new ScanDeduper());
  const [useCamera, setUseCamera] = useState(!hwScanner.isTerminal);
  /** Экранная клавиатура на ТСД: по умолчанию скрыта, чтобы не закрывать экран при сканах «клавиатурой». */
  const [softKb, setSoftKb] = useState(!hwScanner.isTerminal);
  /** Последний код, который видит камера (наведение); засчитывается только по кнопке «СКАН». */
  const seen = useRef<{ code: string; at: number } | null>(null);
  const [inView, setInView] = useState<string | null>(null);
  const [sound, setSound] = useState(scanSound.enabled);

  useEffect(() => {
    if (visible) {
      setManual('');
      setMessage(null);
      dedup.current.reset();
      seen.current = null;
      setInView(null);
      scanSound.ready().then(() => setSound(scanSound.enabled)).catch(() => undefined);
    }
  }, [visible]);

  // код пропал из кадра — гасим подсветку рамки
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => {
      if (seen.current && Date.now() - seen.current.at > 700) {
        seen.current = null;
        setInView(null);
      }
    }, 250);
    return () => clearInterval(t);
  }, [visible]);

  function onCameraCode(data: string) {
    const c = data.trim();
    if (!c) return;
    seen.current = { code: c, at: Date.now() };
    setInView((prev) => (prev === c ? prev : c));
  }

  /** Кнопка «СКАН»: засчитать код, который сейчас в кадре. Каждое нажатие — отдельный скан. */
  function pressScan() {
    const cur = seen.current;
    if (!cur || Date.now() - cur.at > 1000) {
      setMessage({ ok: false, tone: 'red', text: 'Код не в кадре — наведите камеру на ШК или QR и нажмите «СКАН»' });
      scanSound.play('error');
      return;
    }
    handle(cur.code, 'camera');
  }

  const canAsk = !!perm && !perm.granted && perm.canAskAgain;
  useEffect(() => {
    if (visible && useCamera && canAsk) requestPerm();
  }, [visible, useCamera, canAsk, requestPerm]);

  useHardwareScan(visible, (code) => handle(code, 'hardware'));

  /**
   * camera — по кнопке «СКАН»; hardware — кнопка сканера ТСД (Broadcast);
   * input — сканер ТСД в режиме клавиатуры / ручной ввод. Каждый скан учитывается, даже одинаковый ШК подряд.
   */
  function handle(code: string, source: ScanSource) {
    const c = cleanScan(code);
    if (!c || !dedup.current.accept(c, source)) return;
    queue.current = queue.current.then(() => process(c, source));
  }

  async function process(c: string, source: ScanSource) {
    try {
      const res = await onScan(c);
      if (typeof res === 'object') setMessage(res);
      else setMessage(res ? { text: `✓ ${c}`, ok: true } : { text: `Не распознано: ${c}`, ok: false });
      const good = typeof res === 'object' ? res.ok && res.tone !== 'red' : res;
      scanSound.play(good ? 'ok' : 'error');
    } catch (e) {
      scanSound.play('error');
      setMessage({ ok: false, tone: 'red', text: e instanceof Error ? e.message : String(e) });
    } finally {
      if (source !== 'camera') setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        {/* окно сканера — модальное: на Android клавиатура иначе закрывает поле ручного ввода */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={st.header}>
          <Text style={st.title}>{title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <Pressable hitSlop={12} onPress={() => setUseCamera((v) => !v)}>
              <Text style={{ fontSize: 22, opacity: useCamera ? 1 : 0.5 }}>📷</Text>
            </Pressable>
            <Pressable hitSlop={12} onPress={() => {
              const v = !sound;
              setSound(v);
              scanSound.setEnabled(v).catch(() => undefined);
              if (v) scanSound.play('ok');
            }}>
              <Text style={{ fontSize: 22 }}>{sound ? '🔊' : '🔇'}</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={st.close}>Закрыть</Text>
            </Pressable>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          {!useCamera ? (
            <View style={st.center}>
              <Text style={{ color: '#fff', textAlign: 'center', fontSize: 20, fontWeight: '700', marginBottom: 10 }}>
                Сканируйте кнопкой ТСД
              </Text>
              <Text style={{ color: '#D0D5DD', textAlign: 'center', marginBottom: 16 }}>
                Наведите сканер на ШК / QR и нажмите боковую кнопку сканирования.
                {hwScanner.available ? '' : '\nСканер ТСД должен быть в режиме клавиатуры.'}
              </Text>
              <Button title="Включить камеру" onPress={() => setUseCamera(true)} />
            </View>
          ) : perm?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr', 'datamatrix', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e', 'itf14'],
              }}
              onBarcodeScanned={(r) => onCameraCode(r.data)}
            />
          ) : (
            <View style={st.center}>
              <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 12 }}>
                Нет доступа к камере. Разрешите доступ или введите код вручную.
              </Text>
              <Button title="Разрешить камеру" onPress={requestPerm} />
            </View>
          )}
          {useCamera && perm?.granted ? <View pointerEvents="none" style={[st.frame, inView ? null : { borderColor: '#FFFFFFAA' }]} /> : null}
          {useCamera && perm?.granted ? (
            <View pointerEvents="none" style={st.inView}>
              <Text style={{ color: '#fff', textAlign: 'center', fontSize: 15 }}>
                {inView ? `В кадре: ${inView}` : 'Наведите камеру на ШК / QR'}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={st.bottom}>
          {hint ? <Text style={st.hint}>{hint}</Text> : null}
          {message?.tone ? (
            <View style={[st.banner, { backgroundColor: TONE[message.tone].bg }]}>
              <Text style={[st.bannerText, { color: TONE[message.tone].fg }]}>{message.text}</Text>
            </View>
          ) : message ? <Text style={[st.msg, message.ok && { color: '#86EFAC' }]}>{message.text}</Text> : null}
          {useCamera && perm?.granted ? (
            <Pressable onPress={pressScan}
              style={({ pressed }) => [st.scanBtn, !inView && { backgroundColor: '#15803D99' }, pressed && { opacity: 0.75 }]}>
              <Text style={st.scanText}>СКАН</Text>
            </Pressable>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              ref={inputRef}
              autoFocus={!useCamera}
              showSoftInputOnFocus={softKb}
              blurOnSubmit={false}
              value={manual}
              onChangeText={setManual}
              placeholder="Код вручную / сканер ТСД"
              placeholderTextColor="#98A2B3"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => {
                handle(manual, 'input');
                setManual('');
              }}
              style={st.input}
            />
            {hwScanner.isTerminal ? (
              <Button title="⌨" variant="secondary" onPress={() => {
                setSoftKb((v) => !v);
                inputRef.current?.blur();
                setTimeout(() => inputRef.current?.focus(), 80);
              }} />
            ) : null}
            <Button
              title="OK"
              onPress={() => {
                handle(manual, 'input');
                setManual('');
              }}
            />
          </View>
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  close: { color: '#93C5FD', fontSize: 16 },
  center: { flex: 1, justifyContent: 'center', padding: 24 },
  frame: {
    position: 'absolute',
    left: '15%',
    right: '15%',
    top: '20%',
    aspectRatio: 1,
    borderWidth: 3,
    borderColor: '#22C55E',
    borderRadius: 16,
  },
  bottom: { padding: 16, backgroundColor: '#111' },
  hint: { color: '#D0D5DD', marginBottom: 8 },
  msg: { color: '#FCA5A5', marginBottom: 8 },
  banner: { borderRadius: 10, padding: 12, marginBottom: 10 },
  scanBtn: { backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginBottom: 10 },
  scanText: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: 2 },
  inView: { position: 'absolute', left: 16, right: 16, bottom: 16, backgroundColor: '#000A', borderRadius: 10, padding: 8 },
  bannerText: { fontSize: 18, fontWeight: '700' },
  input: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#1F2937',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.muted,
  },
});
