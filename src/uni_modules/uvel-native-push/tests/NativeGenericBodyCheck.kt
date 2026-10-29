package uts.sdk.modules.uvelNativePush

fun main() {
    val english = "You have a new notification. Open UVEL to view it."
    val vietnamese = "Bạn có thông báo mới. Mở UVEL để xem."
    val chinese = "您有一条新通知，请打开 UVEL 查看。"
    check(genericNotificationBody(vietnamese) == vietnamese)
    check(genericNotificationBody(chinese) == chinese)
    check(genericNotificationBody(english) == english)
    check(genericNotificationBody(null) == english)
    check(genericNotificationBody("Your account balance is 123 USDT") == english)
    check(genericNotificationBody("$vietnamese Sensitive suffix") == english)
    println("PASS: account-language generic bodies retained; unknown/private copy replaced with generic English")
}
