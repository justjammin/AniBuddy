plugins {
    id("org.jetbrains.kotlin.jvm") version "2.1.21"
    id("org.jetbrains.intellij.platform") version "2.5.0"
}

group   = "com.justjammin"
version = "0.1.0"

repositories {
    mavenCentral()
    intellijPlatform { defaultRepositories() }
}

dependencies {
    intellijPlatform {
        // Targets IntelliJ IDEA Community — also runs on all other JB IDEs
        intellijIdeaCommunity("2024.3")
        bundledPlugin("com.intellij.java")
    }
    // Coroutines for the file watcher
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
}

intellijPlatform {
    pluginConfiguration {
        name = "Anibuddy"
        version = "0.1.0"
        ideaVersion {
            sinceBuild = "243"   // 2024.3
            untilBuild = provider { null } // no upper bound
        }
    }
    signing {
        // Add your JetBrains Marketplace signing credentials here for publishing
    }
    publishing {
        token = providers.environmentVariable("JETBRAINS_MARKETPLACE_TOKEN")
    }
}

tasks {
    withType<JavaCompile> {
        sourceCompatibility = "17"
        targetCompatibility = "17"
    }
    compileKotlin { kotlinOptions.jvmTarget = "17" }
    compileTestKotlin { kotlinOptions.jvmTarget = "17" }
    buildSearchableOptions { enabled = false }
}
