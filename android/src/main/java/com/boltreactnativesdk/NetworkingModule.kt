package com.boltreactnativesdk

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * TurboModule implementation for native HTTP networking on Android.
 * Provides high-performance HTTP for non-UI API calls like tokenization.
 */
class NetworkingModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "BoltNetworking"
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun request(method: String, url: String, headers: String, body: String, promise: Promise) {
        Thread {
            try {
                val connection = URL(url).openConnection() as HttpURLConnection
                connection.requestMethod = method

                // Parse and set headers
                try {
                    val headerObj = JSONObject(headers)
                    val keys = headerObj.keys()
                    while (keys.hasNext()) {
                        val key = keys.next()
                        connection.setRequestProperty(key, headerObj.getString(key))
                    }
                } catch (_: Exception) {
                    // headers may be empty or invalid JSON
                }

                // Set body if not empty
                if (body.isNotEmpty() && method != "GET" && method != "HEAD") {
                    connection.doOutput = true
                    OutputStreamWriter(connection.outputStream).use { writer ->
                        writer.write(body)
                        writer.flush()
                    }
                }

                val status = connection.responseCode
                val responseHeaders = JSONObject()
                connection.headerFields?.forEach { (key, values) ->
                    if (key != null && values.isNotEmpty()) {
                        responseHeaders.put(key, values.joinToString(", "))
                    }
                }

                val inputStream = if (status >= 400) {
                    connection.errorStream
                } else {
                    connection.inputStream
                }

                val responseBody = inputStream?.let {
                    BufferedReader(InputStreamReader(it)).readText()
                } ?: ""

                val result = JSONObject()
                result.put("status", status)
                result.put("headers", responseHeaders)
                result.put("body", responseBody)

                promise.resolve(result.toString())

                connection.disconnect()
            } catch (e: Exception) {
                promise.reject("NETWORK_ERROR", e.message, e)
            }
        }.start()
    }
}
