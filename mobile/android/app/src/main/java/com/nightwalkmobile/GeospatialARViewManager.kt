package com.nightwalkmobile

import android.content.Context
import android.opengl.GLSurfaceView
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.google.ar.core.Session
import android.widget.FrameLayout
import android.view.ViewGroup
import android.util.Log

class GeospatialARViewManager : SimpleViewManager<GeospatialARView>() {

    companion object {
        const val REACT_CLASS = "GeospatialARView"
    }

    override fun getName(): String {
        return REACT_CLASS
    }

    override fun createViewInstance(reactContext: ThemedReactContext): GeospatialARView {
        return GeospatialARView(reactContext)
    }
}

class GeospatialARView(context: Context) : FrameLayout(context) {
    private var surfaceView: GLSurfaceView = GLSurfaceView(context)
    private var renderer: GeospatialGLRenderer = GeospatialGLRenderer()
    private val TAG = "GeospatialARView"
    
    init {
        surfaceView.layoutParams = LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        
        // Set up OpenGL ES 2.0
        surfaceView.setEGLContextClientVersion(2)
        surfaceView.setRenderer(renderer)
        surfaceView.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
        
        addView(surfaceView)
        Log.d(TAG, "GeospatialARView initialized with GL Renderer")
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        surfaceView.onResume()
    }

    override fun onDetachedFromWindow() {
        surfaceView.onPause()
        super.onDetachedFromWindow()
    }
}
