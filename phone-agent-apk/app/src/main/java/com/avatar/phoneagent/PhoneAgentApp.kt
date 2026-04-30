package com.avatar.phoneagent

import android.app.Application

class PhoneAgentApp : Application() {
    companion object {
        lateinit var instance: PhoneAgentApp
            private set
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }
}
