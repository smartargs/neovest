// Contract module. Compiles the VestingVault Java sources to Neo .nef bytecode
// using the neow3j devpack Gradle plugin.
//
// Outputs after `./gradlew :contract:neow3jCompile`:
//   build/neow3j/VestingVault.nef
//   build/neow3j/VestingVault.manifest.json

val neow3jVersion: String by project

plugins {
    id("io.neow3j.gradle-plugin") version "3.22.1"
}

dependencies {
    implementation("io.neow3j:devpack:$neow3jVersion")

    testImplementation("io.neow3j:devpack-test:$neow3jVersion")
    testImplementation("io.neow3j:contract:$neow3jVersion")
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.2")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation("org.assertj:assertj-core:3.25.3")
}

neow3jCompiler {
    className = "io.yourorg.vesting.VestingVault"
}

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
        showStandardStreams = false
    }
}
