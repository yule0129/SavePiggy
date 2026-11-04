package cn.savepiggy.notificationprobe;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class PaymentText {
    static boolean acceptsTitle(String title) {
        return "微信支付".equals(title) || "WeChat Pay".equals(title);
    }
    static List<String> amounts(String text) {
        Pattern pattern = Pattern.compile("[¥￥]\\s*(\\d+(?:\\.\\d{1,2})?)(?![\\d.])|(?<![\\d.])(\\d+(?:\\.\\d{1,2})?)\\s*元");
        Matcher match = pattern.matcher(text);
        LinkedHashSet<String> values = new LinkedHashSet<>();
        while (match.find() && values.size() < 5) values.add(match.group(1) != null ? match.group(1) : match.group(2));
        return new ArrayList<>(values);
    }
}
