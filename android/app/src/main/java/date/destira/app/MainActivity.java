package date.destira.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DestiraNativePlugin.class);
        super.onCreate(savedInstanceState);
        fitAboveKeyboard();
        createNotificationChannel();
        followConnectivity();
    }

    // Offline, the web view serves what it already has (member photos, event
    // covers) even if it's past its cache date, instead of broken images.
    // Online, normal caching rules apply again.
    private void followConnectivity() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        setOfflineCaching(!isOnline(cm));
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return;
        cm.registerDefaultNetworkCallback(new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                setOfflineCaching(false);
            }

            @Override
            public void onLost(Network network) {
                setOfflineCaching(!isOnline(cm));
            }
        });
    }

    private boolean isOnline(ConnectivityManager cm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private void setOfflineCaching(boolean offline) {
        runOnUiThread(() -> {
            if (getBridge() == null) return;
            WebView webView = getBridge().getWebView();
            if (webView == null) return;
            webView.getSettings().setCacheMode(offline ? WebSettings.LOAD_CACHE_ELSE_NETWORK : WebSettings.LOAD_DEFAULT);
        });
    }

    // Android 15+ draws the app edge to edge, and there the keyboard no longer
    // resizes the window: it slides over the web view, hiding a chat's
    // composer. Capacitor's own edge-to-edge handling (adjustMarginsForEdgeToEdge
    // in capacitor.config.ts) keeps the web view clear of the status and
    // navigation bars only; this replaces it with the same margins plus the
    // keyboard, so the page shrinks to the space above it (the web side,
    // lib/keyboard-overlay.ts, then has nothing to do).
    private void fitAboveKeyboard() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) return;
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) v.getLayoutParams();
            mlp.leftMargin = bars.left;
            mlp.topMargin = bars.top;
            mlp.rightMargin = bars.right;
            mlp.bottomMargin = Math.max(bars.bottom, ime.bottom);
            v.setLayoutParams(mlp);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    // The one channel push arrives on (server/push.ts sends channelId "destira").
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            "destira", "Destira", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Matches, messages, your twin and events");
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(channel);
    }
}
