package date.destira.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DestiraNativePlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannel();
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
