#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SHENGXI_BUILD_DIR="$PROJECT_DIR/build"
SHENGXI_OUTPUT_DIR="$PROJECT_DIR/output"
SHENGXI_SIGNING_DIR="$PROJECT_DIR/.signing"
SHENGXI_JAVA_HOME=${SHENGXI_JAVA_HOME:?请设置 SHENGXI_JAVA_HOME}
SHENGXI_ANDROID_SDK=${SHENGXI_ANDROID_SDK:?请设置 SHENGXI_ANDROID_SDK}
SHENGXI_KEYSTORE_PASSWORD=${SHENGXI_KEYSTORE_PASSWORD:?请设置 SHENGXI_KEYSTORE_PASSWORD}
SHENGXI_KEY_PASSWORD=${SHENGXI_KEY_PASSWORD:-$SHENGXI_KEYSTORE_PASSWORD}
SHENGXI_BUILD_TOOLS="$SHENGXI_ANDROID_SDK/build-tools/36.1.0"
SHENGXI_ANDROID_JAR="$SHENGXI_ANDROID_SDK/platforms/android-36/android.jar"
SHENGXI_VERSION_CODE=7
SHENGXI_VERSION_NAME=1.6
SHENGXI_VERSIONED_APK="$SHENGXI_OUTPUT_DIR/healthy-pig-$SHENGXI_VERSION_NAME.apk"
SHENGXI_LATEST_APK="$SHENGXI_OUTPUT_DIR/healthy-pig.apk"

mkdir -p "$SHENGXI_BUILD_DIR/compiled" "$SHENGXI_BUILD_DIR/generated" "$SHENGXI_BUILD_DIR/classes" "$SHENGXI_BUILD_DIR/dex" "$SHENGXI_OUTPUT_DIR" "$SHENGXI_SIGNING_DIR"

"$SHENGXI_BUILD_TOOLS/aapt2" compile --dir "$PROJECT_DIR/res" -o "$SHENGXI_BUILD_DIR/resources.zip"
"$SHENGXI_BUILD_TOOLS/aapt2" link \
  -I "$SHENGXI_ANDROID_JAR" \
  --manifest "$PROJECT_DIR/AndroidManifest.xml" \
  --java "$SHENGXI_BUILD_DIR/generated" \
  --min-sdk-version 26 \
  --target-sdk-version 36 \
  --version-code "$SHENGXI_VERSION_CODE" \
  --version-name "$SHENGXI_VERSION_NAME" \
  -A "$PROJECT_DIR/assets" \
  -o "$SHENGXI_BUILD_DIR/base-unsigned.apk" \
  "$SHENGXI_BUILD_DIR/resources.zip"

find "$PROJECT_DIR/src" "$SHENGXI_BUILD_DIR/generated" -name '*.java' -print > "$SHENGXI_BUILD_DIR/java-sources.txt"
"$SHENGXI_JAVA_HOME/bin/javac" --release 17 -encoding UTF-8 -classpath "$SHENGXI_ANDROID_JAR" -d "$SHENGXI_BUILD_DIR/classes" @"$SHENGXI_BUILD_DIR/java-sources.txt"
"$SHENGXI_JAVA_HOME/bin/jar" cf "$SHENGXI_BUILD_DIR/classes.jar" -C "$SHENGXI_BUILD_DIR/classes" .
"$SHENGXI_JAVA_HOME/bin/java" -cp "$SHENGXI_BUILD_TOOLS/lib/d8.jar" com.android.tools.r8.D8 \
  --lib "$SHENGXI_ANDROID_JAR" \
  --min-api 26 \
  --output "$SHENGXI_BUILD_DIR/dex" \
  "$SHENGXI_BUILD_DIR/classes.jar"

cp "$SHENGXI_BUILD_DIR/base-unsigned.apk" "$SHENGXI_BUILD_DIR/with-dex.apk"
(cd "$SHENGXI_BUILD_DIR/dex" && zip -q "$SHENGXI_BUILD_DIR/with-dex.apk" classes.dex)
"$SHENGXI_BUILD_TOOLS/zipalign" -f -p 4 "$SHENGXI_BUILD_DIR/with-dex.apk" "$SHENGXI_BUILD_DIR/aligned.apk"

if [ ! -f "$SHENGXI_SIGNING_DIR/shengxi-debug.jks" ]; then
  "$SHENGXI_JAVA_HOME/bin/keytool" -genkeypair -noprompt \
    -keystore "$SHENGXI_SIGNING_DIR/shengxi-debug.jks" \
    -storepass "$SHENGXI_KEYSTORE_PASSWORD" \
    -keypass "$SHENGXI_KEY_PASSWORD" \
    -alias shengxi \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "CN=Shengxi Local App, O=Shengxi, C=CN"
fi

"$SHENGXI_JAVA_HOME/bin/java" -jar "$SHENGXI_BUILD_TOOLS/lib/apksigner.jar" sign \
  --ks "$SHENGXI_SIGNING_DIR/shengxi-debug.jks" \
  --ks-key-alias shengxi \
  --ks-pass "pass:$SHENGXI_KEYSTORE_PASSWORD" \
  --key-pass "pass:$SHENGXI_KEY_PASSWORD" \
  --out "$SHENGXI_VERSIONED_APK" \
  "$SHENGXI_BUILD_DIR/aligned.apk"

"$SHENGXI_JAVA_HOME/bin/java" -jar "$SHENGXI_BUILD_TOOLS/lib/apksigner.jar" verify --verbose "$SHENGXI_VERSIONED_APK"
cp "$SHENGXI_VERSIONED_APK" "$SHENGXI_LATEST_APK"
echo "$SHENGXI_VERSIONED_APK"
