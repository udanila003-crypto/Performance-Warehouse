package expo.modules.hwscanner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Приём штрихкодов от встроенного сканера ТСД в режиме «Broadcast».
 *
 * Meferi ME61 (ScanEdge / meWedge): Output mode = Broadcast Output,
 * action android.intent.action.MEF_ACTION, данные — extra "data"
 * (старые прошивки — android.intent.extra.MEF_DATA1, тип — MEF_DATA2).
 * Дополнительно слушаем распространённые action других ТСД (Urovo, Newland,
 * iData, Honeywell, Zebra DataWedge, Mertech/Seuic), чтобы APK работал «из коробки».
 */
class HwScannerModule : Module() {
  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("HwScanner")
    Events("onScan")

    Constant("manufacturer") { Build.MANUFACTURER ?: "" }
    Constant("model") { Build.MODEL ?: "" }

    OnStartObserving { start() }
    OnStopObserving { stop() }
    OnDestroy { stop() }
  }

  private val context: Context?
    get() = appContext.reactContext?.applicationContext

  private fun start() {
    if (receiver != null) return
    val ctx = context ?: return
    val r = object : BroadcastReceiver() {
      override fun onReceive(c: Context?, intent: Intent?) {
        intent ?: return
        val code = extractCode(intent) ?: return
        sendEvent(
          "onScan",
          mapOf(
            "data" to code,
            "type" to extractType(intent),
            "action" to (intent.action ?: "")
          )
        )
      }
    }
    val filter = IntentFilter()
    ACTIONS.forEach { filter.addAction(it) }
    // Сканер — отдельное системное приложение, поэтому приёмник обязан быть EXPORTED
    // (с NOT_EXPORTED на Android 13+ сканы молча теряются).
    ContextCompat.registerReceiver(ctx, r, filter, ContextCompat.RECEIVER_EXPORTED)
    receiver = r
  }

  private fun stop() {
    val r = receiver ?: return
    receiver = null
    try {
      context?.unregisterReceiver(r)
    } catch (_: IllegalArgumentException) {
    }
  }

  private fun extractCode(intent: Intent): String? {
    val extras = intent.extras ?: return null
    for (key in DATA_KEYS) {
      if (!extras.containsKey(key)) continue
      val text = valueToString(extras.get(key), extras)
      if (!text.isNullOrBlank()) return text.trimEnd('\r', '\n', '\u0000')
    }
    return null
  }

  private fun valueToString(v: Any?, extras: android.os.Bundle): String? = when (v) {
    is String -> v
    is CharSequence -> v.toString()
    is ByteArray -> {
      // у части сканеров рядом лежит длина массива
      val len = listOf("length", "barcodelength", "barocodelen", "android.intent.extra.MEF_DATA2")
        .firstNotNullOfOrNull { k -> (extras.get(k) as? Int)?.takeIf { it in 1..v.size } } ?: v.size
      String(v, 0, len, Charsets.UTF_8)
    }
    null -> null
    else -> v.toString()
  }

  private fun extractType(intent: Intent): String {
    val extras = intent.extras ?: return ""
    for (key in TYPE_KEYS) {
      val v = extras.get(key) ?: continue
      if (v is String || v is Int) return v.toString()
    }
    return ""
  }

  companion object {
    val ACTIONS = arrayOf(
      // Meferi
      "android.intent.action.MEF_ACTION",
      "com.meferi.scan",
      "com.meferi.scanwizard.output.ACTION",
      // Urovo / i6200 и клоны
      "android.intent.ACTION_DECODE_DATA",
      "urovo.rcv.message",
      // Newland
      "nlscan.action.SCANNER_RESULT",
      // iData / Kaicom
      "android.intent.action.SCANRESULT",
      // Honeywell (Data Intent)
      "com.honeywell.decode.intent.action.EDIT_DATA",
      // Mertech / Seuic
      "com.android.server.scannerservice.broadcast",
      // Zebra DataWedge (если профиль настроен на этот action)
      "com.performance.warehouse.SCAN"
    )

    val DATA_KEYS = arrayOf(
      "data",
      "data_string",
      "android.intent.extra.MEF_DATA1",
      "barcode_string",
      "scannerdata",
      "SCAN_BARCODE1",
      "value",
      "barcode",
      "barcodeData",
      "com.symbol.datawedge.data_string",
      "barocode"
    )

    val TYPE_KEYS = arrayOf(
      "type",
      "android.intent.extra.MEF_DATA2",
      "codeType",
      "barcodeType",
      "SCAN_BARCODE_TYPE_NAME",
      "com.symbol.datawedge.label_type"
    )
  }
}
