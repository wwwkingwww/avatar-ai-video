package com.avatar.phoneagent.engine

import android.os.Environment
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

object VideoDownloader {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    private val downloadDir = File(Environment.getExternalStorageDirectory(), "videos")

    fun download(url: String, taskId: String): String {
        downloadDir.mkdirs()

        val ext = url.substringAfterLast('.').substringBefore('?').ifEmpty { "mp4" }
        val file = File(downloadDir, "${taskId}.${ext}")

        if (file.exists()) return file.absolutePath

        val request = Request.Builder().url(url).build()
        val response = client.newCall(request).execute()

        if (!response.isSuccessful) {
            throw Exception("下载失败: HTTP ${response.code}")
        }

        response.body?.byteStream()?.use { input ->
            FileOutputStream(file).use { output ->
                input.copyTo(output)
            }
        } ?: throw Exception("响应体为空")

        return file.absolutePath
    }
}
