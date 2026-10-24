package date.destira.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DestiraNativePlugin.class);
        super.onCreate(savedInstanceState);
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
