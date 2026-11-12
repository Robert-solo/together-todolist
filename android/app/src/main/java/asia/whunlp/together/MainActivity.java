package asia.whunlp.together;

import android.os.Bundle;

import androidx.activity.EdgeToEdge;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // super.onCreate() 内部会把主题从启动画面切换成运行主题（NoActionBar），
        // 必须在它之后再开启边到边，否则窗口仍按启动主题的黑色背景绘制，状态栏下出现黑条。
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
    }
}
