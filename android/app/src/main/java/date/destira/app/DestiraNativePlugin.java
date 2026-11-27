package date.destira.app;

import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

/**
 * Small native checks the web code can't make itself (client/src/lib/native.ts).
 * hasFirebase: true only when this build includes google-services.json (the
 * google-services build step turns it into a "google_app_id" string resource).
 * Registering for push without it crashes the app, so the web code asks first.
 * setSecure: blocks screenshots and screen recording while a video call is on
 * (FLAG_SECURE), so nobody can capture the person they're talking to.
 * requestReview: Google Play's in-app rating card (client/src/lib/review-prompt.ts
 * decides when). Play decides whether it actually shows and never says if the
 * member rated, so this always resolves.
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

    @PluginMethod
    public void setSecure(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getActivity().runOnUiThread(() -> {
            if (enabled) {
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            } else {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void requestReview(PluginCall call) {
        ReviewManager manager = ReviewManagerFactory.create(getContext());
        manager.requestReviewFlow().addOnCompleteListener(request -> {
            if (!request.isSuccessful()) {
                call.resolve();
                return;
            }
            ReviewInfo info = request.getResult();
            getActivity().runOnUiThread(() ->
                manager.launchReviewFlow(getActivity(), info).addOnCompleteListener(done -> call.resolve())
            );
        });
    }
}
