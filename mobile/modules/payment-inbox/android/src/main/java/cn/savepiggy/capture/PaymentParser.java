package cn.savepiggy.capture;

import java.util.LinkedHashSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.math.BigDecimal;

/** Conservative candidate parsing, never confirmation of a completed expense. */
public final class PaymentParser {
    public static int candidateAmount(String title, String body) {
        if (!("微信支付".equals(title) || "WeChat Pay".equals(title))) return 0;
        for (String excluded : new String[]{"转账", "红包", "退款", "收款成功", "已收款", "收到了", "到账", "付款失败", "支付失败", "已关闭", "美元", "港币", "日元", "欧元", "英镑", "USD", "HKD", "JPY", "EUR"}) {
            if (body.contains(excluded)) return 0;
        }
        Matcher matcher = Pattern.compile("[¥￥]\\s*(\\d+(?:\\.\\d{1,2})?)(?![\\d.,])|(?<![\\d.,])(\\d+(?:\\.\\d{1,2})?)\\s*元").matcher(body);
        LinkedHashSet<Integer> amounts = new LinkedHashSet<>();
        while (matcher.find()) {
            try {
                BigDecimal amount = new BigDecimal(matcher.group(1) != null ? matcher.group(1) : matcher.group(2));
                int fen = amount.movePointRight(2).intValueExact();
                if (fen > 0 && fen <= 999999999) amounts.add(fen);
                else return 0;
            } catch (Exception ignored) { return 0; }
        }
        return amounts.size() == 1 ? amounts.iterator().next() : 0;
    }
}
