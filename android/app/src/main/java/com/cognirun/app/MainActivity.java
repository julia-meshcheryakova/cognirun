package com.cognirun.app;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // WebView SpeechRecognition (STT) asks the web layer for the mic; without
        // this grant the request is silently denied and STT reports "nothing heard".
        // Subclass Capacitor's chrome client so the bridge (file chooser, dialogs)
        // keeps working; the RECORD_AUDIO runtime prompt is still handled by Capacitor.
        this.bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                            return;
                        }
                    }
                    // Non-audio requests: deny (Capacitor's default behaviour).
                    request.deny();
                });
            }
        });
    }
}
