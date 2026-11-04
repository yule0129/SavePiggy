package cn.savepiggy.capture;

public final class PaymentParserTest {
    public static void main(String[] args) {
        equal(1, PaymentParser.candidateAmount("微信支付", "支付成功 ¥0.01"));
        equal(2800, PaymentParser.candidateAmount("微信支付", "付款成功 28.00 元"));
        equal(0, PaymentParser.candidateAmount("朋友", "微信支付成功 ¥28.00"));
        for (String kind : new String[]{"转账", "红包", "退款", "收款成功", "支付失败", "已关闭", "美元"}) {
            equal(0, PaymentParser.candidateAmount("微信支付", kind + " ¥28.00"));
        }
        equal(0, PaymentParser.candidateAmount("微信支付", "付款 ¥28.00 余额 ¥100.00"));
        equal(0, PaymentParser.candidateAmount("微信支付", "付款 ¥1,234.56元"));
        equal(0, PaymentParser.candidateAmount("微信支付", "付款 ¥28.001"));
        equal(0, PaymentParser.candidateAmount("微信支付", "订单 123456"));
        equal(2800, PaymentParser.candidateAmount("微信支付", "金额 ¥28.00 28.00元"));
        System.out.println("PASS: payment candidate parsing, ambiguity rejection, transfer/refund exclusion");
    }
    private static void equal(int expected, int actual) {
        if (expected != actual) throw new AssertionError("expected " + expected + ", received " + actual);
    }
}
