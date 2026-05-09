plugins {
    java
}

allprojects {
    repositories {
        mavenCentral()
    }
}

subprojects {
    apply(plugin = "java")

    tasks.withType<JavaCompile>().configureEach {
        options.encoding = "UTF-8"
    }

    tasks.withType<Test>().configureEach {
        useJUnitPlatform()
    }
}

// Per-module Java targeting:
//   contract/   compiles to Java 8 bytecode (the neow3j devpack compiler reads
//               .class files and translates to NEF; bytecode features beyond
//               Java 8 will not compile)
//   deploy/     can use Java 17 (it's a regular JVM app, not on-chain code)
//   tests inside contract/ still target Java 8 source — the test extension
//   runs them on a normal JVM so it compiles fine, but keeping symmetry avoids
//   accidentally calling Java 11+ APIs from helpers shared with contract code.
project(":contract") {
    extensions.configure<JavaPluginExtension> {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}

project(":deploy") {
    extensions.configure<JavaPluginExtension> {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
