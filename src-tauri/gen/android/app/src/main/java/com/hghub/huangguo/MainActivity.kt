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
  private var lastTopDp = 0
  private var lastBottomDp = 0

  private fun syncInsetsToWeb() {
    val top = lastTopDp
    val bottom = lastBottomDp
    if (top > 0 || bottom > 0) {
      currentWebView?.post {
        currentWebView?.evaluateJavascript(
          "document.documentElement.style.setProperty('--sat', '${top}px');" +
          "document.documentElement.style.setProperty('--sab', '${bottom}px');",
          null
        )
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // 请求设备最高支持的刷新率（支持 120Hz 高刷屏）
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

    // 监听屏幕挖孔与导航栏 Insets 并注入 CSS 变量 --sat 与 --sab
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

      lastTopDp = topDp
      lastBottomDp = bottomDp
      syncInsetsToWeb()
      insets
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    currentWebView = webView
    syncInsetsToWeb()
    window.decorView.post { window.decorView.requestApplyInsets() }

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
