import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val targetTriple = when (target) {
            "aarch64" -> "aarch64-linux-android"
            "armv7" -> "armv7-linux-androideabi"
            "i686" -> "i686-linux-android"
            "x86_64" -> "x86_64-linux-android"
            else -> target!!
        }
        val abi = when (target) {
            "aarch64" -> "arm64-v8a"
            "armv7" -> "armeabi-v7a"
            "i686" -> "x86"
            "x86_64" -> "x86_64"
            else -> target!!
        }
        val rootDir = File(project.projectDir, rootDirRel!!).canonicalFile
        val profile = if (release == true) "release" else "debug"
        val soSource = File(rootDir, "target/$targetTriple/$profile/libhuangguo_client_lib.so")
        val releaseSoSource = File(rootDir, "target/$targetTriple/release/libhuangguo_client_lib.so")
        val debugSoSource = File(rootDir, "target/$targetTriple/debug/libhuangguo_client_lib.so")
        val jniDir = File(project.projectDir, "src/main/jniLibs/$abi")
        jniDir.mkdirs()
        val soDest = File(jniDir, "libhuangguo_client_lib.so")

        var foundSo = listOf(soSource, releaseSoSource, debugSoSource).firstOrNull { it.exists() }

        if (foundSo == null) {
            val executable = "pnpm"
            try {
                runTauriCli(executable)
            } catch (e: Exception) {
                if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                    val fallbacks = listOf("$executable.cmd", "$executable.exe", "$executable.bat")
                    for (fallback in fallbacks) {
                        try {
                            runTauriCli(fallback)
                            break
                        } catch (_: Exception) {}
                    }
                }
            }
            foundSo = listOf(soSource, releaseSoSource, debugSoSource).firstOrNull { it.exists() }
        }

        if (foundSo != null && foundSo.exists()) {
            project.logger.lifecycle("Copying native library ${foundSo.absolutePath} to ${soDest.absolutePath}")
            foundSo.copyTo(soDest, overwrite = true)
        } else {
            throw GradleException("Could not find or build native library for $targetTriple. Searched in: ${soSource.absolutePath}, ${releaseSoSource.absolutePath}")
        }
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = listOf("tauri", "android", "android-studio-script")

        project.exec {
            workingDir(File(project.projectDir, rootDirRel))
            executable(executable)
            args(args)
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}
