# ТСД Meferi ME61: сканер ШК и QR

Приложения **Performance Warehouse** и **PerformanceWarehouseLite** принимают коды от встроенного
сканера Meferi ME61 (модули Zebra SE4710/SE4770/SE5070 или Honeywell HS7) двумя способами.

## 1. Broadcast (рекомендуется)

Код приходит в приложение широковещательным сообщением Android — поле ввода в фокусе не нужно,
экранная клавиатура не появляется, быстрые сканы подряд не теряются.

Настройка на ТСД — приложение **ScanEdge** (или **meWedge**, если профиль задан для приложения):

1. **Settings → Output settings → Output mode** → `Broadcast Output`.
2. Broadcast action — `android.intent.action.MEF_ACTION` (значение по умолчанию на прошивках с октября 2023).
3. Barcode data label (extra с данными) — `data`. Поле «Barcode type» можно оставить пустым или `type`.

Приложение также понимает старые прошивки (`android.intent.extra.MEF_DATA1` / `MEF_DATA2`),
action `com.meferi.scan` и `com.meferi.scanwizard.output.ACTION` (ME10). Для meWedge:
Intent delivery — `Broadcast intent`, категория — пустая.

> Не выбирайте `Key and Broadcast Output` без необходимости: приложение отбрасывает дубль
> одного скана, пришедшего обоими путями, но чистый Broadcast надёжнее.

## 2. Эмуляция клавиатуры (Key Output)

Работает без настройки и в старых сборках APK: код «впечатывается» в поле «Код вручную / сканер ТСД»
окна сканирования. Суффикс — Enter (`Suffix: Enter` / `\n`). На ТСД экранная клавиатура в окне
сканера по умолчанию скрыта; для ручного ввода нажмите кнопку `⌨`.

## Кодировки

По умолчанию работают EAN-13, Code 128, GS1-128, PDF417, DataMatrix, QR. В **ScanEdge → Symbologies**
дополнительно включите:

* EAN-8 → `Transmit check digit`;
* EAN-13 с добавкой → `2-Digit Add-On Code` / `5-Digit Add-On Code` (если нужны);
* Code 39, ITF, UPC — если такие этикетки используются.

## Работа в приложении

* На ТСД окно сканирования открывается **без камеры**: «Сканируйте кнопкой ТСД» — нажмите боковую
  (жёлтую) кнопку или курок пистолетной рукоятки. Значок 📷 в заголовке включает камеру.
* Каждое нажатие кнопки — отдельный скан (в т.ч. одинаковый ШК подряд), сканы обрабатываются по очереди.
* Нативная часть — `modules/hw-scanner` (Expo-модуль, собирается в APK автоматически). Кроме Meferi
  она слушает типовые action других ТСД: Urovo, Newland, iData, Honeywell, Mertech/Seuic, а для
  Zebra DataWedge — `com.performance.warehouse.SCAN` (extra `com.symbol.datawedge.data_string`).

## Если сканы не доходят

1. Проверьте Output mode и action в ScanEdge (п. 1) — опечатки вроде `andriod` встречаются в инструкциях.
2. Временно переключите Output mode в `Key Output`: если код появляется в поле ввода — сканер исправен,
   дело в настройке Broadcast.
3. Убедитесь, что установлен APK версии 3.2.0+ (Lite — 1.2.0+): старые версии понимают только режим клавиатуры.
