package asia.whunlp.together;

import android.os.Bundle;

import androidx.activity.EdgeToEdge;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 边到边（沉浸式）：状态栏、手势条透明，网页内容延伸到系统栏下面；
        // 图标明暗随系统深色模式切换。安全区由网页 viewport-fit=cover + env()/Capacitor 注入的变量处理。
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
