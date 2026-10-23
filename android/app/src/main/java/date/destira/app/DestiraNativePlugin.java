package date.destira.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Small native checks the web code can't make itself (client/src/lib/native.ts).
 * hasFirebase: true only when this build includes google-services.json (the
 * google-services build step turns it into a "google_app_id" string resource).
 * Registering for push without it crashes the app, so the web code asks first.
 */
@CapacitorPlugin(name = "DestiraNative")
public class DestiraNativePlugin extends Plugin {
    @PluginMethod
    public void hasFirebase(PluginCall call) {
        int id = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        boolean ready = id != 0;
        JSObject ret = new JSObject();
        ret.put("value", ready);
        call.resolve(ret);
    }
}
