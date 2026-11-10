package com.hghub.huangguo

import android.content.ComponentCallbacks2
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var currentWebView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // 针对三星 S24 Ultra 等高刷旗舰：请求最高支持的刷新率（120Hz LTPO 满血流畅）
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val disp = display
      val modes = disp?.supportedModes
      val maxMode = modes?.maxByOrNull { it.refreshRate }
      maxMode?.let {
        val lp = window.attributes
        lp.preferredDisplayModeId = it.modeId
        window.attributes = lp
      }
    }

    // 针对三星 One UI 挖孔屏与手势底栏：精准监听系统 Insets 并注入 CSS --sat 与 --sab
    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { _, insets ->
      val statusBarInsets = insets.getInsets(WindowInsetsCompat.Type.statusBars())
      val navBarInsets = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
      val cutout = insets.displayCutout
      val topCutout = cutout?.safeInsetTop ?: 0
      val topPx = maxOf(statusBarInsets.top, topCutout)
      val bottomPx = navBarInsets.bottom
      val density = resources.displayMetrics.density
      val topDp = (topPx / density).toInt()
      val bottomDp = (bottomPx / density).toInt()

      currentWebView?.evaluateJavascript(
        "document.documentElement.style.setProperty('--sat', '${topDp}px');" +
        "document.documentElement.style.setProperty('--sab', '${bottomDp}px');",
        null
      )
      insets
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    currentWebView = webView

    // 针对骁龙8 Gen 3 (Adreno 750) 开启硬件加速与渲染优化
    webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
    webView.settings.apply {
      mediaPlaybackRequiresUserGesture = false
      domStorageEnabled = true
      databaseEnabled = true
      useWideViewPort = true
      loadWithOverviewMode = true
    }
    webView.overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS
  }

  override fun onTrimMemory(level: Int) {
    super.onTrimMemory(level)
    if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW || level == ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN) {
      currentWebView?.clearCache(false)
    }
  }

  override fun onLowMemory() {
    super.onLowMemory()
    currentWebView?.clearCache(false)
  }
}
