# MapLibre Native — JNI арқылы шақырылатын кластар
-keep class org.maplibre.** { *; }
-dontwarn org.maplibre.**
# kotlinx.serialization (тек JsonElement API қолданылады)
-dontwarn kotlinx.serialization.**
# WorkManager жұмысшылары рефлексиямен құрылады
-keep class * extends androidx.work.ListenableWorker { <init>(...); }
