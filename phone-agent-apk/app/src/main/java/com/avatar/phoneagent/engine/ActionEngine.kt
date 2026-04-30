package com.avatar.phoneagent.engine

import com.avatar.phoneagent.accessibility.CameraAccessibilityService
import org.json.JSONArray
import org.json.JSONObject

object ActionEngine {

    fun execute(
        a11y: CameraAccessibilityService,
        actionsJson: JSONArray,
        params: Map<String, String>
    ): Map<String, Any> {
        val screenshots = mutableListOf<String>()

        for (i in 0 until actionsJson.length()) {
            val action = actionsJson.getJSONObject(i)
            val type = action.getString("type")

            try {
                when (type) {
                    "launch" -> {
                        val pkg = resolve(action.getString("package"), params)
                        a11y.launchApp(pkg)
                    }

                    "tap" -> {
                        val x = action.getDouble("x").toFloat()
                        val y = action.getDouble("y").toFloat()
                        a11y.tap(x, y)
                    }

                    "swipe" -> {
                        val x1 = action.getDouble("x1").toFloat()
                        val y1 = action.getDouble("y1").toFloat()
                        val x2 = action.getDouble("x2").toFloat()
                        val y2 = action.getDouble("y2").toFloat()
                        val dur = action.optLong("duration", 300)
                        a11y.swipe(x1, y1, x2, y2, dur)
                    }

                    "wait" -> {
                        val ms = action.optLong("ms", 1000)
                        Thread.sleep(ms)
                    }

                    "input_text" -> {
                        if (action.has("x") && action.has("y")) {
                            a11y.tap(
                                action.getDouble("x").toFloat(),
                                action.getDouble("y").toFloat()
                            )
                            Thread.sleep(300)
                        }
                        val content = resolve(action.getString("content"), params)
                        a11y.inputText(content)
                    }

                    "screenshot" -> {
                        val name = resolve(action.getString("name"), params)
                        val path = "/sdcard/screenshots/${name}.png"
                        screenshots.add(path)
                    }

                    "back" -> {
                        a11y.pressBack()
                        Thread.sleep(500)
                    }

                    "home" -> {
                        a11y.pressHome()
                        Thread.sleep(500)
                    }
                }
                Thread.sleep(100)
            } catch (e: Exception) {
                throw Exception("Action [$type] 失败: ${e.message}")
            }
        }

        return mapOf(
            "success" to true,
            "screenshots" to screenshots
        )
    }

    private fun resolve(template: String, params: Map<String, String>): String {
        val regex = Regex("\\{\\{(\\w+)}}")
        return regex.replace(template) { match ->
            params[match.groupValues[1]] ?: match.value
        }
    }
}
