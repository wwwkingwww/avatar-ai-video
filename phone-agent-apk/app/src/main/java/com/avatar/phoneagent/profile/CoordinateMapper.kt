package com.avatar.phoneagent.profile

import org.json.JSONArray
import org.json.JSONObject

object CoordinateMapper {

    private const val REF_WIDTH = 1080
    private const val REF_HEIGHT = 2400

    fun scaleActions(
        actionsJson: JSONArray,
        profile: DeviceProfile
    ): JSONArray {
        val scaled = JSONArray()
        for (i in 0 until actionsJson.length()) {
            val action = actionsJson.getJSONObject(i)
            val scaledAction = scaleAction(action, profile)
            scaled.put(scaledAction)
        }
        return scaled
    }

    private fun scaleAction(action: JSONObject, profile: DeviceProfile): JSONObject {
        val result = JSONObject()
        action.keys().forEach { key -> result.put(key, action.get(key)) }

        when (action.optString("type")) {
            "tap" -> {
                if (action.has("x")) result.put("x", profile.scaleX(action.getDouble("x").toFloat()).toDouble())
                if (action.has("y")) result.put("y", profile.scaleY(action.getDouble("y").toFloat()).toDouble())
            }
            "swipe" -> {
                if (action.has("x1")) result.put("x1", profile.scaleX(action.getDouble("x1").toFloat()).toDouble())
                if (action.has("y1")) result.put("y1", profile.scaleY(action.getDouble("y1").toFloat()).toDouble())
                if (action.has("x2")) result.put("x2", profile.scaleX(action.getDouble("x2").toFloat()).toDouble())
                if (action.has("y2")) result.put("y2", profile.scaleY(action.getDouble("y2").toFloat()).toDouble())
            }
            "input_text" -> {
                if (action.has("x")) result.put("x", profile.scaleX(action.getDouble("x").toFloat()).toDouble())
                if (action.has("y")) result.put("y", profile.scaleY(action.getDouble("y").toFloat()).toDouble())
            }
        }
        return result
    }

    fun scaleX(refX: Float, profile: DeviceProfile): Float = profile.scaleX(refX)

    fun scaleY(refY: Float, profile: DeviceProfile): Float = profile.scaleY(refY)

    fun buildPlatformActions(
        platform: String,
        title: String,
        description: String = "",
        profile: DeviceProfile
    ): JSONArray {
        val actions = JSONArray()

        val pkg = DeviceProfile.TARGET_APPS[platform] ?: return actions

        actions.put(action("launch", mapOf("package" to pkg)))
        actions.put(action("wait", mapOf("ms" to 3000)))

        when (platform) {
            "douyin" -> {
                actions.put(scaledAction("tap", 540.0, 2200.0, profile, "点击+号创建"))
                actions.put(action("wait", mapOf("ms" to 1500)))
                actions.put(scaledAction("tap", 540.0, 1900.0, profile, "选择视频"))
                actions.put(action("wait", mapOf("ms" to 2000)))
                actions.put(scaledAction("input_text", 540.0, 500.0, profile, title))
                actions.put(action("wait", mapOf("ms" to 500)))
                actions.put(scaledAction("tap", 1000.0, 2200.0, profile, "点击发布"))
                actions.put(action("wait", mapOf("ms" to 8000)))
                actions.put(action("screenshot", mapOf("name" to "douyin_publish_result")))
            }
            "kuaishou" -> {
                actions.put(scaledAction("tap", 540.0, 2200.0, profile, "点击拍摄"))
                actions.put(action("wait", mapOf("ms" to 1500)))
                actions.put(scaledAction("tap", 540.0, 1800.0, profile, "从相册选择"))
                actions.put(action("wait", mapOf("ms" to 2000)))
                actions.put(scaledAction("tap", 1000.0, 2200.0, profile, "下一步"))
                actions.put(action("wait", mapOf("ms" to 1000)))
                actions.put(scaledAction("input_text", 540.0, 300.0, profile, title))
                actions.put(action("wait", mapOf("ms" to 500)))
                actions.put(scaledAction("tap", 1000.0, 2200.0, profile, "发布"))
                actions.put(action("wait", mapOf("ms" to 8000)))
                actions.put(action("screenshot", mapOf("name" to "kuaishou_publish_result")))
            }
            "xiaohongshu" -> {
                actions.put(scaledAction("tap", 540.0, 2200.0, profile, "点击+号"))
                actions.put(action("wait", mapOf("ms" to 1500)))
                actions.put(scaledAction("tap", 540.0, 1800.0, profile, "选择视频"))
                actions.put(action("wait", mapOf("ms" to 2000)))
                actions.put(scaledAction("tap", 1000.0, 2200.0, profile, "下一步"))
                actions.put(action("wait", mapOf("ms" to 1000)))
                actions.put(scaledAction("input_text", 540.0, 500.0, profile, title))
                if (description.isNotEmpty()) {
                    actions.put(scaledAction("input_text", 540.0, 800.0, profile, description))
                }
                actions.put(action("wait", mapOf("ms" to 500)))
                actions.put(scaledAction("tap", 1000.0, 2200.0, profile, "发布笔记"))
                actions.put(action("wait", mapOf("ms" to 8000)))
                actions.put(action("screenshot", mapOf("name" to "xhs_publish_result")))
            }
        }

        return actions
    }

    private fun action(type: String, params: Map<String, Any>): JSONObject {
        val obj = JSONObject().apply { put("type", type) }
        params.forEach { (k, v) -> obj.put(k, v) }
        return obj
    }

    private fun scaledAction(
        type: String, refX: Double, refY: Double,
        profile: DeviceProfile, desc: String
    ): JSONObject {
        return JSONObject().apply {
            put("type", type)
            put("x", profile.scaleX(refX.toFloat()).toDouble())
            put("y", profile.scaleY(refY.toFloat()).toDouble())
            put("desc", desc)
        }
    }

    private fun scaledAction(
        type: String, refX: Double, refY: Double,
        profile: DeviceProfile, content: String
    ): JSONObject {
        return JSONObject().apply {
            put("type", type)
            put("x", profile.scaleX(refX.toFloat()).toDouble())
            put("y", profile.scaleY(refY.toFloat()).toDouble())
            put("content", content)
        }
    }
}
