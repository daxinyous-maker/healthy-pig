# 健康小猪 Android APK

这是「健康小猪」健康管理的离线安卓版本。页面和健康记录都保存在手机本地，不依赖 `chatgpt.site`，并通过安卓原生语音识别提供语音转文字能力。

卸载应用会清除本机记录；这个版本不包含跨设备同步。

## 构建

需要 JDK 21 与 Android SDK 36：

```sh
SHENGXI_JAVA_HOME=/path/to/jdk/Contents/Home \
SHENGXI_ANDROID_SDK=/path/to/Android/sdk \
SHENGXI_KEYSTORE_PASSWORD='仅保存在本机的签名密码' \
./build-apk.sh
```

签名密码只通过本机环境变量传入，不要写入代码、提交到 GitHub 或发给其他人。已有签名文件时继续使用同一个密码，才能覆盖安装并保留应用数据。

生成的版本安装包位于 `output/healthy-pig-1.6.apk`，同时保留稳定文件名 `output/healthy-pig.apk`。首次安装时，安卓可能提示允许安装未知来源应用。
