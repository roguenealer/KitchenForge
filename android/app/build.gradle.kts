plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.kitchenforge.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.kitchenforge.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 7
        versionName = "1.4.0"
    }

    signingConfigs {
        create("release") {
            storeFile = file("../kitchenforge-release.jks")
            storePassword = "kitchenforge123"
            keyAlias = "kitchenforge"
            keyPassword = "kitchenforge123"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.webkit:webkit:1.10.0")
}
