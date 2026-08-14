package chatgpt.site.shengxi;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.speech.RecognitionListener;
import android.speech.SpeechRecognizer;
import android.webkit.JavascriptInterface;
import android.webkit.WebBackForwardList;
import android.webkit.WebHistoryItem;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

import java.util.ArrayList;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int MICROPHONE_PERMISSION = 41;
    private static final int SPEECH_REQUEST = 42;
    private static final int CAMERA_REQUEST = 43;
    private static final int PHOTO_PICK_REQUEST = 44;
    private static final int BACKUP_CREATE_REQUEST = 45;
    private static final int BACKUP_OPEN_REQUEST = 46;
    private static final String APP_ASSET_PREFIX = "file:///android_asset/";
    private static final String APP_START_URL = APP_ASSET_PREFIX + "index.html";

    private WebView webView;
    private boolean speechWaitingForPermission;
    private SpeechRecognizer speechRecognizer;
    private String pendingBackupJson;

    private static final String SPEECH_POLYFILL = "(function(){" +
        "if(window.__shengxiNativeSpeechInstalled)return;window.__shengxiNativeSpeechInstalled=true;" +
        "function R(){this.lang='zh-CN';this.interimResults=false;this.onresult=null;this.onerror=null;this.onend=null;}" +
        "R.prototype.start=function(){window.__shengxiRecognizer=this;AndroidSpeech.start();};" +
        "window.__shengxiSpeechSuccess=function(t){var r=window.__shengxiRecognizer;if(!r)return;" +
        "var x={0:{transcript:t},length:1,isFinal:true};if(r.onresult)r.onresult({results:{0:x,length:1}});if(r.onend)r.onend();};" +
        "window.__shengxiSpeechError=function(code){var r=window.__shengxiRecognizer;if(!r)return;if(r.onerror)r.onerror({error:code||'no-speech'});if(r.onend)r.onend();};" +
        "window.SpeechRecognition=R;window.webkitSpeechRecognition=R;})();";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(238, 248, 233));
        getWindow().setNavigationBarColor(Color.rgb(255, 248, 236));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(255, 248, 236));
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        // Asset URLs require file access. Cross-file and cross-origin reads remain disabled below.
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " ShengxiAndroid/1.0");

        webView.addJavascriptInterface(new SpeechBridge(), "AndroidSpeech");
        webView.addJavascriptInterface(new MediaBridge(), "AndroidMedia");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isTrustedAssetUrl(request.getUrl().toString());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !isTrustedAssetUrl(url);
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (isTrustedAssetUrl(url) || isAllowedDataImage(url)) return super.shouldInterceptRequest(view, request);
                return blockedResource();
            }

            @Override
            @SuppressWarnings("deprecation")
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                if (isTrustedAssetUrl(url) || isAllowedDataImage(url)) return super.shouldInterceptRequest(view, url);
                return blockedResource();
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (!isTrustedAssetUrl(url)) {
                    view.stopLoading();
                    view.loadUrl(APP_START_URL);
                    return;
                }
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (isTrustedAssetUrl(url)) view.evaluateJavascript(SPEECH_POLYFILL, null);
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(APP_START_URL);
        } else {
            WebBackForwardList restored = webView.restoreState(savedInstanceState);
            WebHistoryItem current = restored == null ? null : restored.getCurrentItem();
            if (current == null || !isTrustedAssetUrl(current.getUrl())) {
                webView.clearHistory();
                webView.loadUrl(APP_START_URL);
            }
        }
    }

    private static boolean isTrustedAssetUrl(String url) {
        if (url == null || !url.startsWith(APP_ASSET_PREFIX)) return false;
        Uri uri = Uri.parse(url);
        String authority = uri.getAuthority();
        String path = uri.getPath();
        return "file".equalsIgnoreCase(uri.getScheme())
            && (authority == null || authority.isEmpty())
            && path != null
            && path.startsWith("/android_asset/")
            && !path.contains("..");
    }

    private static boolean isAllowedDataImage(String url) {
        return url != null && (url.startsWith("data:image/jpeg;base64,") || url.startsWith("data:image/png;base64,"));
    }

    private static WebResourceResponse blockedResource() {
        return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    private void requestSpeech() {
        if (android.os.Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            speechWaitingForPermission = true;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MICROPHONE_PERMISSION);
            return;
        }
        launchSpeechRecognizer();
    }

    private void launchSpeechRecognizer() {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.SIMPLIFIED_CHINESE.toLanguageTag());
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);

        if (SpeechRecognizer.isRecognitionAvailable(this)) {
            try {
                if (speechRecognizer != null) speechRecognizer.destroy();
                if (android.os.Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
                    speechRecognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this);
                } else {
                    speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
                }
                speechRecognizer.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle params) { }
                    @Override public void onBeginningOfSpeech() { }
                    @Override public void onRmsChanged(float rmsdB) { }
                    @Override public void onBufferReceived(byte[] buffer) { }
                    @Override public void onEndOfSpeech() { }
                    @Override public void onPartialResults(Bundle partialResults) { }
                    @Override public void onEvent(int eventType, Bundle params) { }

                    @Override
                    public void onResults(Bundle results) {
                        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (matches != null && !matches.isEmpty()) sendSpeechSuccess(matches.get(0));
                        else sendSpeechError("no-speech");
                    }

                    @Override
                    public void onError(int error) {
                        String code = error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS
                            ? "not-allowed"
                            : error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY
                                ? "busy"
                                : "no-speech";
                        sendSpeechError(code);
                    }
                });
                speechRecognizer.startListening(intent);
                return;
            } catch (Exception ignored) {
                if (speechRecognizer != null) {
                    speechRecognizer.destroy();
                    speechRecognizer = null;
                }
            }
        }

        launchSpeechActivity(intent);
    }

    private void launchSpeechActivity(Intent intent) {
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "请说出要记录的内容");
        try {
            startActivityForResult(intent, SPEECH_REQUEST);
        } catch (Exception error) {
            Toast.makeText(this, "系统语音服务未启用，可在系统设置中启用语音识别", Toast.LENGTH_LONG).show();
            sendSpeechError("service-unavailable");
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != MICROPHONE_PERMISSION || !speechWaitingForPermission) return;
        speechWaitingForPermission = false;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) launchSpeechRecognizer();
        else {
            Toast.makeText(this, "请允许麦克风权限后再使用语音记录", Toast.LENGTH_LONG).show();
            sendSpeechError("not-allowed");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == CAMERA_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getExtras() != null) {
                Object image = data.getExtras().get("data");
                if (image instanceof Bitmap) sendAvatar((Bitmap) image);
            }
            return;
        }
        if (requestCode == PHOTO_PICK_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                try (InputStream stream = getContentResolver().openInputStream(data.getData())) {
                    Bitmap bitmap = BitmapFactory.decodeStream(stream);
                    if (bitmap != null) sendAvatar(bitmap);
                } catch (Exception error) {
                    Toast.makeText(this, "没有读取到这张照片", Toast.LENGTH_SHORT).show();
                }
            }
            return;
        }
        if (requestCode == BACKUP_CREATE_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingBackupJson != null) {
                try (OutputStream stream = getContentResolver().openOutputStream(data.getData())) {
                    if (stream == null) throw new IllegalStateException("No output stream");
                    stream.write(pendingBackupJson.getBytes(StandardCharsets.UTF_8));
                    stream.flush();
                    sendBackupMessage("备份文件已保存到手机 🔒");
                } catch (Exception error) {
                    sendBackupMessage("备份保存失败，请换一个位置再试");
                }
            }
            pendingBackupJson = null;
            return;
        }
        if (requestCode == BACKUP_OPEN_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                try (InputStream stream = getContentResolver().openInputStream(data.getData()); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    if (stream == null) throw new IllegalStateException("No input stream");
                    byte[] buffer = new byte[8192];
                    int count;
                    while ((count = stream.read(buffer)) != -1) output.write(buffer, 0, count);
                    String json = new String(output.toByteArray(), StandardCharsets.UTF_8);
                    webView.evaluateJavascript("window.__shengxiBackupImported(" + org.json.JSONObject.quote(json) + ")", null);
                } catch (Exception error) {
                    sendBackupMessage("没有读取到有效的备份文件");
                }
            }
            return;
        }
        if (requestCode != SPEECH_REQUEST) return;
        if (resultCode == RESULT_OK && data != null) {
            ArrayList<String> results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (results != null && !results.isEmpty()) {
                sendSpeechSuccess(results.get(0));
                return;
            }
        }
        sendSpeechError("no-speech");
    }

    private void sendSpeechSuccess(String text) {
        String quoted = org.json.JSONObject.quote(text);
        webView.evaluateJavascript("window.__shengxiSpeechSuccess(" + quoted + ")", null);
    }

    private void sendSpeechError(String code) {
        webView.evaluateJavascript("window.__shengxiSpeechError(" + org.json.JSONObject.quote(code) + ")", null);
    }

    private void sendBackupMessage(String message) {
        webView.evaluateJavascript("window.__shengxiBackupMessage(" + org.json.JSONObject.quote(message) + ")", null);
    }

    @Override
    protected void onDestroy() {
        if (speechRecognizer != null) speechRecognizer.destroy();
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    private void sendAvatar(Bitmap original) {
        int width = original.getWidth();
        int height = original.getHeight();
        float scale = Math.min(1f, 512f / Math.max(width, height));
        Bitmap bitmap = scale < 1f ? Bitmap.createScaledBitmap(original, Math.round(width * scale), Math.round(height * scale), true) : original;
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, 82, output);
        String dataUrl = "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
        webView.evaluateJavascript("window.__shengxiAvatarSelected(" + org.json.JSONObject.quote(dataUrl) + ")", null);
    }

    private final class SpeechBridge {
        @JavascriptInterface
        public void start() {
            runOnUiThread(() -> requestSpeech());
        }
    }

    private final class MediaBridge {
        @JavascriptInterface
        public void takePhoto() {
            runOnUiThread(() -> {
                try {
                    startActivityForResult(new Intent("android.media.action.IMAGE_CAPTURE"), CAMERA_REQUEST);
                } catch (Exception error) {
                    Toast.makeText(MainActivity.this, "没有找到相机", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void choosePhoto() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                startActivityForResult(intent, PHOTO_PICK_REQUEST);
            });
        }

        @JavascriptInterface
        public void exportBackup(String json, String filename) {
            runOnUiThread(() -> {
                pendingBackupJson = json;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, filename);
                try {
                    startActivityForResult(intent, BACKUP_CREATE_REQUEST);
                } catch (Exception error) {
                    pendingBackupJson = null;
                    sendBackupMessage("手机没有可用的文件保存程序");
                }
            });
        }

        @JavascriptInterface
        public void importBackup() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                try {
                    startActivityForResult(intent, BACKUP_OPEN_REQUEST);
                } catch (Exception error) {
                    sendBackupMessage("手机没有可用的文件选择程序");
                }
            });
        }
    }
}
