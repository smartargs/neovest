// Deployment scripts. Standalone Java app that uploads the compiled .nef +
// manifest produced by `:contract:neow3jCompile` to a Neo network.

val neow3jVersion: String by project

plugins {
    application
}

dependencies {
    implementation("io.neow3j:contract:$neow3jVersion")
    implementation("org.slf4j:slf4j-simple:2.0.13")
}

application {
    // Override at the CLI: ./gradlew :deploy:run -PmainClass=io.yourorg.vesting.deploy.DeployLocal
    val cls = (project.findProperty("mainClass") as String?) ?: "io.yourorg.vesting.deploy.Deploy"
    mainClass.set(cls)
}
