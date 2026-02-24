package com.nightwalkmobile

import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.util.Log
import com.google.ar.core.Frame
import com.google.ar.core.Session
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

/**
 * Custom OpenGL ES Renderer for displaying the ARCore background physical camera feed.
 * Required because Android GLSurfaceView does not automatically draw ARCore frames.
 */
class GeospatialGLRenderer : GLSurfaceView.Renderer {

    private val TAG = "GeospatialGLRenderer"

    private var textureId = -1
    private var program = -1
    private var positionAttrib = -1
    private var texCoordAttrib = -1

    private var viewWidth = 0
    private var viewHeight = 0
    private var configuredSession: Session? = null

    // A full screen quad to draw the camera texture onto
    private val QUAD_COORDS = floatArrayOf(
        -1.0f, -1.0f,
         1.0f, -1.0f,
        -1.0f,  1.0f,
         1.0f,  1.0f
    )

    private val QUAD_TEXCOORDS = floatArrayOf(
        0.0f, 1.0f,
        1.0f, 1.0f,
        0.0f, 0.0f,
        1.0f, 0.0f
    )

    private val quadCoordsBuffer: FloatBuffer = ByteBuffer.allocateDirect(QUAD_COORDS.size * 4)
        .order(ByteOrder.nativeOrder()).asFloatBuffer().apply { put(QUAD_COORDS); position(0) }

    private val quadTexCoordsBuffer: FloatBuffer = ByteBuffer.allocateDirect(QUAD_TEXCOORDS.size * 4)
        .order(ByteOrder.nativeOrder()).asFloatBuffer().apply { put(QUAD_TEXCOORDS); position(0) }

    // Pre-allocate to prevent GC thrashing every frame
    private val transformedTexCoordsBuffer: FloatBuffer = ByteBuffer.allocateDirect(QUAD_TEXCOORDS.size * 4)
        .order(ByteOrder.nativeOrder()).asFloatBuffer()

    private val VERTEX_SHADER = """
        attribute vec4 a_Position;
        attribute vec2 a_TexCoord;
        varying vec2 v_TexCoord;
        void main() {
            gl_Position = a_Position;
            v_TexCoord = a_TexCoord;
        }
    """.trimIndent()

    // OES shader to read hardware camera buffer directly
    private val FRAGMENT_SHADER = """
        #extension GL_OES_EGL_image_external : require
        precision mediump float;
        varying vec2 v_TexCoord;
        uniform samplerExternalOES u_Texture;
        void main() {
            gl_FragColor = texture2D(u_Texture, v_TexCoord);
        }
    """.trimIndent()

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        GLES20.glClearColor(0.0f, 0.0f, 0.0f, 1.0f)

        // Generate the OES texture ID
        val textures = IntArray(1)
        GLES20.glGenTextures(1, textures, 0)
        textureId = textures[0]
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
        
        // Tells GL how to read the texture
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_NEAREST)
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)

        // Compile shaders
        val vertexShader = compileShader(GLES20.GL_VERTEX_SHADER, VERTEX_SHADER)
        val fragmentShader = compileShader(GLES20.GL_FRAGMENT_SHADER, FRAGMENT_SHADER)

        program = GLES20.glCreateProgram()
        GLES20.glAttachShader(program, vertexShader)
        GLES20.glAttachShader(program, fragmentShader)
        GLES20.glLinkProgram(program)

        positionAttrib = GLES20.glGetAttribLocation(program, "a_Position")
        texCoordAttrib = GLES20.glGetAttribLocation(program, "a_TexCoord")

        // Set the uniform just once
        GLES20.glUseProgram(program)
        val texUniform = GLES20.glGetUniformLocation(program, "u_Texture")
        GLES20.glUniform1i(texUniform, 0)
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        GLES20.glViewport(0, 0, width, height)
        viewWidth = width
        viewHeight = height
        
        val session = GeospatialModule.currentSession
        if (session != null) {
            // Note: ARCore needs the display rotation (0 = portrait, 1 = landscape left, etc)
            // Hardcoded 0 for portrait for simplicity right now
            session.setDisplayGeometry(0, width, height)
            configuredSession = session
        }
    }

    override fun onDrawFrame(gl: GL10?) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
        
        val frame: Frame
        try {
            synchronized(GeospatialModule.sessionLock) {
                val session = GeospatialModule.currentSession ?: return
                
                // If a new session has appeared, configure its texture and geometry!
                if (configuredSession != session) {
                    session.setCameraTextureName(textureId)
                    if (viewWidth > 0 && viewHeight > 0) {
                        try {
                            session.setDisplayGeometry(0, viewWidth, viewHeight)
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to set display geometry", e)
                        }
                    }
                    configuredSession = session
                }

                // Get the latest frame
                frame = session.update()
            }
        } catch (e: Exception) {
            // Can happen if the session is not tracking or Camera throws exception
            return
        }

        try {
            // Draw background
            GLES20.glUseProgram(program)
            GLES20.glDisable(GLES20.GL_DEPTH_TEST)
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
            GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)

            // ARCore rotates the UV coordinates to map physical orientation -> screen orientation
            // CRITICAL: We MUST reset the input buffer position BEFORE passing it, otherwise it reads out of bounds
            quadTexCoordsBuffer.position(0)
            transformedTexCoordsBuffer.position(0)
            frame.transformDisplayUvCoords(quadTexCoordsBuffer, transformedTexCoordsBuffer)
            
            // VERY IMPORTANT: Reset the buffer read position to 0 or it samples nothing (mono color)
            transformedTexCoordsBuffer.position(0)
            quadCoordsBuffer.position(0)

            GLES20.glEnableVertexAttribArray(positionAttrib)
            GLES20.glVertexAttribPointer(positionAttrib, 2, GLES20.GL_FLOAT, false, 0, quadCoordsBuffer)

            GLES20.glEnableVertexAttribArray(texCoordAttrib)
            GLES20.glVertexAttribPointer(texCoordAttrib, 2, GLES20.GL_FLOAT, false, 0, transformedTexCoordsBuffer)

            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)

            GLES20.glDisableVertexAttribArray(positionAttrib)
            GLES20.glDisableVertexAttribArray(texCoordAttrib)

        } catch (e: Exception) {
            // Can happen if the session is not tracking or Camera throws exception
        }
    }

    private fun compileShader(type: Int, code: String): Int {
        val shader = GLES20.glCreateShader(type)
        GLES20.glShaderSource(shader, code)
        GLES20.glCompileShader(shader)
        return shader
    }
}
