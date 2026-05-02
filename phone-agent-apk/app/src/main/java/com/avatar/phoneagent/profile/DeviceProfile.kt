package com.avatar.phoneagent.profile

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.DisplayMetrics
import android.view.WindowManager

data class DeviceProfile(
    val model: String,
    val manufacturer: String,
    val androidVersion: String,
    val sdkInt: Int,
    val screenWidth: Int,
    val screenHeight: Int,
    val densityDpi: Int,
    val densityScale: Float,
    val installedApps: Map<String, Boolean>
) {
    val isPortrait: Boolean get() = screenHeight > screenWidth
    val actualWidth: Int get() = if (isPortrait) screenWidth else screenHeight
    val actualHeight: Int get() = if (isPortrait) screenHeight else screenWidth

    companion object {
        private const val REF_WIDTH = 1080
        private const val REF_HEIGHT = 2400

        val TARGET_APPS = mapOf(
            "douyin" to "com.ss.android.ugc.aweme",
            "kuaishou" to "com.kuaishou.nebula",
            "xiaohongshu" to "com.xingin.xhs"
        )

        fun detect(context: Context): DeviceProfile {
            val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val metrics = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val bounds = wm.currentWindowMetrics.bounds
                DisplayMetrics().also {
                    it.widthPixels = bounds.width()
                    it.heightPixels = bounds.height()
                    it.density = context.resources.displayMetrics.density
                    it.densityDpi = context.resources.displayMetrics.densityDpi
                }
            } else {
                DisplayMetrics().also {
                    @Suppress("DEPRECATION")
                    wm.defaultDisplay.getRealMetrics(it)
                }
            }

            val installedApps = TARGET_APPS.mapValues { (_, pkg) ->
                isAppInstalled(context, pkg)
            }

            return DeviceProfile(
                model = Build.MODEL,
                manufacturer = Build.MANUFACTURER,
                androidVersion = Build.VERSION.RELEASE,
                sdkInt = Build.VERSION.SDK_INT,
                screenWidth = metrics.widthPixels,
                screenHeight = metrics.heightPixels,
                densityDpi = metrics.densityDpi,
                densityScale = metrics.density,
                installedApps = installedApps
            )
        }

        private fun isAppInstalled(context: Context, packageName: String): Boolean {
            return try {
                context.packageManager.getPackageInfo(packageName, 0)
                true
            } catch (e: PackageManager.NameNotFoundException) {
                false
            }
        }
    }

    fun scaleX(refX: Float): Float = refX * actualWidth.toFloat() / REF_WIDTH.toFloat()

    fun scaleY(refY: Float): Float = refY * actualHeight.toFloat() / REF_HEIGHT.toFloat()

    fun scaleCoord(refX: Float, refY: Float): Pair<Float, Float> =
        Pair(scaleX(refX), scaleY(refY))
}
