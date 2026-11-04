package cn.savepiggy.notificationprobe;
import java.util.Arrays;
public final class PaymentTextTest {
    public static void main(String[] args) {
        require(PaymentText.acceptsTitle("微信支付"));
        require(PaymentText.acceptsTitle("WeChat Pay"));
        require(!PaymentText.acceptsTitle("朋友说微信支付成功"));
        require(!PaymentText.acceptsTitle("普通聊天"));
        require(PaymentText.amounts("支付 ¥28.00，另有 6 元").equals(Arrays.asList("28.00", "6")));
        require(PaymentText.amounts("2026-11-04 编号 123456").isEmpty());
        require(PaymentText.amounts("¥28.001").isEmpty());
        require(PaymentText.amounts("¥28.00 ¥28.00").size() == 1);
        System.out.println("PASS: exact title filtering and candidate amount extraction");
    }
    private static void require(boolean result) { if (!result) throw new AssertionError("Payment text test failed"); }
}
