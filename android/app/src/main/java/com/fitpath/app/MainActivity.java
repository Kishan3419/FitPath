package com.fitpath.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.Gravity;
import android.graphics.drawable.GradientDrawable;
import android.widget.TextView;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.text.InputType;
import android.net.Uri;

/**
 * A very small Android WebView wrapper. All product UI, exercise guidance,
 * diet information and user state live in the JavaScript application on your VPS.
 * The remote URL is configured once on the first launch; HTTPS is required.
 */
public final class MainActivity extends Activity {
    private WebView webView;
    private String serverUrl;
    private boolean hadConnectionError = false;
    private static final String PREFS = "fitpath_settings";
    private static final String KEY_URL = "server_url";

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        getWindow().setStatusBarColor(Color.rgb(12,20,19));
        getWindow().setNavigationBarColor(Color.rgb(12,20,19));
        getWindow().getDecorView().setSystemUiVisibility(0);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(11,18,17));
        webView.setWebChromeClient(new WebChromeClient());
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri dest = request.getUrl();
                if(serverUrl != null && dest.toString().startsWith(serverUrl + "/")) return false;
                if(serverUrl != null && dest.toString().equals(serverUrl)) return false;
                Toast.makeText(MainActivity.this,"External links are not opened in FitPath.",Toast.LENGTH_SHORT).show();
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if(request.isForMainFrame() && !hadConnectionError) {
                    hadConnectionError = true;
                    new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Server unavailable")
                        .setMessage("FitPath could not reach your server. Check its HTTPS address, DNS and firewall settings.")
                        .setPositiveButton("Change server",(dialog,which)->askForServer())
                        .setNegativeButton("Retry",(dialog,which)->loadServer())
                        .show();
                }
            }
        });
        // A visible settings control is important because we use a no-ActionBar theme.
        FrameLayout root = new FrameLayout(this);
        root.addView(webView,new FrameLayout.LayoutParams(-1,-1));
        TextView settingsButton = new TextView(this);
        settingsButton.setText("⚙");
        settingsButton.setTextSize(22);
        settingsButton.setTextColor(Color.rgb(193,243,165));
        settingsButton.setGravity(Gravity.CENTER);
        settingsButton.setContentDescription("Server settings");
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.rgb(33,53,40));
        background.setCornerRadius(14 * getResources().getDisplayMetrics().density);
        settingsButton.setBackground(background);
        int buttonPx = (int)(42 * getResources().getDisplayMetrics().density);
        int marginPx = (int)(13 * getResources().getDisplayMetrics().density);
        FrameLayout.LayoutParams layout = new FrameLayout.LayoutParams(buttonPx,buttonPx,Gravity.TOP|Gravity.RIGHT);
        layout.topMargin=marginPx;
        layout.rightMargin=marginPx;
        root.addView(settingsButton,layout);
        settingsButton.setOnClickListener(v->askForServer());
        setContentView(root);
        serverUrl = getSharedPreferences(PREFS,MODE_PRIVATE).getString(KEY_URL,"");
        if(serverUrl.isEmpty()) askForServer(); else loadServer();
    }

    private void loadServer() {
        hadConnectionError=false;
        if(serverUrl != null && !serverUrl.isEmpty()) webView.loadUrl(serverUrl + "/");
    }

    private void askForServer() {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setSingleLine(true);
        input.setText(serverUrl == null ? "" : serverUrl);
        input.setHint("https://fitness.example.com");
        final FrameLayout frame = new FrameLayout(this);
        int margin = (int)(24 * getResources().getDisplayMetrics().density);
        frame.setPadding(margin,margin/2,margin,0);
        frame.addView(input);
        AlertDialog dlg = new AlertDialog.Builder(this)
            .setTitle("Connect to your FitPath server")
            .setMessage("Enter the HTTPS address of your deployed FitPath app. This is saved on your device.")
            .setView(frame)
            .setPositiveButton("Connect",null)
            .setNegativeButton("Cancel",(dialog,which)->{})
            .create();
        dlg.setOnShowListener(v -> dlg.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(btn -> {
            String value = input.getText().toString().trim().replaceAll("/+$", "");
            Uri u = Uri.parse(value);
            if(!"https".equalsIgnoreCase(u.getScheme()) || u.getHost()==null || u.getHost().isEmpty() || u.getUserInfo()!=null || u.getQuery()!=null || u.getFragment()!=null || (u.getPath()!=null && !u.getPath().isEmpty())) {
                input.setError("Use https://your-domain.com (without a path)");
                return;
            }
            serverUrl = value;
            getSharedPreferences(PREFS,MODE_PRIVATE).edit().putString(KEY_URL,serverUrl).apply();
            dlg.dismiss();
            loadServer();
        }));
        dlg.show();
    }

    @Override public boolean onCreateOptionsMenu(Menu menu) {
        menu.add(0,1,0,"Change server");
        menu.add(0,2,1,"Reload");
        return true;
    }
    @Override public boolean onOptionsItemSelected(MenuItem item) {
        if(item.getItemId()==1) {askForServer();return true;}
        if(item.getItemId()==2) {loadServer();return true;}
        return super.onOptionsItemSelected(item);
    }
    @Override public void onBackPressed() {
        if(webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
